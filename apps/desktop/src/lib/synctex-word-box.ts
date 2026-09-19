export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function wordHighlightInLine(
  lineText: string,
  bbox: Box,
  word: string,
): Box | null {
  const needle = word.trim();
  if (!needle || !lineText) return null;
  let idx = lineText.indexOf(needle);
  if (idx < 0) {
    idx = lineText.toLowerCase().indexOf(needle.toLowerCase());
  }
  if (idx < 0) return null;
  const len = Math.max(lineText.length, 1);
  const matched = lineText.slice(idx, idx + needle.length);
  return {
    x: bbox.x + (idx / len) * bbox.w,
    y: bbox.y,
    w: Math.max((matched.length / len) * bbox.w, 4),
    h: bbox.h > 0 ? bbox.h : 12,
  };
}

export function findWordHighlight(
  lines: Array<{ text: string; bbox: Box; y: number }>,
  word: string,
  aroundY: number,
): Box | null {
  if (!word.trim() || lines.length === 0) return null;
  const ranked = [...lines].sort(
    (a, b) => Math.abs(a.y - aroundY) - Math.abs(b.y - aroundY),
  );
  for (const line of ranked.slice(0, 8)) {
    const hit = wordHighlightInLine(line.text, line.bbox, word);
    if (hit) return hit;
  }
  return null;
}
