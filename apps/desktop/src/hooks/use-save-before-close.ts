import { createLogger } from "@/lib/debug/logger";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDocumentStore } from "@/stores/document-store";

const log = createLogger("save-before-close");

export function useSaveBeforeClose() {
  useEffect(() => {
    const window = getCurrentWindow();
    let disposed = false;
    let closing = false;
    let saved = false;
    const stops: Array<() => void> = [];
    const register = (stop: () => void) =>
      disposed ? stop() : stops.push(stop);
    const close = async () => {
      if (closing || disposed) return;
      closing = true;
      try {
        log.info("Saving before closing window");
        await useDocumentStore.getState().saveAllFiles();
        if (!disposed) {
          saved = true;
          await window.close();
        }
      } catch (error) {
        log.warn("Window retained after save failure", {
          error: String(error),
        });
        // saveError remains visible and the window retains all dirty buffers.
      } finally {
        closing = false;
      }
    };
    void window
      .onCloseRequested((event) => {
        if (saved) return;
        event.preventDefault();
        void close();
      })
      .then(register);
    void listen("ares:save-before-quit", () => void close()).then(register);
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, []);
}
