import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/app-identity";

export type CompilerBackend = "tectonic" | "texlive" | "latexmk";
export type TexEnginePref = "auto" | "pdflatex" | "xelatex" | "lualatex";

interface SettingsState {
  compilerBackend: CompilerBackend;
  setCompilerBackend: (backend: CompilerBackend) => void;
  defaultEngine: TexEnginePref;
  setDefaultEngine: (engine: TexEnginePref) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      compilerBackend: "tectonic",
      setCompilerBackend: (backend) => set({ compilerBackend: backend }),
      defaultEngine: "pdflatex",
      setDefaultEngine: (engine) => set({ defaultEngine: engine }),
      vimMode: false,
      setVimMode: (enabled) => set({ vimMode: enabled }),
    }),
    {
      name: STORAGE_KEYS.settings,
    },
  ),
);
