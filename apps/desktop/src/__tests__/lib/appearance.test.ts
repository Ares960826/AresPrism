import { describe, expect, it } from "vitest";
import {
  editorFontStack,
  uiFontStack,
  applyAppearance,
} from "@/lib/appearance";

describe("appearance stacks", () => {
  it("keeps CJK fallbacks on UI fonts", () => {
    expect(uiFontStack("system")).toContain("PingFang SC");
    expect(uiFontStack("geist")).toContain("Geist");
  });

  it("keeps a monospace fallback on editor fonts", () => {
    expect(editorFontStack("jetbrains")).toContain("JetBrains Mono");
    expect(editorFontStack("system-mono")).toContain("monospace");
  });

  it("writes CSS variables onto the document", () => {
    applyAppearance({
      uiFont: "system",
      editorFont: "fira",
      uiFontSize: 15,
      editorFontSize: 13,
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--app-font-size")).toBe("15px");
    expect(style.getPropertyValue("--editor-font-size")).toBe("13px");
    expect(style.getPropertyValue("--editor-font-family")).toContain(
      "Fira Code",
    );
    expect(style.getPropertyValue("--font-sans")).toContain("system-ui");
  });
});
