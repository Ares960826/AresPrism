import { describe, expect, it } from "vitest";
import { findWordHighlight, wordHighlightInLine } from "@/lib/synctex-word-box";

describe("wordHighlightInLine", () => {
  it("places the word box by character offset in the line", () => {
    const box = wordHighlightInLine(
      "hello world",
      { x: 0, y: 10, w: 110, h: 12 },
      "world",
    );
    expect(box).not.toBeNull();
    expect(box!.x).toBeCloseTo(60);
    expect(box!.w).toBeCloseTo(50);
  });

  it("returns null when the word is not on the line", () => {
    expect(
      wordHighlightInLine("hello", { x: 0, y: 0, w: 50, h: 12 }, "world"),
    ).toBeNull();
  });
});

describe("findWordHighlight", () => {
  it("prefers the line closest to the SyncTeX y", () => {
    const hit = findWordHighlight(
      [
        { text: "alpha word", bbox: { x: 0, y: 20, w: 100, h: 10 }, y: 20 },
        { text: "beta word", bbox: { x: 0, y: 200, w: 100, h: 10 }, y: 200 },
      ],
      "word",
      198,
    );
    expect(hit).not.toBeNull();
    expect(hit!.y).toBe(200);
  });
});
