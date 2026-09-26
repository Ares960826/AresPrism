import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSaveBeforeClose } from "./use-save-before-close";
vi.mock("@/lib/debug/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}));
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  close: vi.fn(async () => {}),
  windowListener: vi.fn(),
  quitListener: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ saveAllFiles: mock.save }) },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mock.close,
    onCloseRequested: mock.windowListener,
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mock.quitListener }));
let closeHandler: (event: { preventDefault: () => void }) => void;
let quitHandler: () => void;
let root: ReturnType<typeof createRoot>;
function Harness() {
  useSaveBeforeClose();
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mock.save.mockResolvedValue(undefined);
  mock.windowListener.mockImplementation(async (handler) => {
    closeHandler = handler;
    return mock.stop;
  });
  mock.quitListener.mockImplementation(async (_name, handler) => {
    quitHandler = handler;
    return mock.stop;
  });
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it("waits for save before allowing native window close", async () => {
  let finish!: () => void;
  mock.save.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const preventDefault = vi.fn();
  closeHandler({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(mock.close).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  const allow = vi.fn();
  closeHandler({ preventDefault: allow });
  expect(allow).not.toHaveBeenCalled();
});
it("keeps failed saves open for both window close and Quit", async () => {
  mock.save.mockRejectedValue(new Error("Disk full"));
  closeHandler({ preventDefault: vi.fn() });
  await Promise.resolve();
  quitHandler();
  await Promise.resolve();
  expect(mock.close).not.toHaveBeenCalled();
});
