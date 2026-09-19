import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/app-identity";
import type { EditorFontId, UiFontId } from "@/lib/appearance";
import {
  defaultAgentModel,
  isAgentKind,
  type AgentKind,
} from "@/lib/agent-kind";
import type { CompileDocument } from "@/lib/compile-documents";

export type { AgentKind };
export type CompilerBackend = "tectonic" | "texlive" | "latexmk";
export type TexEnginePref = "auto" | "pdflatex" | "xelatex" | "lualatex";
export type HomeProjectView = "gallery" | "list";

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
  compileDocumentsByProject: Record<string, CompileDocument[]>;
  setProjectCompileDocuments: (
    projectRoot: string,
    documents: CompileDocument[],
  ) => void;
  agentKind: AgentKind;
  setAgentKind: (kind: AgentKind) => void;
  agentModels: Partial<Record<AgentKind, string>>;
  setAgentModel: (kind: AgentKind, model: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  homeProjectView: HomeProjectView;
  setHomeProjectView: (view: HomeProjectView) => void;
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
      citationFile: "",
      setCitationFile: (path) => set({ citationFile: path }),
      compileDocumentsByProject: {},
      setProjectCompileDocuments: (projectRoot, documents) =>
        set((state) => ({
          compileDocumentsByProject: {
            ...state.compileDocumentsByProject,
            [projectRoot]: documents,
          },
        })),
      agentKind: "claude",
      setAgentKind: (kind) => set({ agentKind: kind }),
      agentModels: {},
      setAgentModel: (kind, model) =>
        set((state) => ({
          agentModels: { ...state.agentModels, [kind]: model },
        })),
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      homeProjectView: "gallery",
      setHomeProjectView: (view) => set({ homeProjectView: view }),
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
        compileDocumentsByProject: state.compileDocumentsByProject,
        agentKind: state.agentKind,
        agentModels: state.agentModels,
        homeProjectView: state.homeProjectView,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        const agentKind = isAgentKind(saved.agentKind)
          ? saved.agentKind
          : "claude";
        const agentModels =
          saved.agentModels && typeof saved.agentModels === "object"
            ? saved.agentModels
            : {};
        const compileDocumentsByProject =
          saved.compileDocumentsByProject &&
          typeof saved.compileDocumentsByProject === "object"
            ? saved.compileDocumentsByProject
            : {};
        return {
          ...current,
          ...saved,
          agentKind,
          agentModels: {
            [agentKind]: defaultAgentModel(agentKind),
            ...agentModels,
          },
          compileDocumentsByProject,
          homeProjectView:
            saved.homeProjectView === "list" ? "list" : "gallery",
        };
      },
    },
  ),
);
