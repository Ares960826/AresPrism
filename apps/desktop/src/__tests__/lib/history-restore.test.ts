import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  readDir,
  readTextFile,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useHistoryStore } from "@/stores/history-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { restoreVersion } from "@/lib/history-restore";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/stores/claude-chat-store", () => ({
  useClaudeChatStore: {
    getState: vi.fn(() => ({ newSession: vi.fn() })),
  },
}));

function dirtyMain(content: string): ProjectFile {
  return {
    id: "main.tex",
    name: "main.tex",
    relativePath: "main.tex",
    absolutePath: "/project/main.tex",
    type: "tex",
    content,
    isDirty: true,
    revision: 1,
  };
}

const restoreResult = {
  snapshot: {
    id: "restore-commit",
    parent_id: "before-restore",
    message: "[restore] Restored to target",
    timestamp: 0,
    labels: [],
    changed_files: ["main.tex"],
  },
  previous_id: "before-restore",
};

let events: string[] = [];
let diskContent = "";

describe("restoreVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events = [];
    diskContent = "saved before restore";
    useHistoryStore.getState().reset();
    useProposedChangesStore.setState({ changes: [] });
    useDocumentStore.setState({
      projectRoot: "/project",
      files: [dirtyMain("unsaved edit")],
      folders: [],
      activeFileId: "main.tex",
      openFileIds: ["main.tex"],
      initialized: true,
      saveError: null,
    });

    vi.mocked(writeTextFile).mockImplementation(async (path, content) => {
      events.push(`write ${String(path)} ${String(content)}`);
    });
    vi.mocked(readDir).mockResolvedValue([
      { name: "main.tex", isDirectory: false },
    ] as never);
    vi.mocked(stat).mockResolvedValue({ size: 16 } as never);
    vi.mocked(readTextFile).mockImplementation(async () => diskContent);
    vi.mocked(invoke).mockImplementation(async (cmd: string, args) => {
      events.push(`invoke ${cmd}`);
      if (cmd === "history_restore") {
        // The user keeps typing while the backend restores.
        useDocumentStore
          .getState()
          .updateFileContent("main.tex", "typed during restore");
        diskContent = "restored content";
        return {
          ...restoreResult,
          snapshot: {
            ...restoreResult.snapshot,
            message: `[restore] Restored to ${(args as { snapshotId: string }).snapshotId}`,
          },
        };
      }
      if (cmd === "history_list") return [];
      return undefined;
    });
  });

  it("saves dirty buffers before restoring and never writes stale buffers after", async () => {
    const result = await restoreVersion("/project", "target");

    expect(result?.previous_id).toBe("before-restore");
    const restoreAt = events.indexOf("invoke history_restore");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(events.slice(0, restoreAt)).toContain(
      "write /project/main.tex unsaved edit",
    );
    expect(
      events.slice(restoreAt).filter((e) => e.startsWith("write")),
    ).toEqual([]);

    const main = useDocumentStore
      .getState()
      .files.find((f) => f.id === "main.tex");
    expect(main?.content).toBe("restored content");
    expect(main?.isDirty).toBe(false);
    expect(useHistoryStore.getState().isRestoring).toBe(false);
  });

  it("re-enables saving after the restore", async () => {
    await restoreVersion("/project", "target");
    useDocumentStore.getState().updateFileContent("main.tex", "after restore");
    await useDocumentStore.getState().saveAllFiles();
    expect(events[events.length - 1]).toBe(
      "write /project/main.tex after restore",
    );
  });

  it("offers an Undo action that restores the pre-restore version", async () => {
    await restoreVersion("/project", "target");

    expect(toast.success).toHaveBeenCalledWith(
      "Version restored",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
    const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };
    events = [];
    options.action.onClick();
    await vi.waitFor(() =>
      expect(useHistoryStore.getState().isRestoring).toBe(false),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Restore undone"),
    );
    expect(invoke).toHaveBeenCalledWith("history_restore", {
      projectRoot: "/project",
      snapshotId: "before-restore",
    });
  });

  it("ignores a second restore while one is running", async () => {
    const first = restoreVersion("/project", "target");
    const second = await restoreVersion("/project", "other");
    await first;

    expect(second).toBeNull();
    expect(
      vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "history_restore"),
    ).toHaveLength(1);
  });

  it("does not restore when saving the current buffers fails", async () => {
    vi.mocked(writeTextFile).mockRejectedValue(new Error("disk full"));

    const result = await restoreVersion("/project", "target");

    expect(result).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      "history_restore",
      expect.anything(),
    );
    expect(toast.error).toHaveBeenCalled();
    expect(useHistoryStore.getState().isRestoring).toBe(false);
  });

  it("refuses while an AI agent is streaming", async () => {
    vi.mocked(useClaudeChatStore.getState).mockReturnValueOnce({
      tabs: [{ id: "tab", isStreaming: true }],
    } as never);

    expect(await restoreVersion("/project", "target")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Stop the AI agent before restoring a version.",
    );
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses while AI changes await review", async () => {
    useProposedChangesStore.setState({
      changes: [
        {
          id: "c1",
          filePath: "main.tex",
          absolutePath: "/project/main.tex",
          oldContent: "a",
          newContent: "b",
          toolName: "Edit",
          timestamp: 0,
        } as never,
      ],
    });

    expect(await restoreVersion("/project", "target")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Accept or reject the AI's pending changes before restoring.",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks AI change writes while saves are suspended", async () => {
    useDocumentStore.setState({ files: [] });
    const token = await useDocumentStore.getState().prepareForRestore();
    useProposedChangesStore.setState({
      changes: [
        {
          id: "c1",
          filePath: "main.tex",
          absolutePath: "/project/main.tex",
          oldContent: "a",
          newContent: "b",
          toolName: "Edit",
          timestamp: 0,
        } as never,
      ],
    });
    try {
      await expect(
        useProposedChangesStore.getState().undoChange("c1"),
      ).rejects.toThrow(/being restored/);
      await expect(
        useProposedChangesStore.getState().undoAll(),
      ).rejects.toThrow(/being restored/);
      expect(() => useProposedChangesStore.getState().keepChange("c1")).toThrow(
        /being restored/,
      );
      expect(writeTextFile).not.toHaveBeenCalled();
    } finally {
      useDocumentStore.getState().endRestore(token);
    }
  });

  it("does not report save success to close/quit paths during a restore", async () => {
    useDocumentStore.setState({ files: [] });
    const token = await useDocumentStore.getState().prepareForRestore();
    try {
      useDocumentStore.setState({ files: [dirtyMain("typed mid-restore")] });
      await expect(useDocumentStore.getState().saveAllFiles()).rejects.toThrow(
        /being restored/,
      );
      await expect(
        useDocumentStore.getState().saveFile("main.tex"),
      ).rejects.toThrow(/being restored/);
      await expect(useDocumentStore.getState().closeProject()).rejects.toThrow(
        /restore to finish/,
      );
      expect(writeTextFile).not.toHaveBeenCalled();
    } finally {
      useDocumentStore.getState().endRestore(token);
    }
  });

  it("refuses project reloads and folder moves during a restore", async () => {
    useDocumentStore.setState({ files: [] });
    const token = await useDocumentStore.getState().prepareForRestore();
    try {
      await expect(
        useDocumentStore.getState().openProject("/project"),
      ).rejects.toThrow(/restore to finish/);
      await expect(
        useDocumentStore.getState().moveFolder("figs", "assets"),
      ).rejects.toThrow(/restore to finish/);
      await expect(
        useDocumentStore.getState().renameProject("renamed"),
      ).rejects.toThrow(/restore to finish/);
      expect(readDir).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Wait for the version restore to finish.",
      );
    } finally {
      useDocumentStore.getState().endRestore(token);
    }
  });

  it("only the owning token ends a restore", async () => {
    useDocumentStore.setState({ files: [] });
    const token = await useDocumentStore.getState().prepareForRestore();
    useDocumentStore.getState().endRestore(token + 1);
    expect(useDocumentStore.getState().isRestoreInProgress()).toBe(true);
    await expect(
      useDocumentStore.getState().prepareForRestore(),
    ).rejects.toThrow(/restore to finish/);
    // A reload with a foreign token is refused too
    await expect(
      useDocumentStore.getState().openProject("/project", {
        discardUnsaved: true,
        restoreToken: token + 1,
      }),
    ).rejects.toThrow(/restore to finish/);
    useDocumentStore.getState().endRestore(token);
    expect(useDocumentStore.getState().isRestoreInProgress()).toBe(false);
    useDocumentStore.setState({ files: [dirtyMain("after")] });
    await useDocumentStore.getState().saveAllFiles();
    expect(events[events.length - 1]).toBe("write /project/main.tex after");
  });

  it("drops stale buffers, re-enables saving and offers Undo when the reload fails", async () => {
    vi.mocked(readDir).mockRejectedValueOnce(new Error("scan failed"));

    const result = await restoreVersion("/project", "target");

    expect(result?.previous_id).toBe("before-restore");
    expect(toast.success).not.toHaveBeenCalled();
    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(String(message)).toBe(
      "The version was restored, but the project could not be reloaded. Reopen the project.",
    );
    expect(
      (options as unknown as { action: { label: string } }).action.label,
    ).toBe("Undo");

    // No stale buffer remains; nothing is suspended.
    const doc = useDocumentStore.getState();
    expect(doc.files).toEqual([]);
    expect(doc.openFileIds).toEqual([]);
    expect(doc.projectRoot).toBe("/project");
    expect(doc.isRestoreInProgress()).toBe(false);
    expect(useHistoryStore.getState().isRestoring).toBe(false);
    events = [];
    await doc.saveAllFiles();
    expect(events.filter((e) => e.startsWith("write"))).toEqual([]);

    // Later failed and no-op restores cannot write stale content either.
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      events.push(`invoke ${cmd}`);
      if (cmd === "history_restore") throw "backend failed";
      return undefined;
    });
    expect(await restoreVersion("/project", "x")).toBeNull();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      events.push(`invoke ${cmd}`);
      if (cmd === "history_restore")
        return { snapshot: null, previous_id: "head" };
      return undefined;
    });
    await restoreVersion("/project", "head");
    await useDocumentStore.getState().saveAllFiles();
    expect(events.filter((e) => e.startsWith("write"))).toEqual([]);
  });

  it("Undo after a failed reload restores and reloads the project", async () => {
    vi.mocked(readDir).mockRejectedValueOnce(new Error("scan failed"));
    await restoreVersion("/project", "target");
    const options = vi.mocked(toast.error).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };

    options.action.onClick();
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Restore undone"),
    );
    expect(invoke).toHaveBeenCalledWith("history_restore", {
      projectRoot: "/project",
      snapshotId: "before-restore",
    });
    expect(useDocumentStore.getState().files.map((f) => f.content)).toEqual([
      "restored content",
    ]);
  });

  it("Undo does nothing when another project is open", async () => {
    await restoreVersion("/project", "target");
    const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };
    useDocumentStore.setState({ projectRoot: "/other" });
    vi.mocked(invoke).mockClear();

    options.action.onClick();

    expect(toast.error).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports when the project is already at the version", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      events.push(`invoke ${cmd}`);
      if (cmd === "history_restore")
        return { snapshot: null, previous_id: "head" };
      if (cmd === "history_list") return [];
      return undefined;
    });

    const result = await restoreVersion("/project", "head");

    expect(result?.snapshot).toBeNull();
    expect(toast.info).toHaveBeenCalledWith("Already at this version");
    expect(readDir).not.toHaveBeenCalled();
    useDocumentStore.getState().updateFileContent("main.tex", "next edit");
    await useDocumentStore.getState().saveAllFiles();
    expect(events[events.length - 1]).toBe("write /project/main.tex next edit");
  });

  it("retries when a keystroke lands while saving before the restore", async () => {
    let typed = false;
    vi.mocked(writeTextFile).mockImplementation(async (path, content) => {
      events.push(`write ${String(path)} ${String(content)}`);
      if (!typed) {
        typed = true;
        useDocumentStore
          .getState()
          .updateFileContent("main.tex", "typed while saving");
      }
    });

    const result = await restoreVersion("/project", "target");

    expect(result).not.toBeNull();
    const restoreAt = events.indexOf("invoke history_restore");
    expect(events.slice(0, restoreAt)).toContain(
      "write /project/main.tex typed while saving",
    );
  });
});
