import { useEffect, useRef, useState, useCallback, memo } from "react";
import { getMupdfClient } from "@/lib/mupdf/mupdf-client";
import { createLogger } from "@/lib/debug/logger";
import { APP_VISIBILITY_RESTORED } from "@/lib/debug/log-store";
import type { StructuredTextData, LinkData } from "@/lib/mupdf/types";

const log = createLogger("mupdf-page");

let measureContext: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

/** Width of `text` at 1px font size, scaled; used to stretch each line's
 *  transparent text to the width it occupies on the rendered page. */
function measureTextWidth(text: string, fontPx: number, family: string) {
  const key = `${family}\u0000${text}`;
  let unit = widthCache.get(key);
  if (unit === undefined) {
    if (measureContext === undefined)
      measureContext = document.createElement("canvas").getContext("2d");
    if (!measureContext) return 0;
    measureContext.font = `100px ${family}`;
    unit = measureContext.measureText(text).width / 100;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, unit);
  }
  return unit * fontPx;
}

function cssFontFamily(family: string) {
  if (/mono/i.test(family)) return "monospace";
  if (/sans/i.test(family)) return "sans-serif";
  return "serif";
}
const RENDER_SCALE_DEBOUNCE_MS = 260;

interface MupdfPageProps {
  docId: number;
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  isVisible: boolean;
}

/** Check if a canvas appears blank (GPU context was silently invalidated).
 *  Uses a single getImageData call covering a small center region. */
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true; // context fully lost
  // Sample a 2x2 region from the center in one GPU readback
  const cx = Math.max(0, Math.floor(canvas.width / 2) - 1);
  const cy = Math.max(0, Math.floor(canvas.height / 2) - 1);
  const data = ctx.getImageData(cx, cy, 2, 2).data;
  // If all sampled pixels have zero alpha, canvas is blank
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

export const MupdfPage = memo(function MupdfPage({
  docId,
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  isVisible,
}: MupdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [textData, setTextData] = useState<StructuredTextData | null>(null);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [renderScale, setRenderScale] = useState(scale);
  const renderGenRef = useRef(0);

  const cssW = pageWidth * scale;
  const cssH = pageHeight * scale;

  useEffect(() => {
    setRenderScale(scale);
  }, [docId, pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isVisible || docId <= 0) return;
    const timeout = window.setTimeout(
      () => setRenderScale(scale),
      RENDER_SCALE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [docId, isVisible, scale]);

  /** Re-render the page onto the canvas via MuPDF worker. */
  const renderPage = useCallback(() => {
    if (!isVisible || docId <= 0) return;

    const gen = ++renderGenRef.current;
    const client = getMupdfClient();
    const dpr = window.devicePixelRatio || 1;
    const dpi = renderScale * 72 * dpr;

    client
      .drawPage(docId, pageIndex, dpi)
      .then(async (imageData) => {
        if (gen !== renderGenRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const bitmap = await createImageBitmap(imageData);
        if (gen !== renderGenRef.current) {
          bitmap.close();
          return;
        }
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch((err) => {
        if (gen !== renderGenRef.current) return;
        log.error(`Render error page ${pageIndex}`, { error: String(err) });
      });
  }, [docId, pageIndex, renderScale, isVisible]);

  // Render the canvas immediately on load, then at debounced high-quality zoom.
  useEffect(() => {
    if (!isVisible || docId <= 0) return;
    renderPage();
  }, [docId, pageIndex, renderScale, isVisible, renderPage]);

  useEffect(() => {
    const release = () => {
      if (isVisible) return;
      const page = canvasRef.current?.parentElement;
      const selection = window.getSelection();
      if (
        page &&
        selection &&
        !selection.isCollapsed &&
        selection.containsNode(page, true)
      )
        return;
      ++renderGenRef.current;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setTextData(null);
      setLinks([]);
    };
    release();
    document.addEventListener("selectionchange", release);
    return () => {
      ++renderGenRef.current;
      document.removeEventListener("selectionchange", release);
    };
  }, [docId, isVisible]);

  // Text and link layers do not need to be refetched for every zoom change.
  useEffect(() => {
    if (!isVisible || docId <= 0) return;
    let cancelled = false;

    const client = getMupdfClient();

    client
      .getPageText(docId, pageIndex)
      .then((data) => {
        if (cancelled) return;
        setTextData(data);
      })
      .catch(() => {});

    client
      .getPageLinks(docId, pageIndex)
      .then((data) => {
        if (cancelled) return;
        setLinks(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex, isVisible]);

  // Re-render canvas when returning from background if content was lost
  useEffect(() => {
    const handleVisibilityRestored = () => {
      const canvas = canvasRef.current;
      if (!canvas || !isVisible || docId <= 0) return;
      if (isCanvasBlank(canvas)) {
        log.warn(
          `Canvas blank after visibility restore, re-rendering page ${pageIndex}`,
        );
        renderPage();
      }
    };

    window.addEventListener(APP_VISIBILITY_RESTORED, handleVisibilityRestored);
    return () =>
      window.removeEventListener(
        APP_VISIBILITY_RESTORED,
        handleVisibilityRestored,
      );
  }, [docId, pageIndex, scale, isVisible, renderPage]);

  return (
    <div
      className="mupdf-page relative mb-4 shadow-lg"
      data-page-number={pageIndex + 1}
      style={{ width: cssW, height: cssH }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: cssW, height: cssH, display: "block" }}
      />

      {/* Text layer: transparent HTML text over the canvas, so the native
          selection (drag, double-click, Cmd+C) behaves like a PDF reader. */}
      {textData && (
        <div className="mupdf-text-layer" style={{ width: cssW, height: cssH }}>
          {textData.blocks.map(
            (block, bi) =>
              block.type === "text" &&
              block.lines.map((line, li) => {
                if (!line.text || line.bbox.w <= 0 || line.bbox.h <= 0)
                  return null;
                const fontPx = Math.max(1, line.font.size * scale);
                const family = cssFontFamily(line.font.family);
                const natural = measureTextWidth(line.text, fontPx, family);
                const scaleX =
                  natural > 0 ? (line.bbox.w * scale) / natural : 1;
                const isLast = li === block.lines.length - 1;
                return (
                  <span
                    key={`${bi}-${li}`}
                    style={{
                      left: line.bbox.x * scale,
                      top: line.bbox.y * scale,
                      height: line.bbox.h * scale,
                      lineHeight: `${line.bbox.h * scale}px`,
                      fontSize: fontPx,
                      fontFamily: family,
                      transform: `scaleX(${scaleX})`,
                    }}
                  >
                    {line.text}
                    {isLast ? "\n" : " "}
                  </span>
                );
              }),
          )}
        </div>
      )}

      {/* Link layer */}
      {links.length > 0 && (
        <div className="mupdf-link-layer">
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              data-external={link.isExternal ? "true" : undefined}
              style={{
                left: `${(link.x / pageWidth) * 100}%`,
                top: `${(link.y / pageHeight) * 100}%`,
                width: `${(link.w / pageWidth) * 100}%`,
                height: `${(link.h / pageHeight) * 100}%`,
              }}
            >
              <span className="sr-only">Link</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
});
