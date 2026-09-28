import { useHistoryStore } from "@/stores/history-store";
import { invoke } from "@tauri-apps/api/core";
import {
  resolveTexRoot,
  useDocumentStore,
  type ProjectFile,
} from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createLogger } from "@/lib/debug/logger";
import type { CompilerBackend, TexEnginePref } from "@/stores/settings-store";

const log = createLogger("latex");

/** Resolve which file to compile and the root ID for caching.
 *  resolveTexRoot now handles \documentclass detection and main.tex fallback,
 *  so the only remaining fallback here is for projects with no .tex files.
 *  Returns `null` when the project has no compilable .tex file. */
export function resolveCompileTarget(
  activeFileId: string,
  files: ProjectFile[],
): { rootId: string; targetPath: string } | null {
  const rootId = resolveTexRoot(activeFileId, files);
  const rootEntry = files.find((f) => f.id === rootId);
  if (rootEntry?.type === "tex") {
    return { rootId, targetPath: rootEntry.relativePath };
  }
  // No .tex file exists — cannot compile
  const anyTex = files.find((f) => f.type === "tex");
  if (anyTex) {
    return { rootId: anyTex.id, targetPath: anyTex.relativePath };
  }
  return null;
}

/** Extract a human-readable error message from an unknown catch value. */
export function formatCompileError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Compilation failed";
}

export async function compileLatex(
  projectDir: string,
  mainFile: string = "main.tex",
  backend: CompilerBackend = "tectonic",
  engine: TexEnginePref = "auto",
): Promise<Uint8Array> {
  log.info(`Compiling ${mainFile} (backend: ${backend}, engine: ${engine})`);
  const start = performance.now();
  // compile_latex returns raw PDF bytes via Tauri IPC Response
  const buffer = await invoke<ArrayBuffer>("compile_latex", {
    projectDir,
    mainFile,
    backend,
    engine,
    useTexlive: backend === "texlive",
  });

  const result = new Uint8Array(buffer);
  log.info(
    `Compiled ${mainFile} in ${(performance.now() - start).toFixed(0)}ms (${(result.byteLength / 1024).toFixed(0)} KB)`,
  );
  return result;
}

// All UI entry points share a bounded queue. A root has at most one queued
// follow-up, and results belong to the project session that requested them.
const jobs = new Map<string, Promise<void>>();
let running = 0;
const slots: Array<() => void> = [];
async function takeSlot() {
  if (running < 3) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => slots.push(resolve));
}
function releaseSlot() {
  const next = slots.shift();
  if (next) next();
  else running--;
}

export function requestCompile(
  rootId: string,
  targetPath: string,
  force = false,
  snapshot = false,
): Promise<void> {
  const initial = useDocumentStore.getState();
  const { projectRoot, projectEpoch } = initial;
  if (!projectRoot) return Promise.resolve();
  const key = JSON.stringify([projectRoot, projectEpoch, rootId]);
  const existing = jobs.get(key);
  if (existing) {
    // Coalesce repeated requests. Recheck after the running job, so edits made
    // during compilation are saved and compiled exactly once more.
    return existing.then(() => {
      const latest = useDocumentStore.getState();
      if (
        latest.projectEpoch === projectEpoch &&
        latest.lastCompiledGenerations.get(rootId) !== latest.contentGeneration
      ) {
        return requestCompile(rootId, targetPath, false, snapshot);
      }
    });
  }
  if (
    !force &&
    initial.lastCompiledGenerations.get(rootId) === initial.contentGeneration
  )
    return Promise.resolve();
  const current = () =>
    useDocumentStore.getState().projectEpoch === projectEpoch &&
    useDocumentStore.getState().projectRoot === projectRoot;
  initial.startCompile(rootId);
  const job = (async () => {
    await takeSlot();
    try {
      if (!current()) return;
      await useDocumentStore.getState().saveAllFiles();
      if (!current()) return;
      const generation = useDocumentStore.getState().contentGeneration;
      if (snapshot)
        void useHistoryStore
          .getState()
          .createSnapshot(projectRoot, "[compile] Pre-compile")
          .catch(() => {});
      const settings = useSettingsStore.getState();
      const data = await compileLatex(
        projectRoot,
        targetPath,
        settings.compilerBackend,
        settings.defaultEngine,
      );
      if (current())
        useDocumentStore.getState().setPdfData(data, rootId, generation);
    } catch (error) {
      if (current())
        useDocumentStore
          .getState()
          .setCompileError(formatCompileError(error), rootId);
      throw error;
    } finally {
      releaseSlot();
      jobs.delete(key);
      if (current()) useDocumentStore.getState().endCompile(rootId);
    }
  })();
  jobs.set(key, job);
  return job;
}

export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

/** Independent documents: files that declare their own \\documentclass. */
export function independentCompileRoots(
  fileIds: string[],
  files: ProjectFile[],
): { rootId: string; targetPath: string }[] {
  const seen = new Set<string>();
  const roots: { rootId: string; targetPath: string }[] = [];
  for (const id of fileIds) {
    const file = files.find((item) => item.id === id);
    if (!file || file.type !== "tex" || !file.content) continue;
    if (!/\\documentclass[\s{[]/.test(file.content)) continue;
    if (seen.has(file.id)) continue;
    seen.add(file.id);
    roots.push({ rootId: file.id, targetPath: file.relativePath });
  }
  return roots;
}

export async function compileIndependentRoots(
  fileIds: string[],
): Promise<{ compiled: number; failed: number }> {
  const state = useDocumentStore.getState();
  let roots = independentCompileRoots(fileIds, state.files);
  if (roots.length === 0 && state.activeFileId) {
    const fallback = resolveCompileTarget(state.activeFileId, state.files);
    if (fallback) roots = [fallback];
  }
  if (!state.projectRoot || roots.length === 0) {
    return { compiled: 0, failed: 0 };
  }
  const results = await Promise.allSettled(
    roots.map(({ rootId, targetPath }) =>
      requestCompile(rootId, targetPath, true),
    ),
  );
  return {
    compiled: results.filter((item) => item.status === "fulfilled").length,
    failed: results.filter((item) => item.status === "rejected").length,
  };
}

export async function detectTexlive(): Promise<TexliveStatus> {
  return invoke<TexliveStatus>("detect_texlive");
}

export interface SynctexResult {
  file: string;
  line: number;
  column: number;
}

export interface SynctexViewResult {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function synctexEdit(
  projectDir: string,
  page: number,
  x: number,
  y: number,
  mainFile?: string,
): Promise<SynctexResult | null> {
  try {
    const result = await invoke<SynctexResult>("synctex_edit", {
      projectDir,
      page,
      x,
      y,
      mainFile: mainFile ?? null,
    });
    if (result)
      log.debug(`SyncTeX: page ${page} → ${result.file}:${result.line}`);
    return result;
  } catch (err) {
    log.debug("SyncTeX lookup failed", { page, error: String(err) });
    return null;
  }
}

export async function synctexView(
  projectDir: string,
  file: string,
  line: number,
  mainFile?: string,
  column?: number,
): Promise<SynctexViewResult | null> {
  try {
    const result = await invoke<SynctexViewResult>("synctex_view", {
      projectDir,
      file,
      line,
      column: column ?? 1,
      mainFile: mainFile ?? null,
    });
    if (result)
      log.debug(`SyncTeX view: ${file}:${line} → page ${result.page}`);
    return result;
  } catch (err) {
    log.debug("SyncTeX view failed", { file, line, error: String(err) });
    return null;
  }
}
