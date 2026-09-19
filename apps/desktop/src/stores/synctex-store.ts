import { create } from "zustand";

export type SyncTexViewReason = "cursor" | "dblclick";

export interface SyncTexViewRequest {
  file: string;
  line: number;
  column: number;
  word: string | null;
  reason: SyncTexViewReason;
  nonce: number;
}

interface SyncTexState {
  viewRequest: SyncTexViewRequest | null;
  followPaused: boolean;
  requestView: (req: Omit<SyncTexViewRequest, "nonce">) => void;
  setFollowPaused: (paused: boolean) => void;
}

let nonce = 0;

export const useSyncTexStore = create<SyncTexState>()((set) => ({
  viewRequest: null,
  followPaused: false,
  requestView: (req) =>
    set({
      viewRequest: { ...req, nonce: ++nonce },
      followPaused: false,
    }),
  setFollowPaused: (paused) => set({ followPaused: paused }),
}));
