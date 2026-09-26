import type {
  StructuredTextData,
  LinkData,
  PageSize,
  WorkerResponse,
} from "./types";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("mupdf-worker");

export interface MupdfClient {
  openDocument(buffer: ArrayBuffer, magic?: string): Promise<number>;
  closeDocument(docId: number): Promise<void>;
  countPages(docId: number): Promise<number>;
  getPageSize(docId: number, pageIndex: number): Promise<PageSize>;
  getAllPageSizes(docId: number): Promise<PageSize[]>;
  drawPage(docId: number, pageIndex: number, dpi: number): Promise<ImageData>;
  getPageText(docId: number, pageIndex: number): Promise<StructuredTextData>;
  getPageLinks(docId: number, pageIndex: number): Promise<LinkData[]>;
  renderThumbnail(
    docId: number,
    pageIndex: number,
    targetWidth: number,
  ): Promise<ArrayBuffer>;
  destroy(): void;
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

function createClient(): MupdfClient {
  const worker = new Worker(new URL("./mupdf-worker.ts", import.meta.url), {
    type: "module",
  });

  const pending = new Map<number, PendingRequest>();
  let nextId = 1;
  let ready: Promise<void>;
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  let failure: Error | null = null;

  ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const initTimer = setTimeout(
    () => fail(new Error("MuPDF initialization timed out")),
    30_000,
  );
  function fail(error: Error) {
    if (failure) return;
    failure = error;
    clearTimeout(initTimer);
    rejectReady(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker.terminate();
    if (instance === client) instance = null;
  }

  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as WorkerResponse;
    const [type, id, payload] = data;

    if (type === "INIT") {
      log.info("Worker initialized");
      clearTimeout(initTimer);
      resolveReady();
      return;
    }

    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);

    if (type === "RESULT") {
      request.resolve(payload);
    } else if (type === "ERROR") {
      const err = payload as { name: string; message: string };
      request.reject(new Error(`${err.name}: ${err.message}`));
    }
  };

  worker.onerror = (event) => {
    log.error("Worker fatal error", { message: event.message });
    fail(new Error(event.message || "MuPDF worker failed"));
  };

  const CALL_TIMEOUT_MS = 30_000;

  function call(method: string, ...args: unknown[]): Promise<any> {
    return ready.then(() => {
      if (failure) throw failure;
      return new Promise((resolve, reject) => {
        const id = nextId++;

        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(
              new Error(
                `MuPDF worker timeout: ${method} took longer than ${CALL_TIMEOUT_MS}ms`,
              ),
            );
          }
        }, CALL_TIMEOUT_MS);

        pending.set(id, {
          resolve: (value: any) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            reject(error);
          },
        });

        const transferables: Transferable[] = [];
        for (const arg of args) {
          if (arg instanceof ArrayBuffer) {
            transferables.push(arg);
          }
        }

        try {
          worker.postMessage([method, id, args], { transfer: transferables });
        } catch (error) {
          pending
            .get(id)
            ?.reject(error instanceof Error ? error : new Error(String(error)));
          pending.delete(id);
        }
      });
    });
  }

  const client: MupdfClient = {
    openDocument: (buffer, magic = "application/pdf") =>
      call("openDocument", buffer, magic),
    closeDocument: (docId) => call("closeDocument", docId),
    countPages: (docId) => call("countPages", docId),
    getPageSize: (docId, pageIndex) => call("getPageSize", docId, pageIndex),
    getAllPageSizes: (docId) => call("getAllPageSizes", docId),
    drawPage: (docId, pageIndex, dpi) =>
      call("drawPage", docId, pageIndex, dpi),
    getPageText: (docId, pageIndex) => call("getPageText", docId, pageIndex),
    getPageLinks: (docId, pageIndex) => call("getPageLinks", docId, pageIndex),
    renderThumbnail: (docId, pageIndex, targetWidth) =>
      call("renderThumbnail", docId, pageIndex, targetWidth),
    destroy: () => fail(new Error("MuPDF worker was closed")),
  };
  return client;
}

let instance: MupdfClient | null = null;

export function getMupdfClient(): MupdfClient {
  if (!instance) {
    instance = createClient();
  }
  return instance;
}

/** Terminate the current worker and clear the singleton, forcing recreation on next use. */
export function resetMupdfClient(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
