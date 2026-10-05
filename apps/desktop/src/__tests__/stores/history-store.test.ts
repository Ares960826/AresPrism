import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useHistoryStore, type SnapshotInfo } from "@/stores/history-store";

function snap(id: string, message = `[auto] ${id}`): SnapshotInfo {
  return {
    id,
    parent_id: null,
    message,
    timestamp: 0,
    labels: [],
    changed_files: [],
  };
}

describe("history-store", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    useHistoryStore.getState().reset();
  });

  it("reloads the first page after a snapshot instead of prepending", async () => {
    // Pruning rewrote ids: the stale in-memory entry no longer exists.
    useHistoryStore.setState({ snapshots: [snap("stale-old")] });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "history_snapshot") return snap("new");
      if (cmd === "history_list") return [snap("new"), snap("rewritten-old")];
      throw new Error(`unexpected ${cmd}`);
    });

    const result = await useHistoryStore
      .getState()
      .createSnapshot("/project", "[auto] Edit");

    expect(result?.id).toBe("new");
    expect(invoke).toHaveBeenCalledWith("history_list", {
      projectRoot: "/project",
      limit: 50,
      offset: 0,
    });
    expect(useHistoryStore.getState().snapshots.map((s) => s.id)).toEqual([
      "new",
      "rewritten-old",
    ]);
  });

  it("does not reload when nothing changed", async () => {
    useHistoryStore.setState({ snapshots: [snap("a")] });
    vi.mocked(invoke).mockResolvedValue(null as never);
    await useHistoryStore.getState().createSnapshot("/project", "[auto] Edit");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().snapshots.map((s) => s.id)).toEqual([
      "a",
    ]);
  });

  it("dedupes loadMore results by id", async () => {
    useHistoryStore.setState({ snapshots: [snap("a"), snap("b")] });
    vi.mocked(invoke).mockResolvedValue([snap("b"), snap("c")] as never);

    await useHistoryStore.getState().loadMoreSnapshots("/project");

    expect(invoke).toHaveBeenCalledWith("history_list", {
      projectRoot: "/project",
      limit: 50,
      offset: 2,
    });
    expect(useHistoryStore.getState().snapshots.map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops a loadMore page that resolves after the list was reloaded", async () => {
    useHistoryStore.setState({ snapshots: [snap("a")] });
    let resolveMore!: (value: SnapshotInfo[]) => void;
    vi.mocked(invoke).mockImplementation(async (_cmd, args) => {
      const { offset } = args as { offset: number };
      if (offset === 0) return [snap("x"), snap("y")];
      return new Promise<SnapshotInfo[]>((resolve) => {
        resolveMore = resolve;
      });
    });

    const more = useHistoryStore.getState().loadMoreSnapshots("/project");
    await useHistoryStore.getState().loadSnapshots("/project");
    resolveMore([snap("old-page")]);
    await more;

    expect(useHistoryStore.getState().snapshots.map((s) => s.id)).toEqual([
      "x",
      "y",
    ]);
    expect(useHistoryStore.getState().isLoading).toBe(false);
  });

  it("reloads after adding a label and surfaces label errors", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "history_add_label") return "submission draft";
      if (cmd === "history_list")
        return [{ ...snap("a"), labels: ["submission draft"] }];
      throw new Error(`unexpected ${cmd}`);
    });
    await useHistoryStore
      .getState()
      .addLabel("/project", "a", "submission draft");
    expect(useHistoryStore.getState().snapshots[0].labels).toEqual([
      "submission draft",
    ]);

    vi.mocked(invoke).mockRejectedValue(
      'A version is already labeled "submission draft"' as never,
    );
    await expect(
      useHistoryStore.getState().addLabel("/project", "a", "submission draft"),
    ).rejects.toBe('A version is already labeled "submission draft"');
  });

  it("does not report a created label as failed when only the reload fails", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "history_add_label") return "Draft v1";
      throw new Error("list failed");
    });
    await expect(
      useHistoryStore.getState().addLabel("/project", "a", "Draft v1"),
    ).resolves.toBeUndefined();
  });
});
