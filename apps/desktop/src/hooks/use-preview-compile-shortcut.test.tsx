import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePreviewCompileShortcut } from "./use-preview-compile-shortcut";

const compile = vi.fn();
let root: ReturnType<typeof createRoot>;
function Harness() {
  usePreviewCompileShortcut(compile);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  compile.mockClear();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
function key(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
}
it("compiles with Cmd+Enter and Ctrl+Enter while preview has focus", () => {
  expect(key({ metaKey: true }).defaultPrevented).toBe(true);
  expect(key({ ctrlKey: true }).defaultPrevented).toBe(true);
  expect(compile).toHaveBeenCalledTimes(2);
});
it("does not duplicate editor-handled shortcuts or compile during IME composition or key repeat", () => {
  const handled = new KeyboardEvent("keydown", {
    key: "Enter",
    metaKey: true,
    cancelable: true,
  });
  handled.preventDefault();
  window.dispatchEvent(handled);
  key();
  key({ metaKey: true, isComposing: true });
  key({ metaKey: true, repeat: true });
  key({ metaKey: true, shiftKey: true });
  expect(compile).not.toHaveBeenCalled();
});
it("removes its listener when the preview is unmounted", async () => {
  await act(async () => root.render(null));
  key({ metaKey: true });
  expect(compile).not.toHaveBeenCalled();
});
