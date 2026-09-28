import { expect, it } from "vitest";
import { pdfPageScrollTop } from "@/lib/pdf-scroll-position";

it("locates a later page whose own offsetTop is zero inside a positioned wrapper", () => {
  const container = document.createElement("div");
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  const page = document.createElement("div");
  wrapper.append(page);
  container.append(wrapper);
  container.scrollTop = 200;
  Object.defineProperty(container, "offsetHeight", { value: 600 });
  container.getBoundingClientRect = () => ({ top: 80, height: 600 }) as DOMRect;
  page.getBoundingClientRect = () => ({ top: 1080 }) as DOMRect;
  expect(page.offsetTop).toBe(0);
  expect(pdfPageScrollTop(container, page)).toBe(1200);
  // App zoom changes viewport geometry, while scrollTop and SyncTeX offsets stay in CSS pixels.
  container.getBoundingClientRect = () =>
    ({ top: 160, height: 1200 }) as DOMRect;
  page.getBoundingClientRect = () => ({ top: 2160 }) as DOMRect;
  expect(pdfPageScrollTop(container, page)).toBe(1200);
});
