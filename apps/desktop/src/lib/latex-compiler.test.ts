import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { compileIndependentRoots, requestCompile } from "./latex-compiler";
import {
  useDocumentStore,
  getPdfBytes,
  getCurrentPdfBytes,
  getCurrentPdfRootId,
} from "@/stores/document-store";
vi.mock("@/stores/history-store", () => ({
  useHistoryStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock("@/stores/claude-chat-store", () => ({
  useClaudeChatStore: { getState: () => ({ newSession: vi.fn() }) },
}));
const save = vi.fn(async () => {});
let epoch = 1000;
beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  useDocumentStore.setState({
    projectRoot: "/compile-test",
    projectEpoch: ++epoch,
    files: [],
    contentGeneration: 1,
    lastCompiledGenerations: new Map(),
    compilingRootIds: [],
    isCompiling: false,
    saveAllFiles: save,
  });
});
describe("shared compile scheduler", () => {
  it("queues eight roots with no more than three compilers", async () => {
    let active = 0,
      peak = 0;
    vi.mocked(invoke).mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return new ArrayBuffer(8);
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        requestCompile(`root${i}`, `root${i}.tex`, true),
      ),
    );
    expect(peak).toBe(3);
    expect(invoke).toHaveBeenCalledTimes(8);
    expect(useDocumentStore.getState().isCompiling).toBe(false);
  });
  it("coalesces repeated requests and records the generation actually compiled", async () => {
    let finish!: (value: ArrayBuffer) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(8));
    const first = requestCompile("coalesced", "main.tex", true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    useDocumentStore.setState({ contentGeneration: 2 });
    const others = Array.from({ length: 10 }, () =>
      requestCompile("coalesced", "main.tex", true),
    );
    finish(new ArrayBuffer(8));
    await Promise.all([first, ...others]);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(
      useDocumentStore.getState().lastCompiledGenerations.get("coalesced"),
    ).toBe(2);
  });
  it("does not compile after save failure", async () => {
    save.mockRejectedValueOnce(new Error("Disk full"));
    await expect(requestCompile("failed", "main.tex", true)).rejects.toThrow(
      "Disk full",
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().isCompiling).toBe(false);
  });
  it("discards late results after changing project sessions", async () => {
    let finish!: (value: ArrayBuffer) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const compiling = requestCompile("stale-root", "main.tex", true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    useDocumentStore.setState({
      projectEpoch: ++epoch,
      projectRoot: "/new-project",
      compilingRootIds: [],
      isCompiling: false,
    });
    finish(new ArrayBuffer(8));
    await compiling;
    expect(getPdfBytes("stale-root")).toBeUndefined();
  });

  it("keeps the active document visible when independent builds finish out of order", async () => {
    const rootIds = ["draft-a/main.tex", "draft-b/main.tex"];
    useDocumentStore.setState({
      activeFileId: rootIds[0],
      files: rootIds.map((id) => ({
        id,
        name: "main.tex",
        relativePath: id,
        absolutePath: `/compile-test/${id}`,
        type: "tex" as const,
        content: "\\documentclass{article}",
        isDirty: false,
      })),
    });
    const complete = new Map<string, (value: ArrayBuffer) => void>();
    vi.mocked(invoke).mockImplementation(
      (_command, args) =>
        new Promise<ArrayBuffer>((resolve) => {
          complete.set((args as { mainFile: string }).mainFile, resolve);
        }),
    );

    const compilation = compileIndependentRoots(rootIds);
    await vi.waitFor(() => expect(complete.size).toBe(2));
    complete.get(rootIds[1])!(new Uint8Array([2]).buffer);
    await vi.waitFor(() => expect(getPdfBytes(rootIds[1])).toBeDefined());
    expect(getCurrentPdfRootId()).toBeNull();

    complete.get(rootIds[0])!(new Uint8Array([1]).buffer);
    expect(await compilation).toEqual({ compiled: 2, failed: 0 });
    expect(getCurrentPdfRootId()).toBe(rootIds[0]);
    expect(Array.from(getCurrentPdfBytes() ?? [])).toEqual([1]);
  });
});
