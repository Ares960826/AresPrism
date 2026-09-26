import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireDocument,
  clearDocCache,
  getOrOpenDocument,
} from "./pdf-doc-cache";
const client = vi.hoisted(() => ({
  openDocument: vi.fn(),
  closeDocument: vi.fn(async () => {}),
  getAllPageSizes: vi.fn(async () => [{ width: 100, height: 200 }]),
}));
vi.mock("./mupdf-client", () => ({ getMupdfClient: () => client }));

beforeEach(async () => {
  await clearDocCache();
  vi.clearAllMocks();
  let id = 0;
  client.openDocument.mockImplementation(async () => ++id);
});

describe("PDF cache ownership", () => {
  it("never aliases two different documents with matching sampled bytes", async () => {
    const first = new Uint8Array(580);
    const second = first.slice();
    second[357] = 42;
    const a = await getOrOpenDocument(first);
    const b = await getOrOpenDocument(second);
    expect(a.docId).not.toBe(b.docId);
  });
  it("coalesces simultaneous opens of the same immutable content", async () => {
    const bytes = new Uint8Array(100);
    const docs = await Promise.all(
      Array.from({ length: 8 }, () => acquireDocument(bytes)),
    );
    expect(new Set(docs.map((doc) => doc.docId)).size).toBe(1);
    expect(client.openDocument).toHaveBeenCalledTimes(1);
    docs.forEach((doc) => doc.release());
  });
  it("keeps concurrent idle cache opens within the five-document limit", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => getOrOpenDocument(new Uint8Array(100))),
    );
    expect(client.openDocument).toHaveBeenCalledTimes(8);
    expect(client.closeDocument).toHaveBeenCalledTimes(3);
  });
  it("never evicts a live viewer and trims after its lease is released", async () => {
    const docs = await Promise.all(
      Array.from({ length: 8 }, () => acquireDocument(new Uint8Array(100))),
    );
    expect(client.closeDocument).not.toHaveBeenCalled();
    docs.forEach((doc) => doc.release());
    await vi.waitFor(() =>
      expect(client.closeDocument).toHaveBeenCalledTimes(3),
    );
  });
  it("closes a document whose open finishes after project teardown", async () => {
    let finish!: (id: number) => void;
    client.openDocument.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const opening = acquireDocument(new Uint8Array(100));
    const rejected = expect(opening).rejects.toThrow("closed");
    await vi.waitFor(() => expect(client.openDocument).toHaveBeenCalled());
    const clearing = clearDocCache();
    finish(123);
    await rejected;
    await clearing;
    expect(client.closeDocument).toHaveBeenCalledWith(123);
  });
});
