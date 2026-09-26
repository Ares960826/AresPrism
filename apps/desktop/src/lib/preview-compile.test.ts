import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { PANE_EVENTS, type PreviewCompilePayload } from "./detached-pane";
import { compileFromPreview, requestPreviewCompile } from "./preview-compile";

vi.mock("@/stores/history-store", () => ({
  useHistoryStore: { getState: () => ({ stopReview: vi.fn() }) },
}));
vi.mock("@/stores/claude-chat-store", () => ({
  useClaudeChatStore: { getState: () => ({ newSession: vi.fn() }) },
}));

const save = vi.fn(async () => {});
const payload: PreviewCompilePayload = {
  projectRoot: "/preview-test",
  activeFileId: "chapter.tex",
  force: true,
  compilerBackend: "texlive",
  defaultEngine: "xelatex",
};
let epoch = 5000;
beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(8));
  useDocumentStore.setState({
    projectRoot: payload.projectRoot,
    projectEpoch: ++epoch,
    activeFileId: payload.activeFileId,
    files: [
      {
        id: "main.tex",
        name: "main.tex",
        relativePath: "main.tex",
        absolutePath: "/preview-test/main.tex",
        type: "tex",
        content: "\\documentclass{article}\n\\input{chapter}",
        isDirty: false,
      },
      {
        id: "chapter.tex",
        name: "chapter.tex",
        relativePath: "chapter.tex",
        absolutePath: "/preview-test/chapter.tex",
        type: "tex",
        content: "% !TEX root = main.tex\nUnsaved chapter edit",
        isDirty: true,
      },
    ],
    contentGeneration: 1,
    lastCompiledGenerations: new Map(),
    compilingRootIds: [],
    isCompiling: false,
    saveAllFiles: save,
  });
  useSettingsStore.setState({
    compilerBackend: "tectonic",
    defaultEngine: "pdflatex",
  });
});
afterEach(() => window.history.replaceState({}, "", "/"));

it("relays floating compile with the displayed engine and project without saving its read-only snapshot", async () => {
  window.history.replaceState({}, "", "/?pane=preview");
  useSettingsStore.setState({
    compilerBackend: payload.compilerBackend,
    defaultEngine: payload.defaultEngine,
  });
  await requestPreviewCompile(true);
  expect(emit).toHaveBeenCalledWith(PANE_EVENTS.compile, payload);
  expect(save).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it("saves editor changes before compiling the root with the floating window's engine", async () => {
  let finishSave!: () => void;
  save.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishSave = resolve;
    }),
  );
  const compile = compileFromPreview(payload);
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(invoke).not.toHaveBeenCalled();
  finishSave();
  await compile;
  expect(invoke).toHaveBeenCalledWith("compile_latex", {
    projectDir: "/preview-test",
    mainFile: "main.tex",
    backend: "texlive",
    engine: "xelatex",
    useTexlive: true,
  });
});

it("ignores a request from a different project or a removed file", async () => {
  await compileFromPreview({ ...payload, projectRoot: "/other-project" });
  await compileFromPreview({ ...payload, activeFileId: "removed.tex" });
  expect(save).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(useSettingsStore.getState().compilerBackend).toBe("tectonic");
});

it("honors forced recompilation even when source has not changed", async () => {
  useDocumentStore.setState({
    lastCompiledGenerations: new Map([["main.tex", 1]]),
  });
  await compileFromPreview({ ...payload, force: false });
  expect(invoke).not.toHaveBeenCalled();
  await compileFromPreview(payload);
  expect(invoke).toHaveBeenCalledOnce();
});

it("surfaces save errors without starting a compiler", async () => {
  save.mockRejectedValueOnce(new Error("Disk full"));
  await expect(compileFromPreview(payload)).rejects.toThrow("Disk full");
  expect(useDocumentStore.getState().compileError).toBe("Disk full");
  expect(invoke).not.toHaveBeenCalled();
});
