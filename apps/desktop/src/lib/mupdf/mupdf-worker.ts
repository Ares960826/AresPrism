import type { PDFDocument } from "mupdf";
import { normalizeStructuredText } from "./stext";

type MupdfModule = typeof import("mupdf");

type MupdfWasmModuleConfig = {
  locateFile?: (path: string) => string;
};

const wasmModuleConfig = ((
  globalThis as typeof globalThis & {
    $libmupdf_wasm_Module?: MupdfWasmModuleConfig;
  }
).$libmupdf_wasm_Module ??= {});

// In Vite dev, requests for /node_modules/.../mupdf-wasm.wasm can fall back to
// index.html. Pointing MuPDF at Vite's @fs URL keeps worker startup on the
// actual binary during local development without changing packaged builds.
if (import.meta.env.DEV) {
  const devWasmUrl = `/@fs/${__MUPDF_WASM_FS_PATH__}`;
  wasmModuleConfig.locateFile = (path: string) => {
    if (path.endsWith("mupdf-wasm.wasm")) {
      return devWasmUrl;
    }
    return path;
  };
}

const mupdf: MupdfModule = await import("mupdf");

const documentMap = new Map<number, PDFDocument>();
let nextDocId = 1;

const methods: Record<string, (...args: any[]) => any> = {};

methods.openDocument = (buffer: ArrayBuffer, magic: string): number => {
  const docId = nextDocId++;
  const doc = mupdf.Document.openDocument(
    buffer,
    magic,
  ) as unknown as PDFDocument;
  documentMap.set(docId, doc);
  return docId;
};

methods.closeDocument = (docId: number): void => {
  const doc = documentMap.get(docId);
  if (doc) {
    documentMap.delete(docId);
    doc.destroy();
  }
};

methods.countPages = (docId: number): number => {
  const doc = documentMap.get(docId)!;
  return doc.countPages();
};

methods.getPageSize = (
  docId: number,
  pageIndex: number,
): { width: number; height: number } => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  try {
    const bounds = page.getBounds();
    return {
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    };
  } finally {
    page.destroy();
  }
};

methods.getAllPageSizes = (
  docId: number,
): { width: number; height: number }[] => {
  const doc = documentMap.get(docId)!;
  const count = doc.countPages();
  const sizes: { width: number; height: number }[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    try {
      const bounds = page.getBounds();
      sizes.push({
        width: bounds[2] - bounds[0],
        height: bounds[3] - bounds[1],
      });
    } finally {
      page.destroy();
    }
  }
  return sizes;
};

methods.drawPage = (
  docId: number,
  pageIndex: number,
  dpi: number,
): ImageData => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  try {
    const scale = dpi / 72;
    const matrix = mupdf.Matrix.scale(scale, scale);
    // alpha=false so the PDF's white background is rendered opaquely (RGB, 3 bytes/pixel)
    const pixmap = page.toPixmap(
      matrix,
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      const w = pixmap.getWidth();
      const h = pixmap.getHeight();
      const rgb = pixmap.getPixels();
      // Convert RGB (3 bytes/pixel) → RGBA (4 bytes/pixel) for ImageData
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
        rgba[j] = rgb[i];
        rgba[j + 1] = rgb[i + 1];
        rgba[j + 2] = rgb[i + 2];
        rgba[j + 3] = 255; // fully opaque
      }
      return new ImageData(rgba, w, h);
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
};

methods.getPageText = (docId: number, pageIndex: number): unknown => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  try {
    const stext = page.toStructuredText("preserve-whitespace");
    let raw;
    try {
      raw = JSON.parse(stext.asJSON());
    } finally {
      stext.destroy();
    }

    return normalizeStructuredText(raw);
  } finally {
    page.destroy();
  }
};

methods.getPageLinks = (docId: number, pageIndex: number): unknown[] => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  try {
    const links = page.getLinks();
    try {
      return links.map((link: any) => {
        const bounds = link.getBounds();
        const uri: string = link.getURI() || "";
        const isExternal: boolean =
          link.isExternal?.() ?? uri.startsWith("http");
        let href: string;
        if (isExternal) {
          href = uri;
        } else {
          try {
            const resolved = doc.resolveLink(uri) as any;
            if (typeof resolved === "number") {
              href = `#page=${resolved + 1}`;
            } else if (resolved && typeof resolved.page === "number") {
              href = `#page=${resolved.page + 1}`;
            } else {
              href = uri;
            }
          } catch {
            href = uri;
          }
        }
        return {
          x: bounds[0],
          y: bounds[1],
          w: bounds[2] - bounds[0],
          h: bounds[3] - bounds[1],
          href,
          isExternal,
        };
      });
    } finally {
      for (const link of links) link.destroy();
    }
  } finally {
    page.destroy();
  }
};

methods.renderThumbnail = (
  docId: number,
  pageIndex: number,
  targetWidth: number,
): ArrayBuffer => {
  const doc = documentMap.get(docId)!;
  const page = doc.loadPage(pageIndex);
  try {
    const bounds = page.getBounds();
    const pageWidth = bounds[2] - bounds[0];
    const retinaScale = 2;
    const scale = (targetWidth * retinaScale) / pageWidth;
    const matrix = mupdf.Matrix.scale(scale, scale);
    const pixmap = page.toPixmap(
      matrix,
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      const png = pixmap.asPNG();
      return png.slice().buffer as ArrayBuffer;
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
};

// RPC message handler
self.onmessage = (event: MessageEvent) => {
  const [func, id, args] = event.data as [string, number, unknown[]];
  try {
    const result = methods[func](...args);
    if (result instanceof ImageData) {
      postMessage(["RESULT", id, result], { transfer: [result.data.buffer] });
    } else if (result instanceof ArrayBuffer) {
      postMessage(["RESULT", id, result], { transfer: [result] });
    } else {
      postMessage(["RESULT", id, result]);
    }
  } catch (error: any) {
    postMessage(["ERROR", id, { name: error.name, message: error.message }]);
  }
};

postMessage(["INIT", 0, Object.keys(methods)]);
