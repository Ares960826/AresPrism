import { create } from "zustand";

interface LayoutState {
  previewFloating: boolean;
  setPreviewFloating: (v: boolean) => void;
  chatMode: "docked" | "floating";
  setChatMode: (mode: "docked" | "floating") => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  previewFloating: false,
  setPreviewFloating: (v) => set({ previewFloating: v }),
  chatMode: "docked",
  setChatMode: (mode) => set({ chatMode: mode }),
  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
}));
