import { emit } from "@tauri-apps/api/event";
import { useDocumentStore } from "@/stores/document-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  PANE_EVENTS,
  parseDetachedPane,
  type PreviewCompilePayload,
} from "./detached-pane";
import { requestCompile, resolveCompileTarget } from "./latex-compiler";

/** Run in the editor window, which owns unsaved source and the compile queue. */
export async function compileFromPreview(payload: PreviewCompilePayload) {
  const state = useDocumentStore.getState();
  if (
    state.projectRoot !== payload.projectRoot ||
    !state.files.some((file) => file.id === payload.activeFileId)
  )
    return;
  const target = resolveCompileTarget(payload.activeFileId, state.files);
  if (!target) return;
  const settings = useSettingsStore.getState();
  if (
    settings.compilerBackend !== payload.compilerBackend ||
    settings.defaultEngine !== payload.defaultEngine
  )
    useSettingsStore.setState({
      compilerBackend: payload.compilerBackend,
      defaultEngine: payload.defaultEngine,
    });
  useHistoryStore.getState().stopReview();
  await requestCompile(target.rootId, target.targetPath, payload.force);
}

export async function requestPreviewCompile(force = false) {
  const state = useDocumentStore.getState();
  if (!state.projectRoot || !state.activeFileId) return;
  const settings = useSettingsStore.getState();
  const payload: PreviewCompilePayload = {
    projectRoot: state.projectRoot,
    activeFileId: state.activeFileId,
    force,
    compilerBackend: settings.compilerBackend,
    defaultEngine: settings.defaultEngine,
  };
  if (parseDetachedPane() === "preview") {
    await emit(PANE_EVENTS.compile, payload);
  } else {
    await compileFromPreview(payload);
  }
}

/** Cmd/Ctrl+S: save the active file, then compile the paper it belongs to.
 *  Detached windows do not own buffers, so they only relay the compile; the
 *  main window's compile queue saves every dirty file before compiling. */
export async function saveAndCompile() {
  if (parseDetachedPane() !== "preview") {
    const state = useDocumentStore.getState();
    state.setIsSaving(true);
    try {
      await state.saveCurrentFile();
    } catch {
      // The compile below retries the save and reports a real failure.
    } finally {
      setTimeout(() => useDocumentStore.getState().setIsSaving(false), 300);
    }
  }
  await requestPreviewCompile(true);
}
