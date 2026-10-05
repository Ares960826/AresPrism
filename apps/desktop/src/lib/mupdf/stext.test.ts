import { describe, expect, it } from "vitest";
import { normalizeStructuredText } from "./stext";

describe("normalizeStructuredText", () => {
  it("reads current MuPDF lines that carry text directly", () => {
    const data = normalizeStructuredText({
      blocks: [
        {
          type: "text",
          bbox: { x: 195, y: 108, w: 203, h: 17 },
          lines: [
            {
              wmode: 0,
              bbox: { x: 195, y: 108, w: 203, h: 17 },
              font: { name: "LMRoman17", family: "serif", size: 17 },
              x: 195,
              y: 122,
              text: "Sampling and Reconstruction",
            },
          ],
        },
        { type: "image", bbox: { x: 0, y: 0, w: 1, h: 1 } },
      ],
    });
    expect(data.blocks).toHaveLength(1);
    const line = data.blocks[0].lines[0];
    expect(line.text).toBe("Sampling and Reconstruction");
    expect(line.y).toBe(122);
    expect(line.font.size).toBe(17);
    expect(line.font.weight).toBe("normal");
  });

  it("still reads the older nested spans format", () => {
    const data = normalizeStructuredText({
      blocks: [
        {
          type: "text",
          bbox: { x: 0, y: 0, w: 10, h: 10 },
          lines: [
            {
              bbox: { x: 1, y: 2, w: 8, h: 5 },
              spans: [
                {
                  size: 9,
                  font: { name: "F", family: "sans-serif" },
                  chars: [
                    { c: "H", origin: { x: 1, y: 6 } },
                    { c: "i", origin: { x: 2, y: 6 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const line = data.blocks[0].lines[0];
    expect(line.text).toBe("Hi");
    expect(line.y).toBe(6);
    expect(line.font).toMatchObject({ size: 9, family: "sans-serif" });
  });

  it("tolerates empty input", () => {
    expect(normalizeStructuredText(null)).toEqual({ blocks: [] });
  });
});
