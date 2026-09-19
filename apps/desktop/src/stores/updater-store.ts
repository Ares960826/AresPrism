import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "available"; version: string; notes?: string }
  | { state: "downloading"; percent: number }
  | { state: "installing" }
  | { state: "ready" }
  | { state: "error"; message: string };

let pendingUpdate: Update | null = null;

interface UpdaterState {
  status: UpdateStatus;
  dismissed: boolean;
  lastCheckManual: boolean;
  checkForUpdate: (opts?: { silent?: boolean }) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: { state: "idle" },
  dismissed: false,
  lastCheckManual: false,
  dismiss: () => set({ dismissed: true }),
  checkForUpdate: async (opts) => {
    const silent = opts?.silent === true;
    set({
      status: { state: "checking" },
      dismissed: false,
      lastCheckManual: !silent,
    });
    try {
      const update = await check();
      if (!update) {
        pendingUpdate = null;
        set({ status: { state: "up-to-date" } });
        return;
      }
      pendingUpdate = update;
      set({
        status: {
          state: "available",
          version: update.version,
          notes: update.body ?? undefined,
        },
      });
    } catch (err) {
      pendingUpdate = null;
      if (silent) {
        set({ status: { state: "idle" } });
        return;
      }
      set({ status: { state: "error", message: String(err) } });
    }
  },
  installUpdate: async () => {
    const update = pendingUpdate;
    if (!update) {
      await get().checkForUpdate();
      return;
    }
    try {
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            set({ status: { state: "downloading", percent: 0 } });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              set({
                status: {
                  state: "downloading",
                  percent: Math.round((downloaded / contentLength) * 100),
                },
              });
            }
            break;
          case "Finished":
            set({ status: { state: "installing" } });
            break;
        }
      });
      set({ status: { state: "ready" } });
      window.setTimeout(() => {
        void relaunch();
      }, 1200);
    } catch (err) {
      set({ status: { state: "error", message: String(err) } });
    }
  },
}));
