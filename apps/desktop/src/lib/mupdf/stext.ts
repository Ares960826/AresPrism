import type { StructuredTextData, StructuredTextLine } from "./types";

const DEFAULT_FONT = {
  name: "",
  family: "",
  size: 12,
  weight: "normal",
  style: "normal",
};

/** MuPDF's `asJSON()` text: lines carry `text`, `font`, `x`, `y` directly
 *  (current MuPDF), or nested `spans[].chars[]` (older builds). */
export function normalizeStructuredText(raw: any): StructuredTextData {
  const blocks = (raw?.blocks ?? [])
    .filter((block: any) => block?.type === "text")
    .map((block: any) => ({
      type: "text" as const,
      bbox: block.bbox ?? { x: 0, y: 0, w: 0, h: 0 },
      lines: (block.lines ?? []).map((line: any): StructuredTextLine => {
        const spans: any[] = line.spans ?? [];
        const bbox = line.bbox ?? { x: 0, y: 0, w: 0, h: 0 };
        let text: string = typeof line.text === "string" ? line.text : "";
        let font = line.font
          ? { ...DEFAULT_FONT, ...line.font }
          : { ...DEFAULT_FONT };
        let baseline: number | undefined =
          typeof line.y === "number" ? line.y : undefined;
        if (!text && spans.length > 0) {
          text = spans
            .map((span) => (span.chars ?? []).map((ch: any) => ch.c).join(""))
            .join("");
          const first = spans[0];
          font = {
            name: first.font?.name || "",
            family: first.font?.family || "",
            size: first.size || first.font?.size || 12,
            weight: first.font?.weight || "normal",
            style: first.font?.style || "normal",
          };
          baseline = first.chars?.[0]?.origin?.y;
        }
        return {
          bbox,
          wmode: line.wmode || 0,
          x: typeof line.x === "number" ? line.x : bbox.x,
          y: baseline ?? bbox.y + bbox.h,
          text,
          font,
        };
      }),
    }));
  return { blocks };
}
