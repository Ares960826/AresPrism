import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/app-identity";
import type { EditorFontId, UiFontId } from "@/lib/appearance";

export type CompilerBackend = "tectonic" | "texlive" | "latexmk";
export type TexEnginePref = "auto" | "pdflatex" | "xelatex" | "lualatex";

interface SettingsState {
  compilerBackend: CompilerBackend;
  setCompilerBackend: (backend: CompilerBackend) => void;
  defaultEngine: TexEnginePref;
  setDefaultEngine: (engine: TexEnginePref) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
  uiFont: UiFontId;
  setUiFont: (font: UiFontId) => void;
  editorFont: EditorFontId;
  setEditorFont: (font: EditorFontId) => void;
  uiFontSize: number;
  setUiFontSize: (size: number) => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
  citationFile: string;
  setCitationFile: (path: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
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
      uiFont: "geist",
      setUiFont: (font) => set({ uiFont: font }),
      editorFont: "system-mono",
      setEditorFont: (font) => set({ editorFont: font }),
      uiFontSize: 16,
      setUiFontSize: (size) => set({ uiFontSize: size }),
      editorFontSize: 14,
      setEditorFontSize: (size) => set({ editorFontSize: size }),
      citationFile: "references.bib",
      setCitationFile: (path) => set({ citationFile: path }),
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: STORAGE_KEYS.settings,
      partialize: (state) => ({
        compilerBackend: state.compilerBackend,
        defaultEngine: state.defaultEngine,
        vimMode: state.vimMode,
        uiFont: state.uiFont,
        editorFont: state.editorFont,
        uiFontSize: state.uiFontSize,
        editorFontSize: state.editorFontSize,
        citationFile: state.citationFile,
      }),
    },
  ),
);
