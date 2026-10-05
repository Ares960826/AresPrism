import { useEffect } from "react";
import { saveAndCompile } from "@/lib/preview-compile";
import { invoke } from "@tauri-apps/api/core";
import {
  getAppZoomAction,
  shouldHandleAppZoomShortcut,
  zoomInApp,
  zoomOutApp,
  resetAppZoom,
} from "@/lib/app-zoom";
import { useSettingsStore } from "@/stores/settings-store";

/** Editors, inputs and text areas keep their native clipboard shortcuts. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".cm-editor")) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleZoomKeyDown = (e: KeyboardEvent) => {
      const zoomAction = getAppZoomAction(e);
      if (!zoomAction || !shouldHandleAppZoomShortcut(e.target)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat)
        void (zoomAction === "in"
          ? zoomInApp()
          : zoomAction === "out"
            ? zoomOutApp()
            : resetAppZoom());
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useSettingsStore.getState().setSettingsOpen(true);
      }

      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      // Cmd+S / Ctrl+S: save, then compile the paper (same as Cmd+Enter).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        void saveAndCompile().catch(() => {});
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        invoke("create_new_window").catch(console.error);
      }

      // Cmd+X (macOS) / Ctrl+X (others): Capture & Ask, but only when no text
      // field owns the keystroke — there it must stay the native Cut.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "x" &&
        !e.shiftKey &&
        !e.altKey &&
        !isTextEditingTarget(e.target) &&
        !hasTextSelection()
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-capture-mode"));
      }

      // Cmd+Shift+D (macOS) / Ctrl+Shift+D (others): Toggle debug panel
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-debug-panel"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleZoomKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleZoomKeyDown, true);
    };
  }, []);
}
