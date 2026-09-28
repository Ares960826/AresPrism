import { afterEach, expect, it, vi } from "vitest";
import { observePreviewScroll } from "@/lib/pdf-scroll-observer";

afterEach(() => vi.unstubAllGlobals());

it("keeps cursor following through initialization and reattachment, pauses only on scrolling", () => {
  let pending: (() => void) | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const container = document.createElement("div");
  const report = vi.fn();
  const pause = vi.fn();
  let programmatic = false;
  let dispose = observePreviewScroll(
    container,
    report,
    pause,
    () => programmatic,
  );
  pending?.();
  expect(report).toHaveBeenCalledOnce();
  expect(pause).not.toHaveBeenCalled();
  dispose();
  dispose = observePreviewScroll(container, report, pause, () => programmatic);
  pending?.();
  expect(pause).not.toHaveBeenCalled();
  programmatic = true;
  container.dispatchEvent(new Event("scroll"));
  expect(pause).not.toHaveBeenCalled();
  programmatic = false;
  container.dispatchEvent(new Event("scroll"));
  expect(pause).toHaveBeenCalledOnce();
  dispose();
  container.dispatchEvent(new Event("scroll"));
  expect(pause).toHaveBeenCalledOnce();
});
