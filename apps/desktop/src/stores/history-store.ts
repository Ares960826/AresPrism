import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("history");

// ─── Types ───

export interface SnapshotInfo {
  id: string;
  /** First parent; null only for the very first version. */
  parent_id: string | null;
  message: string;
  timestamp: number;
  labels: string[];
  changed_files: string[];
}

export interface FileDiff {
  file_path: string;
  status: "added" | "modified" | "deleted";
  old_content: string | null;
  new_content: string | null;
}

export interface RestoreResult {
  /**
   * The `[restore]` snapshot holding the restored files; null when the
   * project was already at that version (nothing changed).
   */
  snapshot: SnapshotInfo | null;
  /** The version right before the restore; restoring it undoes the restore. */
  previous_id: string;
}

interface HistoryState {
  snapshots: SnapshotInfo[];
  isLoading: boolean;
  selectedSnapshotId: string | null;
  diffResult: FileDiff[] | null;
  isDiffLoading: boolean;
  isRestoring: boolean;
  reviewingSnapshot: SnapshotInfo | null;

  init: (projectRoot: string) => Promise<void>;
  createSnapshot: (
    projectRoot: string,
    message: string,
  ) => Promise<SnapshotInfo | null>;
  loadSnapshots: (projectRoot: string) => Promise<void>;
  loadMoreSnapshots: (projectRoot: string) => Promise<void>;
  selectSnapshot: (id: string | null) => void;
  /** `fromId = null` diffs against an empty tree (every file added). */
  loadDiff: (
    projectRoot: string,
    fromId: string | null,
    toId: string,
  ) => Promise<void>;
  getFileAt: (
    projectRoot: string,
    snapshotId: string,
    filePath: string,
  ) => Promise<string>;
  /**
   * Low-level restore IPC. UI code should go through `restoreVersion` in
   * `lib/history-restore.ts`, which saves buffers first and reloads after.
   */
  restoreSnapshot: (
    projectRoot: string,
    snapshotId: string,
  ) => Promise<RestoreResult>;
  addLabel: (
    projectRoot: string,
    snapshotId: string,
    label: string,
  ) => Promise<void>;
  removeLabel: (projectRoot: string, label: string) => Promise<void>;
  startReview: (snapshot: SnapshotInfo) => void;
  stopReview: () => void;
  reset: () => void;
}

const PAGE_SIZE = 50;

// Bumped whenever the first page is reloaded. Snapshot ids can change when the
// backend prunes (it rewrites the linear history), so a page loaded against an
// older list must be dropped instead of appended.
let listGeneration = 0;

function dedupeById(list: SnapshotInfo[]): SnapshotInfo[] {
  const seen = new Set<string>();
  return list.filter((snap) => {
    if (seen.has(snap.id)) return false;
    seen.add(snap.id);
    return true;
  });
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  snapshots: [],
  isLoading: false,
  selectedSnapshotId: null,
  diffResult: null,
  isDiffLoading: false,
  isRestoring: false,
  reviewingSnapshot: null,

  startReview: (snapshot) => {
    set({ reviewingSnapshot: snapshot });
  },

  stopReview: () => {
    set({ reviewingSnapshot: null, diffResult: null });
  },

  init: async (projectRoot) => {
    log.debug(`Initializing history for ${projectRoot}`);
    await invoke("history_init", { projectRoot });
  },

  createSnapshot: async (projectRoot, message) => {
    log.debug(`Creating snapshot: ${message}`);
    const result = await invoke<SnapshotInfo | null>("history_snapshot", {
      projectRoot,
      message,
    });
    if (result) {
      log.info(`Snapshot created: ${result.id.slice(0, 8)}`);
      // Reload instead of prepending: pruning may have rewritten every id.
      await get()
        .loadSnapshots(projectRoot)
        .catch((err) => {
          log.warn("Failed to reload snapshots", { error: String(err) });
        });
    }
    return result;
  },

  loadSnapshots: async (projectRoot) => {
    const generation = ++listGeneration;
    set({ isLoading: true });
    try {
      const snapshots = await invoke<SnapshotInfo[]>("history_list", {
        projectRoot,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (generation === listGeneration)
        set({ snapshots: dedupeById(snapshots) });
    } finally {
      if (generation === listGeneration) set({ isLoading: false });
    }
  },

  loadMoreSnapshots: async (projectRoot) => {
    const { snapshots, isLoading } = get();
    if (isLoading) return;
    const generation = listGeneration;
    set({ isLoading: true });
    try {
      const more = await invoke<SnapshotInfo[]>("history_list", {
        projectRoot,
        limit: PAGE_SIZE,
        offset: snapshots.length,
      });
      if (generation !== listGeneration) return;
      if (more.length > 0) {
        set((s) => ({ snapshots: dedupeById([...s.snapshots, ...more]) }));
      }
    } finally {
      if (generation === listGeneration) set({ isLoading: false });
    }
  },

  selectSnapshot: (id) => {
    set({ selectedSnapshotId: id, diffResult: null });
  },

  loadDiff: async (projectRoot, fromId, toId) => {
    set({ isDiffLoading: true, diffResult: null });
    try {
      const diffResult = await invoke<FileDiff[]>("history_diff", {
        projectRoot,
        fromId,
        toId,
      });
      set({ diffResult });
    } finally {
      set({ isDiffLoading: false });
    }
  },

  getFileAt: async (projectRoot, snapshotId, filePath) => {
    return invoke<string>("history_file_at", {
      projectRoot,
      snapshotId,
      filePath,
    });
  },

  restoreSnapshot: async (projectRoot, snapshotId) => {
    log.info(`Restoring snapshot: ${snapshotId.slice(0, 8)}`);
    const result = await invoke<RestoreResult>("history_restore", {
      projectRoot,
      snapshotId,
    });
    log.info(
      result.snapshot
        ? `Restored snapshot, new snapshot: ${result.snapshot.id.slice(0, 8)}`
        : "Already at this version",
    );
    await get()
      .loadSnapshots(projectRoot)
      .catch((err) => {
        log.warn("Failed to reload snapshots", { error: String(err) });
      });
    return result;
  },

  addLabel: async (projectRoot, snapshotId, label) => {
    await invoke<string>("history_add_label", {
      projectRoot,
      snapshotId,
      label,
    });
    // The label exists now; a failed reload must not report it as failed.
    await get()
      .loadSnapshots(projectRoot)
      .catch((err) => {
        log.warn("Failed to reload snapshots", { error: String(err) });
      });
  },

  removeLabel: async (projectRoot, label) => {
    await invoke("history_remove_label", { projectRoot, label });
    await get()
      .loadSnapshots(projectRoot)
      .catch((err) => {
        log.warn("Failed to reload snapshots", { error: String(err) });
      });
  },

  reset: () => {
    listGeneration++;
    set({
      snapshots: [],
      isLoading: false,
      selectedSnapshotId: null,
      diffResult: null,
      isDiffLoading: false,
      isRestoring: false,
      reviewingSnapshot: null,
    });
  },
}));
