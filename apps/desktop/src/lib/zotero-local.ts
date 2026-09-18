import { invoke } from "@tauri-apps/api/core";

export const INSERT_LATEX_EVENT = "ares-prism-insert-latex";

export interface ZoteroLocalStatus {
  found: boolean;
  data_dir: string | null;
  error: string | null;
}

export interface ZoteroCollectionNode {
  key: string;
  name: string;
  parent_key: string | null;
  item_count: number;
  children: ZoteroCollectionNode[];
}

export interface ZoteroLocalItem {
  key: string;
  title: string;
  creators: string;
  year: string | null;
  item_type: string;
  citekey: string;
}

export interface ZoteroLocalItemDetail {
  item: ZoteroLocalItem;
  publication: string | null;
  abstract_note: string | null;
  bibtex: string;
}

export function insertLatex(text: string) {
  window.dispatchEvent(new CustomEvent(INSERT_LATEX_EVENT, { detail: text }));
}

export function insertCite(citekey: string) {
  insertLatex(`\\cite{${citekey}}`);
}

export async function zoteroLocalStatus(): Promise<ZoteroLocalStatus> {
  return invoke("zotero_local_status");
}

export async function zoteroLocalOpen(
  dataDir?: string | null,
): Promise<ZoteroLocalStatus> {
  return invoke("zotero_local_open", { dataDir: dataDir ?? null });
}

export async function zoteroLocalTree(): Promise<ZoteroCollectionNode[]> {
  return invoke("zotero_local_tree");
}

export async function zoteroLocalItems(
  collectionKey?: string | null,
): Promise<ZoteroLocalItem[]> {
  return invoke("zotero_local_items", { collectionKey: collectionKey ?? null });
}

export async function zoteroLocalItemDetail(
  itemKey: string,
): Promise<ZoteroLocalItemDetail> {
  return invoke("zotero_local_item_detail", { itemKey });
}

export async function zoteroLocalBibtex(opts: {
  collectionKey?: string | null;
  itemKey?: string | null;
}): Promise<string> {
  return invoke("zotero_local_bibtex", {
    collectionKey: opts.collectionKey ?? null,
    itemKey: opts.itemKey ?? null,
  });
}
