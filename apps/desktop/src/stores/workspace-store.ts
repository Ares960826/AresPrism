import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useDocumentStore } from "@/stores/document-store";
interface Workspace {
  id: string;
  name: string;
  roots: string[];
}
interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  createWorkspace: (root: string) => void;
  addRoot: (root: string) => void;
  removeRoot: (root: string) => void;
  openWorkspace: (id: string) => Promise<void>;
  closeWorkspace: () => void;
  forgetRoot: (root: string) => void;
  removeWorkspace: (id: string) => void;
}
const views = new Map<
  string,
  { openFileIds: string[]; activeFileId: string; cursorPosition: number }
>();
let switching: Promise<void> = Promise.resolve();
export function activateWorkspaceRoot(
  root: string,
  file?: string,
): Promise<void> {
  const task = switching
    .catch(() => {})
    .then(async () => {
      let state = useDocumentStore.getState();
      if (state.projectRoot !== root) {
        await state.saveAllFiles();
        if (useDocumentStore.getState().files.some((f) => f.isDirty))
          throw new Error("Save changes before switching projects");
        if (state.projectRoot)
          views.set(state.projectRoot, {
            openFileIds: state.openFileIds,
            activeFileId: state.activeFileId,
            cursorPosition: state.cursorPosition,
          });
        await state.openProject(root);
        const saved = views.get(root);
        state = useDocumentStore.getState();
        if (state.projectRoot !== root)
          throw new Error("Project switch was superseded");
        if (saved) {
          const ids = saved.openFileIds.filter((id) =>
            state.files.some((f) => f.id === id),
          );
          useDocumentStore.setState({
            openFileIds: ids,
            activeFileId: ids.includes(saved.activeFileId)
              ? saved.activeFileId
              : state.activeFileId,
            cursorPosition: saved.cursorPosition,
          });
        }
      }
      if (file) useDocumentStore.getState().openFileInTab(file);
    });
  switching = task;
  return task;
}
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeId: null,
      createWorkspace: (root) => {
        const workspace = {
          id: crypto.randomUUID(),
          name: `${root.split(/[\\/]/).pop()} Workspace`,
          roots: [root],
        };
        set((s) => ({
          workspaces: [...s.workspaces, workspace],
          activeId: workspace.id,
        }));
      },
      addRoot: (root) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === s.activeId
              ? { ...w, roots: Array.from(new Set([...w.roots, root])) }
              : w,
          ),
        })),
      removeRoot: (root) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === s.activeId
              ? { ...w, roots: w.roots.filter((r) => r !== root) }
              : w,
          ),
        })),
      openWorkspace: async (id) => {
        const workspace = get().workspaces.find((w) => w.id === id);
        if (!workspace?.roots.length)
          throw new Error("Workspace has no folders");
        await activateWorkspaceRoot(workspace.roots[0]);
        set({ activeId: id });
      },
      forgetRoot: (root) =>
        set((s) => ({
          workspaces: s.workspaces
            .map((w) => ({ ...w, roots: w.roots.filter((r) => r !== root) }))
            .filter((w) => w.roots.length > 0),
        })),
      removeWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
      closeWorkspace: () => set({ activeId: null }),
    }),
    {
      name: "ares-prism-workspaces",
      partialize: (s) => ({ workspaces: s.workspaces }),
    },
  ),
);
