import { invoke } from "@tauri-apps/api/core";
import {
  resolveTexRoot,
  useDocumentStore,
  type ProjectFile,
} from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createLogger } from "@/lib/debug/logger";
import type { CompilerBackend, TexEnginePref } from "@/stores/settings-store";

const log = createLogger("latex");

/** Resolve which file to compile and the root ID for caching.
 *  resolveTexRoot now handles \documentclass detection and main.tex fallback,
 *  so the only remaining fallback here is for projects with no .tex files.
 *  Returns `null` when the project has no compilable .tex file. */
export function resolveCompileTarget(
  activeFileId: string,
  files: ProjectFile[],
): { rootId: string; targetPath: string } | null {
  const rootId = resolveTexRoot(activeFileId, files);
  const rootEntry = files.find((f) => f.id === rootId);
  if (rootEntry?.type === "tex") {
    return { rootId, targetPath: rootEntry.relativePath };
  }
  // No .tex file exists — cannot compile
  const anyTex = files.find((f) => f.type === "tex");
  if (anyTex) {
    return { rootId: anyTex.id, targetPath: anyTex.relativePath };
  }
  return null;
}

/** Extract a human-readable error message from an unknown catch value. */
export function formatCompileError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Compilation failed";
}

export async function compileLatex(
  projectDir: string,
  mainFile: string = "main.tex",
  backend: CompilerBackend = "tectonic",
  engine: TexEnginePref = "auto",
): Promise<Uint8Array> {
  log.info(`Compiling ${mainFile} (backend: ${backend}, engine: ${engine})`);
  const start = performance.now();
  // compile_latex returns raw PDF bytes via Tauri IPC Response
  const buffer = await invoke<ArrayBuffer>("compile_latex", {
    projectDir,
    mainFile,
    backend,
    engine,
    useTexlive: backend === "texlive",
  });

  const result = new Uint8Array(buffer);
  log.info(
    `Compiled ${mainFile} in ${(performance.now() - start).toFixed(0)}ms (${(result.byteLength / 1024).toFixed(0)} KB)`,
  );
  return result;
}

export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

/** Independent documents: files that declare their own \\documentclass. */
export function independentCompileRoots(
  fileIds: string[],
  files: ProjectFile[],
): { rootId: string; targetPath: string }[] {
  const seen = new Set<string>();
  const roots: { rootId: string; targetPath: string }[] = [];
  for (const id of fileIds) {
    const file = files.find((item) => item.id === id);
    if (!file || file.type !== "tex" || !file.content) continue;
    if (!/\\documentclass[\s{[]/.test(file.content)) continue;
    if (seen.has(file.id)) continue;
    seen.add(file.id);
    roots.push({ rootId: file.id, targetPath: file.relativePath });
  }
  return roots;
}

export async function compileIndependentRoots(
  fileIds: string[],
): Promise<{ compiled: number; failed: number }> {
  const state = useDocumentStore.getState();
  let roots = independentCompileRoots(fileIds, state.files);
  if (roots.length === 0 && state.activeFileId) {
    const fallback = resolveCompileTarget(state.activeFileId, state.files);
    if (fallback) roots = [fallback];
  }
  if (!state.projectRoot || roots.length === 0) {
    return { compiled: 0, failed: 0 };
  }
  await state.saveAllFiles();
  const settings = useSettingsStore.getState();
  const results = await Promise.allSettled(
    roots.map(async ({ rootId, targetPath }) => {
      state.startCompile(rootId);
      try {
        const data = await compileLatex(
          state.projectRoot!,
          targetPath,
          settings.compilerBackend,
          settings.defaultEngine,
        );
        useDocumentStore.getState().setPdfData(data, rootId);
        useDocumentStore.getState().setPreviewRoot(rootId);
      } catch (error) {
        useDocumentStore
          .getState()
          .setCompileError(formatCompileError(error), rootId);
        throw error;
      } finally {
        useDocumentStore.getState().endCompile(rootId);
      }
    }),
  );
  return {
    compiled: results.filter((item) => item.status === "fulfilled").length,
    failed: results.filter((item) => item.status === "rejected").length,
  };
}

export async function detectTexlive(): Promise<TexliveStatus> {
  return invoke<TexliveStatus>("detect_texlive");
}

export interface SynctexResult {
  file: string;
  line: number;
  column: number;
}

export async function synctexEdit(
  projectDir: string,
  page: number,
  x: number,
  y: number,
  mainFile?: string,
): Promise<SynctexResult | null> {
  try {
    const result = await invoke<SynctexResult>("synctex_edit", {
      projectDir,
      page,
      x,
      y,
      mainFile: mainFile ?? null,
    });
    if (result)
      log.debug(`SyncTeX: page ${page} → ${result.file}:${result.line}`);
    return result;
  } catch (err) {
    log.debug("SyncTeX lookup failed", { page, error: String(err) });
    return null;
  }
}
