import { getMupdfClient, type MupdfClient } from "./mupdf-client";
import type { PageSize } from "./types";

export interface DocCacheResult {
  docId: number;
  pageSizes: PageSize[];
  cacheHit: boolean;
}
interface CachedDoc extends DocCacheResult {
  client: MupdfClient;
  users: number;
}
// Immutable byte-array identity is the content revision. Sampled fingerprints
// cannot distinguish different PDFs and must never be used for correctness.
const cache = new Map<Uint8Array, CachedDoc>();
const MAX_OPEN_DOCS = 5;
let epoch = 0;
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}
async function trimCache() {
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_OPEN_DOCS) break;
    if (entry.users > 0) continue;
    cache.delete(key);
    await entry.client.closeDocument(entry.docId).catch(() => {});
  }
}
export function getCachedDocument(data: Uint8Array): DocCacheResult | null {
  const entry = cache.get(data);
  if (!entry || entry.client !== getMupdfClient()) return null;
  cache.delete(data);
  cache.set(data, entry);
  return { docId: entry.docId, pageSizes: entry.pageSizes, cacheHit: true };
}
async function open(data: Uint8Array, retain: boolean): Promise<CachedDoc> {
  const requestedEpoch = epoch;
  return serialized(async () => {
    if (requestedEpoch !== epoch) throw new Error("PDF project was closed");
    const client = getMupdfClient();
    let entry = cache.get(data);
    if (entry?.client !== client) {
      if (entry) cache.delete(data);
      const buffer = data.slice().buffer;
      const docId = await client.openDocument(buffer);
      try {
        const pageSizes = await client.getAllPageSizes(docId);
        if (requestedEpoch !== epoch) throw new Error("PDF project was closed");
        entry = { docId, pageSizes, cacheHit: false, users: 0, client };
      } catch (error) {
        await client.closeDocument(docId).catch(() => {});
        throw error;
      }
    } else {
      entry.cacheHit = true;
    }
    if (retain) entry.users++;
    cache.delete(data);
    cache.set(data, entry);
    await trimCache();
    return entry;
  });
}
export async function getOrOpenDocument(
  data: Uint8Array,
): Promise<DocCacheResult> {
  return open(data, false);
}
/** A mounted, active viewer owns a lease; an idle cache entry never owns a viewer. */
export async function acquireDocument(data: Uint8Array) {
  const entry = await open(data, true);
  let released = false;
  return {
    docId: entry.docId,
    pageSizes: entry.pageSizes,
    release() {
      if (released) return;
      released = true;
      entry.users--;
      void serialized(trimCache);
    },
  };
}
export function invalidateDoc(docId: number): void {
  for (const [key, entry] of cache) {
    if (entry.docId === docId) {
      cache.delete(key);
      void entry.client.closeDocument(docId).catch(() => {});
    }
  }
}
export async function clearDocCache(): Promise<void> {
  epoch++;
  const entries = [...cache.values()];
  cache.clear();
  await Promise.all(
    entries.map((entry) =>
      entry.client.closeDocument(entry.docId).catch(() => {}),
    ),
  );
  await queue;
}
