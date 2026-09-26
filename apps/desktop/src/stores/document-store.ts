import { mapConcurrent } from "@/lib/map-concurrent";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  scanProjectFolder,
  readTexFileContent,
  writeTexFileContent,
  readImageAsDataUrl,
  createFileOnDisk,
  copyFileToProject,
  deleteFileFromDisk,
  deleteFolderFromDisk,
  renameFileOnDisk,
  getUniqueTargetName,
  createDirectory,
  join,
  LARGE_FILE_THRESHOLD,
  type ProjectFileType,
} from "@/lib/tauri/fs";
import { useHistoryStore } from "@/stores/history-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { clearDocCache } from "@/lib/mupdf/pdf-doc-cache";
import { clearScrollPositionCache } from "@/lib/workspace-view-cache";
import { clearZoomCache } from "@/lib/workspace-view-cache";
import { clearEditorStateCache } from "@/lib/workspace-view-cache";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { inferCompileDocuments } from "@/lib/compile-documents";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("document");
const PROJECT_RENAME_LOCK_RETRY_DELAYS_MS = [150, 300, 600, 1000];

export interface ProjectFile {
  id: string; // relativePath is the id
  name: string;
  relativePath: string;
  absolutePath: string;
  type: ProjectFileType;
  content?: string;
  dataUrl?: string;
  isDirty: boolean;
  /** File size in bytes (from stat). Used to skip auto-loading large files. */
  fileSize?: number;
  modifiedMs?: number;
  revision?: number;
}

// ── PDF bytes cache (kept outside Zustand to avoid React diffing large buffers) ──
// Keyed by rootFileId. Consumers read via getPdfBytes() / getCurrentPdfBytes().
const _pdfBytesCache = new Map<string, Uint8Array>();
/** Current active PDF root file id (mirrors what Zustand tracks via pdfRevision). */
const _pdfVersions = new Map<string, number>();
let _pdfVersion = 0;
export const getPdfVersion = (id: string | null) =>
  id ? (_pdfVersions.get(id) ?? 0) : 0;
let _currentPdfRootId: string | null = null;

/** Get PDF bytes for a specific root file id. */
export function getPdfBytes(rootFileId: string): Uint8Array | undefined {
  return _pdfBytesCache.get(rootFileId);
}

/** Get the current active PDF bytes (convenience for components that don't know the rootId). */
export function getCurrentPdfBytes(): Uint8Array | null {
  return _currentPdfRootId
    ? (_pdfBytesCache.get(_currentPdfRootId) ?? null)
    : null;
}

/** Get the root file id for the currently displayed PDF, if any. */
export function getCurrentPdfRootId(): string | null {
  return _currentPdfRootId;
}

/** Check if any PDF data exists for the current root. */
export function hasPdfData(): boolean {
  return _currentPdfRootId != null && _pdfBytesCache.has(_currentPdfRootId);
}

/** Root file ids that currently have a compiled PDF in cache. */
export function listPdfRootIds(): string[] {
  return Array.from(_pdfBytesCache.keys());
}

export function clearPdfBytesCache() {
  _pdfBytesCache.clear();
  _pdfVersions.clear();
  _currentPdfRootId = null;
}

interface DocumentState {
  projectRoot: string | null;
  files: ProjectFile[];
  folders: string[];
  activeFileId: string;
  openFileIds: string[];
  compilingRootIds: string[];
  cursorPosition: number;
  selectionRange: { start: number; end: number } | null;
  jumpToPosition: number | null;
  jumpToFileId: string | null;
  isThreadOpen: boolean;
  /** Bumped whenever PDF bytes change — triggers re-render without storing bytes in state. */
  pdfRevision: number;
  compileError: string | null;
  isCompiling: boolean;
  /** When true, a recompile will be triggered after the current compile finishes. */
  pendingRecompile: boolean;
  isSaving: boolean;
  initialized: boolean;
  /** Incremented on every file content change; used to skip no-op recompiles. */
  contentGeneration: number;
  /** Per-root-file cache: rootFileId → compile error message. */
  compileErrorCache: Map<string, string>;
  /** Per-root-file: rootFileId → contentGeneration at last successful compile. */
  lastCompiledGenerations: Map<string, number>;

  openProject: (rootPath: string) => Promise<void>;
  renameProject: (newName: string) => Promise<void>;
  closeProject: () => Promise<void>;
  projectEpoch: number;
  saveError: string | null;
  setActiveFile: (id: string) => void;
  openFileInTab: (id: string) => void;
  replaceOpenFile: (id: string) => void;
  closeFileTab: (id: string) => void;
  setPreviewRoot: (id: string) => void;
  applyPreviewSnapshot: (snapshot: {
    projectRoot: string | null;
    files: Array<{
      id: string;
      name: string;
      relativePath: string;
      absolutePath: string;
      type: ProjectFileType;
      content?: string;
    }>;
    activeFileId: string;
    openFileIds: string[];
    pdfRootId: string | null;
    pdfRevision: number;
    compileError: string | null;
    isCompiling: boolean;
  }) => void;
  startCompile: (rootId: string) => void;
  endCompile: (rootId: string) => void;
  addFile: (
    file: Omit<ProjectFile, "id" | "isDirty">,
    opts?: { activate?: boolean },
  ) => string;
  deleteFile: (id: string) => void;
  deleteFolder: (folderPath: string) => Promise<void>;
  renameFile: (id: string, name: string) => void;
  updateFileContent: (id: string, content: string) => void;
  updateImageDataUrl: (id: string, dataUrl: string) => void;
  setCursorPosition: (position: number) => void;
  setSelectionRange: (range: { start: number; end: number } | null) => void;
  requestJumpToPosition: (position: number, fileId?: string) => void;
  clearJumpRequest: () => void;
  setThreadOpen: (open: boolean) => void;
  setPdfData: (
    data: Uint8Array | null,
    rootFileId?: string,
    generation?: number,
  ) => void;
  setCompileError: (error: string | null, rootFileId?: string) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setPendingRecompile: (pending: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  insertAtCursor: (text: string) => void;
  replaceSelection: (start: number, end: number, text: string) => void;
  findAndReplace: (find: string, replace: string) => boolean;
  setInitialized: () => void;
  saveFile: (id: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  createNewFile: (
    name: string,
    type: "tex" | "image",
    folder?: string,
  ) => Promise<void>;
  createFolder: (name: string, parentFolder?: string) => Promise<void>;
  importFiles: (
    sourcePaths: string[],
    targetFolder?: string,
  ) => Promise<string[]>;
  moveFile: (fileId: string, targetFolder: string | null) => Promise<void>;
  moveFolder: (
    folderPath: string,
    targetFolder: string | null,
  ) => Promise<void>;
  reloadFile: (relativePath: string) => Promise<void>;
  refreshFiles: (force?: boolean) => Promise<void>;
  /** Load content for a file that was skipped during project open (large file). */
  loadFileContent: (id: string) => Promise<void>;

  get fileName(): string;
  get content(): string;
  setFileName: (name: string) => void;
  setContent: (content: string) => void;
}

function getActiveFile(state: { files: ProjectFile[]; activeFileId: string }) {
  return state.files.find((f) => f.id === state.activeFileId);
}

/**
 * Resolve the root .tex file for compilation.
 *
 * Priority order:
 * 1. `% !TEX root = <file>` magic comment in the first 20 lines of the active file
 * 2. The file itself, if it contains `\documentclass`
 * 3. The nearest ancestor's `main.tex` or `document.tex` with `\documentclass`
 * 4. Any other .tex file in the project that contains `\documentclass`
 * 5. Fallback: the active file itself
 */
function normalizeProjectPath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

export function resolveTexRoot(fileId: string, files: ProjectFile[]): string {
  const file = files.find((f) => f.id === fileId);
  if (!file || file.type !== "tex" || file.content == null) return fileId;
  const parentParts = file.relativePath
    .replace(/\\/g, "/")
    .split("/")
    .slice(0, -1);

  // 1. Check for % !TEX root magic comment
  const lines = file.content.split("\n").slice(0, 20);
  for (const line of lines) {
    const match = line.match(/^%\s*!TEX\s+root\s*=\s*(.+)/i);
    if (match) {
      const rootPath = match[1].trim();
      // Resolve relative to the current file first, then its ancestors.
      // A basename alone is ambiguous when several papers have main.tex.
      for (let depth = parentParts.length; depth >= 0; depth--) {
        const path = normalizeProjectPath(
          [...parentParts.slice(0, depth), rootPath].join("/"),
        );
        const target = files.find(
          (f) => f.relativePath.replace(/\\/g, "/") === path,
        );
        if (target?.type === "tex") return target.id;
      }
    }
  }

  // 2. If the current file contains \documentclass, it is a root file
  if (/\\documentclass[\s{[]/.test(file.content)) {
    return fileId;
  }

  // 3. A folder can contain several independent papers named main.tex.
  // Walk toward the project root so a section selects its own paper.
  while (true) {
    for (const name of ["main.tex", "document.tex"]) {
      const path = [...parentParts, name].join("/");
      const root = files.find(
        (f) =>
          f.relativePath.replace(/\\/g, "/") === path &&
          f.type === "tex" &&
          f.content &&
          /\\documentclass[\s{[]/.test(f.content),
      );
      if (root) return root.id;
    }
    if (parentParts.length === 0) break;
    parentParts.pop();
  }

  // 4. Any .tex file with \documentclass
  const anyRoot = files.find(
    (f) =>
      f.type === "tex" &&
      f.id !== fileId &&
      f.content &&
      /\\documentclass[\s{[]/.test(f.content),
  );
  if (anyRoot) return anyRoot.id;

  // 5. Fallback: the active file itself
  return fileId;
}

/** Re-key the external PDF bytes cache when a file is renamed/moved. */
function migratePdfBytesKey(oldKey: string, newKey: string) {
  if (!_pdfBytesCache.has(oldKey)) return;
  const bytes = _pdfBytesCache.get(oldKey)!;
  _pdfBytesCache.delete(oldKey);
  _pdfBytesCache.set(newKey, bytes);
  if (_currentPdfRootId === oldKey) _currentPdfRootId = newKey;
}

/** Re-key a Map entry when a file is renamed/moved. */
function migrateCacheKey<V>(
  map: Map<string, V>,
  oldKey: string,
  newKey: string,
): Map<string, V> {
  if (!map.has(oldKey)) return map;
  const copy = new Map(map);
  const val = copy.get(oldKey)!;
  copy.delete(oldKey);
  copy.set(newKey, val);
  return copy;
}

function normalizeProjectRoot(rootPath: string): string {
  return rootPath.replace(/[\\/]+$/, "");
}

function splitProjectRoot(rootPath: string): {
  parentPath: string;
  folderName: string;
  separator: string;
} {
  const normalized = normalizeProjectRoot(rootPath);
  const lastSep = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  if (lastSep < 0) {
    throw new Error("Project path has no parent folder");
  }

  const separator = normalized[lastSep];
  return {
    parentPath: lastSep === 0 ? separator : normalized.slice(0, lastSep),
    folderName: normalized.slice(lastSep + 1),
    separator,
  };
}

function buildRenamedProjectRoot(rootPath: string, newName: string): string {
  const name = newName.trim();
  if (!name) throw new Error("Project name cannot be empty");
  if (name === "." || name === "..") {
    throw new Error("Project name cannot be . or ..");
  }
  if (/[\\/<>:"|?*]/.test(name) || /[\s.]$/.test(name)) {
    throw new Error("Project name contains characters Windows cannot use");
  }

  const { parentPath, folderName, separator } = splitProjectRoot(rootPath);
  if (name === folderName) return normalizeProjectRoot(rootPath);
  return `${parentPath}${parentPath.endsWith(separator) ? "" : separator}${name}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWindowsFolderLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("os error 32") ||
    message.includes("being used by another process") ||
    message.includes("another program is using") ||
    message.includes("进程无法访问") ||
    message.includes("另一个程序正在使用")
  );
}

function formatProjectRenameError(error: unknown): string {
  if (isWindowsFolderLockError(error)) {
    return [
      "Project folder is still in use.",
      "Close any external PDF viewer, terminal, Python process, or file explorer preview using this project, then try again.",
    ].join(" ");
  }
  return error instanceof Error ? error.message : String(error);
}

async function renameProjectRootWithRetry(
  oldRoot: string,
  newRoot: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFileOnDisk(oldRoot, newRoot);
      return;
    } catch (error) {
      const delay = PROJECT_RENAME_LOCK_RETRY_DELAYS_MS[attempt];
      if (!isWindowsFolderLockError(error) || delay == null) {
        throw new Error(formatProjectRenameError(error));
      }
      await sleep(delay);
    }
  }
}

async function waitForCompileToFinish(
  getState: () => DocumentState,
): Promise<void> {
  const started = Date.now();
  while (getState().isCompiling) {
    if (Date.now() - started > 10_000) {
      throw new Error(
        "Compilation is still running. Wait for it to finish before renaming the project.",
      );
    }
    await sleep(200);
  }
}

// Auto-save: debounced save 2 seconds after last content change
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
// Auto version snapshot in jj mode: 30s after last edit
let autoSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SNAPSHOT_MS = 30_000;
// Store reference set after creation to avoid TDZ issues
let storeRef: typeof useDocumentStore | null = null;

function clearAutoTimers() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (autoSnapshotTimer) {
    clearTimeout(autoSnapshotTimer);
    autoSnapshotTimer = null;
  }
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const store = storeRef;
    if (!store) return;
    const state = store.getState();
    const dirtyFiles = state.files.filter(
      (f) => f.isDirty && f.content != null,
    );
    if (dirtyFiles.length > 0) {
      await state.saveAllFiles().catch(() => {});
    }
  }, 2000);
  if (autoSnapshotTimer) clearTimeout(autoSnapshotTimer);
  autoSnapshotTimer = setTimeout(async () => {
    const store = storeRef;
    if (!store) return;
    const state = store.getState();
    if (!state.projectRoot) return;
    const dirtyFiles = state.files.filter(
      (f) => f.isDirty && f.content != null,
    );
    if (dirtyFiles.length > 0) {
      try {
        await state.saveAllFiles();
      } catch {
        return;
      }
    }
    try {
      await useHistoryStore
        .getState()
        .createSnapshot(state.projectRoot, "[auto] Edit");
    } catch {
      // Snapshot failure should not break editing
    }
  }, AUTO_SNAPSHOT_MS);
}

const pendingWrites = new Map<string, Promise<void>>();
let refreshSequence = 0;

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  projectRoot: null,
  projectEpoch: 0,
  saveError: null,
  files: [],
  folders: [],
  activeFileId: "",
  openFileIds: [],
  compilingRootIds: [],
  cursorPosition: 0,
  selectionRange: null,
  jumpToPosition: null,
  jumpToFileId: null,
  isThreadOpen: false,
  pdfRevision: 0,
  compileError: null,
  isCompiling: false,
  pendingRecompile: false,
  isSaving: false,
  initialized: false,
  contentGeneration: 0,
  compileErrorCache: new Map(),
  lastCompiledGenerations: new Map(),

  openProject: async (rootPath: string) => {
    log.info(`Opening project: ${rootPath}`);
    if (get().files.some((file) => file.isDirty)) await get().saveAllFiles();
    const epoch = get().projectEpoch + 1;
    set({ projectEpoch: epoch });
    await invoke("allow_project_directory", { rootPath });
    const { files: fsFiles, folders: fsFolders } =
      await scanProjectFolder(rootPath);
    const projectFiles: ProjectFile[] = [];

    for (const f of fsFiles) {
      const pf: ProjectFile = {
        id: f.relativePath,
        name: f.relativePath.split(/[/\\]/).pop() || f.relativePath,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        type: f.type,
        isDirty: false,
        fileSize: f.fileSize,
        modifiedMs: f.modifiedMs,
        revision: 0,
      };

      // Load content for text-based files (skip large non-essential files)
      if (
        f.type === "tex" ||
        f.type === "bib" ||
        f.type === "style" ||
        f.type === "other"
      ) {
        const isLargeNonEssential =
          f.type === "other" && f.fileSize > LARGE_FILE_THRESHOLD;
        if (!isLargeNonEssential) {
          try {
            pf.content = await readTexFileContent(f.absolutePath);
          } catch {
            pf.content = "";
          }
        }
        // Large "other" files: content stays undefined, loaded on-demand via loadFileContent
      }

      // Load dataUrl for image files (skip very large images)
      if (f.type === "image") {
        if (f.fileSize <= LARGE_FILE_THRESHOLD) {
          try {
            pf.dataUrl = await readImageAsDataUrl(f.absolutePath);
          } catch {
            // Image loading failed, that's ok
          }
        }
      }

      // PDF files are loaded on-demand via readFile in InlinePdfContent

      projectFiles.push(pf);
    }

    const settings = useSettingsStore.getState();
    const storedMains = (settings.compileDocumentsByProject[rootPath] ?? [])
      .map((doc) => doc.mainFile)
      .filter((path) => projectFiles.some((file) => file.id === path));
    const inferredMains = inferCompileDocuments(
      projectFiles,
      settings.citationFile,
    )
      .map((doc) => doc.mainFile)
      .filter((path) => projectFiles.some((file) => file.id === path));
    const configuredMains =
      storedMains.length > 0 ? storedMains : inferredMains;
    const mainTex =
      projectFiles.find((f) => configuredMains.includes(f.id)) ||
      projectFiles.find(
        (f) => f.name === "main.tex" || f.name === "document.tex",
      ) ||
      projectFiles.find((f) => f.type === "tex");
    const openFileIds =
      configuredMains.length > 0
        ? configuredMains
        : mainTex?.id
          ? [mainTex.id]
          : projectFiles[0]?.id
            ? [projectFiles[0].id]
            : [];

    if (get().projectEpoch !== epoch) return;
    await get().saveAllFiles();
    if (get().projectEpoch !== epoch) return;
    clearScrollPositionCache();
    clearZoomCache();
    clearEditorStateCache();
    clearPdfBytesCache();
    void clearDocCache();
    set({
      isCompiling: false,
      pendingRecompile: false,
      saveError: null,
      projectRoot: rootPath,
      files: projectFiles,
      folders: fsFolders,
      activeFileId: openFileIds[0] || mainTex?.id || projectFiles[0]?.id || "",
      openFileIds,
      compilingRootIds: [],
      pdfRevision: 0,
      compileError: null,
      compileErrorCache: new Map(),
      lastCompiledGenerations: new Map(),
      initialized: true,
      cursorPosition: 0,
      selectionRange: null,
    });

    // Initialize history system early so snapshots work before the panel is opened
    const historyStore = useHistoryStore.getState();
    historyStore
      .init(rootPath)
      .then(() => historyStore.loadSnapshots(rootPath))
      .catch((err) => {
        log.error("Failed to initialize history", { error: String(err) });
      });
  },

  renameProject: async (newName: string) => {
    const state = get();
    if (!state.projectRoot) throw new Error("No project open");

    const oldRoot = state.projectRoot;
    const newRoot = buildRenamedProjectRoot(oldRoot, newName);
    if (newRoot === normalizeProjectRoot(oldRoot)) return;

    clearAutoTimers();
    await waitForCompileToFinish(get);

    const chatState = useClaudeChatStore.getState();
    const streamingTabs =
      "tabs" in chatState && Array.isArray(chatState.tabs)
        ? chatState.tabs.filter((tab) => tab.isStreaming)
        : [];
    if (streamingTabs.length > 0) {
      await Promise.all(
        streamingTabs.map((tab) =>
          invoke("cancel_claude_execution", { tabId: tab.id }).catch(() => {}),
        ),
      );
      await sleep(250);
    }

    await state.saveAllFiles();
    const dirtyFiles = get().files.filter(
      (f) => f.isDirty && f.content != null,
    );
    if (dirtyFiles.length > 0) {
      throw new Error("Save failed. Please save changes before renaming.");
    }

    clearPdfBytesCache();
    clearScrollPositionCache();
    clearZoomCache();
    clearEditorStateCache();
    useHistoryStore.getState().reset();
    set((s) => ({
      pdfRevision: s.pdfRevision + 1,
      compileError: null,
      compileErrorCache: new Map(),
      lastCompiledGenerations: new Map(),
    }));
    await clearDocCache();
    await sleep(150);

    await renameProjectRootWithRetry(oldRoot, newRoot);
    try {
      await invoke("migrate_project_sessions", {
        oldProjectPath: oldRoot,
        newProjectPath: newRoot,
      });
    } catch (err) {
      log.warn("Failed to migrate project sessions after rename", {
        oldRoot,
        newRoot,
        error: String(err),
      });
    }
    const projectStore = useProjectStore.getState();
    projectStore.renameRecentProject(oldRoot, newRoot);
    projectStore.setLastProjectFolder(splitProjectRoot(newRoot).parentPath);

    await get().openProject(newRoot);
  },

  closeProject: async () => {
    const epoch = get().projectEpoch;
    await get().saveAllFiles();
    if (get().projectEpoch !== epoch) return;
    log.info("Closing project");
    clearAutoTimers();
    void clearDocCache();
    clearScrollPositionCache();
    clearZoomCache();
    clearEditorStateCache();
    clearPdfBytesCache();
    set({
      projectRoot: null,
      projectEpoch: epoch + 1,
      isCompiling: false,
      pendingRecompile: false,
      files: [],
      folders: [],
      activeFileId: "",
      openFileIds: [],
      compilingRootIds: [],
      pdfRevision: 0,
      compileError: null,
      compileErrorCache: new Map(),
      lastCompiledGenerations: new Map(),
      initialized: false,
    });
    // Reset chat session so stale messages don't leak into the next project
    useClaudeChatStore.getState().newSession();
  },

  openFileInTab: (id) => {
    const state = get();
    if (!state.files.some((file) => file.id === id)) return;
    const openFileIds = state.openFileIds.includes(id)
      ? state.openFileIds
      : [...state.openFileIds, id];
    set({ openFileIds });
    get().setActiveFile(id);
  },

  replaceOpenFile: (id) => {
    const state = get();
    if (!state.files.some((file) => file.id === id)) return;
    if (state.openFileIds.includes(id)) {
      get().setActiveFile(id);
      return;
    }
    let openFileIds = state.openFileIds;
    if (openFileIds.length === 0) {
      openFileIds = [id];
    } else if (openFileIds.includes(state.activeFileId)) {
      openFileIds = openFileIds.map((item) =>
        item === state.activeFileId ? id : item,
      );
    } else {
      openFileIds = [...openFileIds, id];
    }
    set({ openFileIds });
    get().setActiveFile(id);
  },

  closeFileTab: (id) => {
    const state = get();
    if (state.openFileIds.length <= 1) return;
    if (!state.openFileIds.includes(id)) return;
    const openFileIds = state.openFileIds.filter((item) => item !== id);
    const stillNeedsPdf = openFileIds.some(
      (fileId) => resolveTexRoot(fileId, state.files) === id,
    );
    set({ openFileIds });
    if (_pdfBytesCache.has(id) && !stillNeedsPdf) {
      get().setPdfData(null, id);
    }
    if (state.activeFileId === id) {
      get().setActiveFile(openFileIds[openFileIds.length - 1]);
    }
  },

  applyPreviewSnapshot: (snapshot) => {
    if (snapshot.projectRoot !== get().projectRoot) {
      clearPdfBytesCache();
      void clearDocCache();
    }
    _currentPdfRootId = snapshot.pdfRootId;
    set({
      projectRoot: snapshot.projectRoot,
      files: snapshot.files.map((file) => ({
        ...file,
        isDirty: false,
      })),
      activeFileId: snapshot.activeFileId,
      openFileIds: snapshot.openFileIds,
      pdfRevision: snapshot.pdfRevision,
      compileError: snapshot.compileError,
      isCompiling: snapshot.isCompiling,
      compilingRootIds: snapshot.isCompiling
        ? snapshot.pdfRootId
          ? [snapshot.pdfRootId]
          : []
        : [],
      initialized: true,
    });
  },

  setPreviewRoot: (id) => {
    if (!_pdfBytesCache.has(id)) return;
    const changed = _currentPdfRootId !== id;
    _currentPdfRootId = id;
    const cachedError = get().compileErrorCache.get(id) ?? null;
    set((s) => ({
      compileError: cachedError,
      ...(changed ? { pdfRevision: s.pdfRevision + 1 } : {}),
    }));
  },

  startCompile: (rootId) => {
    set((s) => {
      const compilingRootIds = s.compilingRootIds.includes(rootId)
        ? s.compilingRootIds
        : [...s.compilingRootIds, rootId];
      return { compilingRootIds, isCompiling: compilingRootIds.length > 0 };
    });
  },

  endCompile: (rootId) => {
    set((s) => {
      const compilingRootIds = s.compilingRootIds.filter(
        (item) => item !== rootId,
      );
      return { compilingRootIds, isCompiling: compilingRootIds.length > 0 };
    });
  },

  setActiveFile: (id) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || file.type !== "tex") {
      set({
        activeFileId: id,
        selectionRange: null,
      });
      return;
    }

    const rootId = resolveTexRoot(id, state.files);
    const newPdfRootId = _pdfBytesCache.has(rootId) ? rootId : null;
    const pdfRootChanged = newPdfRootId !== _currentPdfRootId;
    _currentPdfRootId = newPdfRootId;
    const cachedError = state.compileErrorCache.get(rootId) ?? null;
    set((s) => ({
      activeFileId: id,
      selectionRange: null,
      ...(pdfRootChanged ? { pdfRevision: s.pdfRevision + 1 } : {}),
      compileError: cachedError,
    }));
  },

  setSelectionRange: (range) => set({ selectionRange: range }),

  requestJumpToPosition: (position, fileId) =>
    set({
      jumpToPosition: position,
      jumpToFileId: fileId ?? get().activeFileId,
    }),

  clearJumpRequest: () => set({ jumpToPosition: null, jumpToFileId: null }),

  addFile: (file, opts) => {
    const id = file.relativePath;
    const activate = opts?.activate !== false;
    set((state) => ({
      files: [...state.files, { ...file, id, isDirty: false }],
      ...(activate
        ? {
            activeFileId: id,
            openFileIds: state.openFileIds.includes(id)
              ? state.openFileIds
              : [...state.openFileIds, id],
          }
        : {}),
    }));
    return id;
  },

  deleteFile: async (id) => {
    const state = get();
    if (state.files.length <= 1) return;
    const file = state.files.find((f) => f.id === id);
    if (file) {
      try {
        await deleteFileFromDisk(file.absolutePath);
      } catch (e) {
        log.error("Failed to delete file from disk", { error: String(e) });
      }
    }
    const newFiles = state.files.filter((f) => f.id !== id);
    const newActiveId =
      state.activeFileId === id ? newFiles[0].id : state.activeFileId;
    const compileErrorCache = new Map(state.compileErrorCache);
    const lastCompiledGenerations = new Map(state.lastCompiledGenerations);
    _pdfBytesCache.delete(id);
    compileErrorCache.delete(id);
    lastCompiledGenerations.delete(id);
    // If the deleted file was active, show the new active file's cached PDF
    const switchingActive = state.activeFileId === id;
    const newRootId = switchingActive
      ? resolveTexRoot(newActiveId, newFiles)
      : undefined;
    if (switchingActive && newRootId) {
      _currentPdfRootId = _pdfBytesCache.has(newRootId) ? newRootId : null;
    }
    const openFileIds = (
      state.openFileIds.includes(newActiveId)
        ? state.openFileIds.filter((item) => item !== id)
        : [...state.openFileIds.filter((item) => item !== id), newActiveId]
    ).filter((item) => newFiles.some((file) => file.id === item));
    set((s) => ({
      files: newFiles,
      activeFileId: newActiveId,
      openFileIds: openFileIds.length > 0 ? openFileIds : [newActiveId],
      compileErrorCache,
      lastCompiledGenerations,
      ...(switchingActive ? { pdfRevision: s.pdfRevision + 1 } : {}),
      ...(switchingActive && newRootId
        ? {
            compileError: compileErrorCache.get(newRootId) ?? null,
          }
        : {}),
    }));
  },

  deleteFolder: async (folderPath) => {
    const state = get();
    if (!state.projectRoot) return;
    const prefix = `${folderPath}/`;
    const filesToRemove = state.files.filter((f) =>
      f.relativePath.startsWith(prefix),
    );
    const remainingFiles = state.files.filter(
      (f) => !f.relativePath.startsWith(prefix),
    );
    // Must keep at least one file
    if (remainingFiles.length === 0) return;

    // Delete folder from disk (recursive)
    try {
      const absPath = await join(state.projectRoot, folderPath);
      await deleteFolderFromDisk(absPath);
    } catch (e) {
      log.error("Failed to delete folder from disk", { error: String(e) });
    }

    // Clean caches
    const compileErrorCache = new Map(state.compileErrorCache);
    const lastCompiledGenerations = new Map(state.lastCompiledGenerations);
    for (const f of filesToRemove) {
      _pdfBytesCache.delete(f.id);
      compileErrorCache.delete(f.id);
      lastCompiledGenerations.delete(f.id);
    }

    const removedIds = new Set(filesToRemove.map((f) => f.id));
    const newActiveId = removedIds.has(state.activeFileId)
      ? remainingFiles[0].id
      : state.activeFileId;
    const switchingActive = newActiveId !== state.activeFileId;
    const newRootId = switchingActive
      ? resolveTexRoot(newActiveId, remainingFiles)
      : undefined;
    if (switchingActive && newRootId) {
      _currentPdfRootId = _pdfBytesCache.has(newRootId) ? newRootId : null;
    }

    // Remove folder from folders list
    const newFolders = state.folders.filter(
      (f) => f !== folderPath && !f.startsWith(prefix),
    ); // include exact match since folders list contains folder paths directly

    set((s) => ({
      files: remainingFiles,
      folders: newFolders,
      activeFileId: newActiveId,
      compileErrorCache,
      lastCompiledGenerations,
      ...(switchingActive ? { pdfRevision: s.pdfRevision + 1 } : {}),
      ...(switchingActive && newRootId
        ? {
            compileError: compileErrorCache.get(newRootId) ?? null,
          }
        : {}),
    }));
  },

  renameFile: async (id, name) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || !state.projectRoot) return;

    const dir = file.relativePath.includes("/")
      ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
      : "";
    const newRelativePath = dir ? `${dir}/${name}` : name;

    const newAbsPath = await join(state.projectRoot, newRelativePath);
    try {
      await renameFileOnDisk(file.absolutePath, newAbsPath);
    } catch (e) {
      log.error("Failed to rename file on disk", { error: String(e) });
      return;
    }
    migratePdfBytesKey(id, newRelativePath);
    set((s) => {
      const compileErrorCache = migrateCacheKey(
        s.compileErrorCache,
        id,
        newRelativePath,
      );
      const lastCompiledGenerations = migrateCacheKey(
        s.lastCompiledGenerations,
        id,
        newRelativePath,
      );
      const isActive = s.activeFileId === id;
      return {
        files: s.files.map((f) =>
          f.id === id
            ? {
                ...f,
                name,
                relativePath: newRelativePath,
                absolutePath: newAbsPath,
                id: newRelativePath,
              }
            : f,
        ),
        activeFileId: isActive ? newRelativePath : s.activeFileId,
        compileErrorCache,
        lastCompiledGenerations,
      };
    });
  },

  updateFileContent: (id, content) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? { ...f, content, isDirty: true, revision: (f.revision ?? 0) + 1 }
          : f,
      ),
      contentGeneration: state.contentGeneration + 1,
    }));
    scheduleAutoSave();
  },

  updateImageDataUrl: (id, dataUrl) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, dataUrl } : f)),
    }));
  },

  setThreadOpen: (open) => set({ isThreadOpen: open }),

  setPdfData: (data, rootFileId, generation) => {
    const state = get();
    const activeRootId = resolveTexRoot(state.activeFileId, state.files);
    if (data) {
      const key = rootFileId ?? "__default__";
      _pdfBytesCache.set(key, data);
      _pdfVersions.set(key, ++_pdfVersion);
      // Parallel builds may finish in any order. A background result must not
      // replace the PDF the user selected (or the active editor's PDF).
      if (!rootFileId || (!_currentPdfRootId && activeRootId === key))
        _currentPdfRootId = key;
    } else if (rootFileId) {
      _pdfBytesCache.delete(rootFileId);
      if (_currentPdfRootId === rootFileId) _currentPdfRootId = null;
    } else {
      _currentPdfRootId = null;
    }
    const isVisibleRoot =
      rootFileId === _currentPdfRootId ||
      (!_currentPdfRootId && rootFileId === activeRootId);
    if (rootFileId) {
      if (data) {
        const compileErrorCache = new Map(state.compileErrorCache);
        const lastCompiledGenerations = new Map(state.lastCompiledGenerations);
        compileErrorCache.delete(rootFileId);
        lastCompiledGenerations.set(
          rootFileId,
          generation ?? state.contentGeneration,
        );
        set((prev) => ({
          pdfRevision: prev.pdfRevision + 1,
          compileError: isVisibleRoot ? null : prev.compileError,
          compileErrorCache,
          lastCompiledGenerations,
        }));
      } else {
        set((prev) => ({
          pdfRevision: prev.pdfRevision + 1,
          compileError: isVisibleRoot ? null : prev.compileError,
        }));
      }
    } else {
      set((prev) => ({
        pdfRevision: prev.pdfRevision + 1,
        compileError: null,
      }));
    }
  },

  setCompileError: (error, rootFileId?) => {
    if (rootFileId) {
      const state = get();
      const compileErrorCache = new Map(state.compileErrorCache);
      if (error) {
        compileErrorCache.set(rootFileId, error);
      } else {
        compileErrorCache.delete(rootFileId);
      }
      const visibleRootId =
        _currentPdfRootId ?? resolveTexRoot(state.activeFileId, state.files);
      set({
        compileErrorCache,
        ...(visibleRootId === rootFileId ? { compileError: error } : {}),
      });
    } else {
      set({ compileError: error });
    }
  },

  setIsCompiling: (isCompiling) =>
    set((s) => ({
      isCompiling,
      compilingRootIds: isCompiling ? s.compilingRootIds : [],
    })),
  setPendingRecompile: (pending) => set({ pendingRecompile: pending }),

  setIsSaving: (isSaving) => set({ isSaving }),

  setCursorPosition: (position) => set({ cursorPosition: position }),

  insertAtCursor: (text) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return;

    const content = activeFile.content ?? "";
    const { cursorPosition } = state;
    const newContent =
      content.slice(0, cursorPosition) + text + content.slice(cursorPosition);

    set({
      contentGeneration: state.contentGeneration + 1,
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? {
              ...f,
              content: newContent,
              isDirty: true,
              revision: (f.revision ?? 0) + 1,
            }
          : f,
      ),
      cursorPosition: cursorPosition + text.length,
    });
    scheduleAutoSave();
  },

  replaceSelection: (start, end, text) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return;

    const content = activeFile.content ?? "";
    const newContent = content.slice(0, start) + text + content.slice(end);

    set({
      contentGeneration: state.contentGeneration + 1,
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? {
              ...f,
              content: newContent,
              isDirty: true,
              revision: (f.revision ?? 0) + 1,
            }
          : f,
      ),
      cursorPosition: start + text.length,
    });
    scheduleAutoSave();
  },

  findAndReplace: (find, replace) => {
    const state = get();
    const activeFile = getActiveFile(state);
    if (!activeFile || activeFile.type === "image" || activeFile.type === "pdf")
      return false;

    const content = activeFile.content ?? "";
    if (!content.includes(find)) return false;

    const newContent = content.replace(find, replace);
    set({
      contentGeneration: state.contentGeneration + 1,
      files: state.files.map((f) =>
        f.id === activeFile.id
          ? {
              ...f,
              content: newContent,
              isDirty: true,
              revision: (f.revision ?? 0) + 1,
            }
          : f,
      ),
    });
    scheduleAutoSave();
    return true;
  },

  setInitialized: () => set({ initialized: true }),

  saveFile: async (id) => {
    const { projectEpoch: epoch, files } = get();
    const original = files.find((f) => f.id === id);
    if (!original || !original.isDirty || original.content == null) return;
    const path = original.absolutePath;
    const previous = pendingWrites.get(path) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        if (get().projectEpoch !== epoch) return;
        const file = get().files.find(
          (f) => f.id === id && f.absolutePath === path,
        );
        if (!file?.isDirty || file.content == null) return;
        await writeTexFileContent(path, file.content);
        if (get().projectEpoch !== epoch) return;
        set((state) => ({
          files: state.files.map((current) =>
            current.id === id &&
            current.absolutePath === path &&
            current.content === file.content &&
            current.revision === file.revision
              ? { ...current, isDirty: false, modifiedMs: undefined }
              : current,
          ),
        }));
      });
    pendingWrites.set(path, task);
    try {
      await task;
    } catch (error) {
      if (get().projectEpoch === epoch)
        set({ saveError: `Could not save ${original.name}: ${String(error)}` });
      throw error;
    } finally {
      if (pendingWrites.get(path) === task) pendingWrites.delete(path);
    }
  },

  saveAllFiles: async () => {
    const epoch = get().projectEpoch;
    while (get().projectEpoch === epoch) {
      const dirty = get().files.filter((f) => f.isDirty && f.content != null);
      if (dirty.length === 0) {
        set({ saveError: null });
        return;
      }
      const results = await Promise.allSettled(
        dirty.map((f) => get().saveFile(f.id)),
      );
      const failures = results.flatMap((result, i) =>
        result.status === "rejected" ? [dirty[i].name] : [],
      );
      if (failures.length)
        throw new Error(`Could not save: ${failures.join(", ")}`);
    }
  },

  saveCurrentFile: async () => {
    const state = get();
    await state.saveFile(state.activeFileId);
    // Manual save → immediate snapshot
    if (state.projectRoot) {
      try {
        await useHistoryStore
          .getState()
          .createSnapshot(state.projectRoot, "[manual] Save");
      } catch {
        // Snapshot failure should not break save
      }
    }
  },

  createNewFile: async (name, type, folder) => {
    const state = get();
    if (!state.projectRoot) return;

    const relativePath = folder ? `${folder}/${name}` : name;
    const isTexFile = name.endsWith(".tex") || name.endsWith(".ltx");
    const content = isTexFile
      ? `\\documentclass{article}\n\n\\begin{document}\n\n% Your content here\n\n\\end{document}\n`
      : "";

    const fullPath = await createFileOnDisk(
      state.projectRoot,
      relativePath,
      content,
    );

    set((s) => ({
      files: [
        ...s.files,
        {
          id: relativePath,
          name,
          relativePath,
          absolutePath: fullPath,
          type,
          content: type !== "image" ? content : undefined,
          isDirty: false,
        },
      ],
      activeFileId: relativePath,
    }));
  },

  createFolder: async (name, parentFolder) => {
    const state = get();
    if (!state.projectRoot) return;

    const relativePath = parentFolder ? `${parentFolder}/${name}` : name;
    const absolutePath = await join(state.projectRoot, relativePath);
    await createDirectory(absolutePath);
    set((s) => ({
      folders: [...s.folders, relativePath],
    }));
  },

  importFiles: async (sourcePaths, targetFolder) => {
    const state = get();
    if (!state.projectRoot) return [];

    const importedPaths: string[] = [];
    for (const sourcePath of sourcePaths) {
      // Handle both Unix (/) and Windows (\) path separators
      const fileName = sourcePath.split(/[/\\]/).pop() || sourcePath;
      const targetName = targetFolder
        ? `${targetFolder}/${fileName}`
        : fileName;
      // copyFileToProject returns the actual (possibly deduplicated) relative path
      const actualName = await copyFileToProject(
        state.projectRoot,
        sourcePath,
        targetName,
      );
      importedPaths.push(actualName);
    }
    await state.refreshFiles();
    return importedPaths;
  },

  moveFile: async (fileId, targetFolder) => {
    const state = get();
    const file = state.files.find((f) => f.id === fileId);
    if (!file || !state.projectRoot) return;

    const desiredPath = targetFolder
      ? `${targetFolder}/${file.name}`
      : file.name;
    if (desiredPath === file.relativePath) return;

    // Auto-deduplicate if a file with the same name exists in the target
    const newRelativePath = await getUniqueTargetName(
      state.projectRoot,
      desiredPath,
    );
    const newAbsPath = await join(state.projectRoot, newRelativePath);
    await renameFileOnDisk(file.absolutePath, newAbsPath);

    const newName = newRelativePath.split(/[/\\]/).pop() || file.name;
    migratePdfBytesKey(fileId, newRelativePath);
    set((s) => {
      const compileErrorCache = migrateCacheKey(
        s.compileErrorCache,
        fileId,
        newRelativePath,
      );
      const lastCompiledGenerations = migrateCacheKey(
        s.lastCompiledGenerations,
        fileId,
        newRelativePath,
      );
      return {
        files: s.files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                name: newName,
                relativePath: newRelativePath,
                absolutePath: newAbsPath,
                id: newRelativePath,
              }
            : f,
        ),
        activeFileId:
          s.activeFileId === fileId ? newRelativePath : s.activeFileId,
        compileErrorCache,
        lastCompiledGenerations,
      };
    });
  },

  moveFolder: async (folderPath, targetFolder) => {
    const state = get();
    if (!state.projectRoot) return;

    const folderName = folderPath.split(/[/\\]/).pop()!;
    const newFolderPath = targetFolder
      ? `${targetFolder}/${folderName}`
      : folderName;
    if (newFolderPath === folderPath) return;
    // Prevent moving a folder into itself
    if (newFolderPath.startsWith(`${folderPath}/`)) return;

    const oldAbsPath = await join(state.projectRoot, folderPath);
    const newAbsPath = await join(state.projectRoot, newFolderPath);
    await renameFileOnDisk(oldAbsPath, newAbsPath);

    // Reload project to pick up all new paths
    await state.openProject(state.projectRoot);
  },

  reloadFile: async (relativePath) => {
    const state = get();
    const file = state.files.find((f) => f.relativePath === relativePath);
    if (!file) return;

    if (file.type === "tex" || file.type === "bib") {
      const content = await readTexFileContent(file.absolutePath);
      if (get().projectEpoch !== state.projectEpoch) return;
      set((s) => ({
        files: s.files.map((f) =>
          f === file && !f.isDirty
            ? { ...f, content, revision: (f.revision ?? 0) + 1 }
            : f,
        ),
        contentGeneration: s.contentGeneration + 1,
      }));
    }
  },

  refreshFiles: async (force = false) => {
    const { projectRoot, projectEpoch: epoch, files } = get();
    if (!projectRoot) return;
    const sequence = ++refreshSequence;
    const { files: diskFiles, folders } = await scanProjectFolder(projectRoot);
    const previous = new Map(files.map((file) => [file.relativePath, file]));
    const scanned = await mapConcurrent(diskFiles, 8, async (disk) => {
      const old = previous.get(disk.relativePath);
      if (old?.isDirty) return old;
      if (
        !force &&
        old &&
        disk.modifiedMs !== undefined &&
        old.modifiedMs === disk.modifiedMs &&
        old.fileSize === disk.fileSize
      )
        return old;
      const file: ProjectFile = {
        ...old,
        ...disk,
        id: disk.relativePath,
        name: disk.relativePath.split(/[/\\]/).pop() || disk.relativePath,
        isDirty: false,
      };
      if (
        ["tex", "bib", "style", "other"].includes(file.type) &&
        (file.type !== "other" ||
          disk.fileSize <= LARGE_FILE_THRESHOLD ||
          old?.content !== undefined)
      ) {
        try {
          file.content = await readTexFileContent(file.absolutePath);
        } catch {
          return old ?? file;
        }
      } else if (
        file.type === "image" &&
        disk.fileSize <= LARGE_FILE_THRESHOLD
      ) {
        try {
          file.dataUrl = await readImageAsDataUrl(file.absolutePath);
        } catch {
          return old ?? file;
        }
      }
      if (
        old &&
        old.content === file.content &&
        old.dataUrl === file.dataUrl &&
        old.fileSize === file.fileSize &&
        old.modifiedMs === file.modifiedMs
      )
        return old;
      file.revision =
        (old?.revision ?? 0) + (old?.content !== file.content ? 1 : 0);
      return file;
    });
    if (
      get().projectEpoch !== epoch ||
      get().projectRoot !== projectRoot ||
      sequence !== refreshSequence
    )
      return;
    set((state) => {
      const live = new Map(
        state.files.map((file) => [file.relativePath, file]),
      );
      const paths = new Set(scanned.map((file) => file.relativePath));
      const merged = scanned.flatMap((file) => {
        const current = live.get(file.relativePath);
        const old = previous.get(file.relativePath);
        // A rename/delete/edit during the scan takes precedence over the snapshot.
        if (old && !current) return [];
        return [
          current && (current.isDirty || current !== old) ? current : file,
        ];
      });
      for (const file of state.files) {
        if (
          !paths.has(file.relativePath) &&
          (file.isDirty || file !== previous.get(file.relativePath))
        )
          merged.push(file);
      }
      const sameFiles =
        merged.length === state.files.length &&
        merged.every((file, i) => file === state.files[i]);
      const sameFolders =
        folders.length === state.folders.length &&
        folders.every((folder, i) => folder === state.folders[i]);
      if (sameFiles && sameFolders) return state;
      const contentChanged =
        merged.length !== state.files.length ||
        merged.some((file) => {
          const old = live.get(file.relativePath);
          return (
            !old || old.content !== file.content || old.dataUrl !== file.dataUrl
          );
        });
      return {
        files: sameFiles ? state.files : merged,
        folders: sameFolders ? state.folders : folders,
        activeFileId: merged.some((file) => file.id === state.activeFileId)
          ? state.activeFileId
          : (merged[0]?.id ?? ""),
        contentGeneration: state.contentGeneration + (contentChanged ? 1 : 0),
      };
    });
  },

  loadFileContent: async (id) => {
    const state = get();
    const file = state.files.find((f) => f.id === id);
    if (!file || file.content !== undefined) return; // already loaded
    try {
      const content = await readTexFileContent(file.absolutePath);
      if (get().projectEpoch !== state.projectEpoch) return;
      set((s) => ({
        files: s.files.map((f) =>
          f === file && !f.isDirty ? { ...f, content } : f,
        ),
      }));
    } catch {
      set((s) => ({
        files: s.files.map((f) =>
          f === file && !f.isDirty ? { ...f, content: "" } : f,
        ),
      }));
    }
  },

  get fileName() {
    const activeFile = getActiveFile(get());
    return activeFile?.name ?? "main.tex";
  },

  get content() {
    const activeFile = getActiveFile(get());
    return activeFile?.content ?? "";
  },

  setFileName: (name) => {
    const state = get();
    set({
      files: state.files.map((f) =>
        f.id === state.activeFileId ? { ...f, name } : f,
      ),
    });
  },

  setContent: (content) => {
    const state = get();
    set({
      files: state.files.map((f) =>
        f.id === state.activeFileId
          ? { ...f, content, isDirty: true, revision: (f.revision ?? 0) + 1 }
          : f,
      ),
      contentGeneration: state.contentGeneration + 1,
    });
    scheduleAutoSave();
  },
}));

storeRef = useDocumentStore;
