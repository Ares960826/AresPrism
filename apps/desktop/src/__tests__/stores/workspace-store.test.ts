import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentStore } from "@/stores/document-store";
import {
  activateWorkspaceRoot,
  useWorkspaceStore,
} from "@/stores/workspace-store";
describe("optional workspace", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ workspaces: [], activeId: null });
  });
  it("keeps the default mode single-project, deduplicates roots and retains saved workspaces", () => {
    const s = useWorkspaceStore.getState();
    expect(s.activeId).toBeNull();
    s.createWorkspace("/paper-a");
    s.addRoot("/paper-b");
    s.addRoot("/paper-b");
    expect(useWorkspaceStore.getState().workspaces[0].roots).toEqual([
      "/paper-a",
      "/paper-b",
    ]);
    s.closeWorkspace();
    expect(useWorkspaceStore.getState().activeId).toBeNull();
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1);
  });
  it("refuses a project switch when saving leaves unsaved content", async () => {
    const open = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const previous = useDocumentStore.getState();
    useDocumentStore.setState({
      projectRoot: "/paper-a",
      files: [{ id: "main.tex", isDirty: true } as never],
      openProject: open,
      saveAllFiles: save,
    });
    await expect(activateWorkspaceRoot("/paper-b")).rejects.toThrow(
      "Save changes",
    );
    expect(open).not.toHaveBeenCalled();
    useDocumentStore.setState(previous);
  });
});
