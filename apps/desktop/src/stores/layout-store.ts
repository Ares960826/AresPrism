import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { parseDetachedPane } from "@/lib/detached-pane";

interface LayoutState {
  previewFloating: boolean;
  setPreviewFloating: (v: boolean) => void;
  chatMode: "docked" | "floating";
  setChatMode: (mode: "docked" | "floating") => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

function syncPaneWindow(pane: "preview" | "chat", open: boolean) {
  if (parseDetachedPane() && open) return;
  void invoke(open ? "open_pane_window" : "close_pane_window", { pane }).catch(
    (error: unknown) => {
      console.error(
        `Failed to ${open ? "open" : "close"} ${pane} window`,
        error,
      );
    },
  );
}

export const useLayoutStore = create<LayoutState>((set) => ({
  previewFloating: false,
  setPreviewFloating: (v) => {
    set({ previewFloating: v });
    syncPaneWindow("preview", v);
  },
  chatMode: "docked",
  setChatMode: (mode) => {
    set({ chatMode: mode });
    syncPaneWindow("chat", mode === "floating");
  },
  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
}));
