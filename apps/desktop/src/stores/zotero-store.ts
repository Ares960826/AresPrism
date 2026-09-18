import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  zoteroLocalOpen,
  zoteroLocalStatus,
  zoteroLocalTree,
  zoteroLocalItems,
  zoteroLocalItemDetail,
  zoteroLocalBibtex,
  type ZoteroCollectionNode,
  type ZoteroLocalItem,
  type ZoteroLocalItemDetail,
} from "@/lib/zotero-local";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createFileOnDisk } from "@/lib/tauri/fs";
import {
  citationFormatForFile,
  convertCitation,
  isCitationFileName,
} from "@/lib/citation-file";
import { createLogger } from "@/lib/debug/logger";
import { STORAGE_KEYS } from "@/lib/app-identity";

const log = createLogger("zotero");

export interface CollectionSyncInfo {
  collectionKey: string | null;
  name: string;
  bibFileName: string;
}

type ProjectSyncedCollections = Record<
  string,
  Record<string, CollectionSyncInfo>
>;

const MYLIB_KEY = "__my_library__";
function storeKey(collectionKey: string | null): string {
  return collectionKey ?? MYLIB_KEY;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function parseBibEntries(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  const parts = content.split(/\n(?=@)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/@\w+\{([^,\s]+)/);
    if (match) {
      entries.set(match[1], trimmed);
    }
  }
  return entries;
}

export interface ZoteroImportUndo {
  fileId: string;
  previousContent: string | null;
  created: boolean;
}

interface ZoteroState {
  dataDir: string | null;
  isConnected: boolean;
  isOpening: boolean;
  isLoadingTree: boolean;
  isLoadingItems: boolean;
  error: string | null;
  collections: ZoteroCollectionNode[];
  itemsByCollection: Record<string, ZoteroLocalItem[]>;
  activeCollectionKey: string | null;
  preview: ZoteroLocalItemDetail | null;
  syncedCollections: ProjectSyncedCollections;
  isSyncing: string | null;
  lastImport: ZoteroImportUndo | null;

  connectLocal: (dataDir?: string | null) => Promise<boolean>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  ensureItems: (collectionKey: string | null) => Promise<void>;
  previewItem: (itemKey: string) => Promise<void>;
  importCollectionToBib: (
    collectionKey: string | null,
    name: string,
  ) => Promise<void>;
  importItemToBib: (itemKey: string, citekey: string) => Promise<void>;
  undoLastImport: () => Promise<void>;
}

async function writeBibToProject(
  bibFileName: string,
  bibtex: string,
): Promise<ZoteroImportUndo> {
  const docStore = useDocumentStore.getState();
  if (!docStore.projectRoot) {
    throw new Error("Open a project before importing citations.");
  }
  const configured = useSettingsStore.getState().citationFile.trim();
  const targetName = configured || bibFileName;
  if (!isCitationFileName(targetName)) {
    throw new Error(
      `Citation file must be .bib, .bibtex, .json, .ris, or .enw (got "${targetName}").`,
    );
  }
  const format = citationFormatForFile(targetName);
  const existingFile = docStore.files.find(
    (f) => f.name === targetName || f.relativePath === targetName,
  );
  if (existingFile && format === "bibtex") {
    const current = existingFile.content ?? "";
    const entries = parseBibEntries(current);
    for (const [key, entry] of parseBibEntries(bibtex)) {
      entries.set(key, entry);
    }
    docStore.updateFileContent(
      existingFile.id,
      `${Array.from(entries.values()).join("\n\n")}\n`,
    );
    return {
      fileId: existingFile.id,
      previousContent: current,
      created: false,
    };
  }
  const converted = convertCitation(bibtex, format);
  if (existingFile) {
    const current = existingFile.content ?? "";
    docStore.updateFileContent(existingFile.id, converted);
    return {
      fileId: existingFile.id,
      previousContent: current,
      created: false,
    };
  }
  const fullPath = await createFileOnDisk(
    docStore.projectRoot,
    targetName,
    converted,
  );
  const fileId = docStore.addFile(
    {
      name: targetName.split(/[/\\]/).pop() || targetName,
      relativePath: targetName,
      absolutePath: fullPath,
      type: "bib",
      content: converted,
    },
    { activate: false },
  );
  return { fileId, previousContent: null, created: true };
}

export const useZoteroStore = create<ZoteroState>()(
  persist(
    (set, get) => ({
      dataDir: null,
      isConnected: false,
      isOpening: false,
      isLoadingTree: false,
      isLoadingItems: false,
      error: null,
      collections: [],
      itemsByCollection: {},
      activeCollectionKey: null,
      preview: null,
      syncedCollections: {},
      isSyncing: null,
      lastImport: null,

      connectLocal: async (dataDir) => {
        set({ isOpening: true, error: null });
        try {
          const status = await zoteroLocalOpen(dataDir ?? get().dataDir);
          if (!status.found) {
            set({
              isOpening: false,
              isConnected: false,
              error: status.error,
            });
            return false;
          }
          set({
            dataDir: status.data_dir,
            isConnected: true,
            isOpening: false,
            isLoadingTree: true,
          });
          const collections = await zoteroLocalTree();
          set({ collections, isLoadingTree: false, itemsByCollection: {} });
          return true;
        } catch (err) {
          set({
            isOpening: false,
            isConnected: false,
            error: err instanceof Error ? err.message : String(err),
          });
          return false;
        }
      },

      disconnect: () => {
        set({
          isConnected: false,
          collections: [],
          itemsByCollection: {},
          preview: null,
          activeCollectionKey: null,
          error: null,
          lastImport: null,
        });
      },

      refresh: async () => {
        const { dataDir, isConnected } = get();
        if (!isConnected) {
          const status = dataDir
            ? { found: true, data_dir: dataDir, error: null }
            : await zoteroLocalStatus();
          if (status.found) {
            await get().connectLocal(status.data_dir);
          } else {
            set({ error: status.error });
          }
          return;
        }
        set({ isLoadingTree: true, error: null });
        try {
          if (dataDir) {
            await zoteroLocalOpen(dataDir);
          }
          const collections = await zoteroLocalTree();
          log.debug(`Loaded ${collections.length} top-level collections`);
          set({ collections, isLoadingTree: false, itemsByCollection: {} });
        } catch (err) {
          set({
            isLoadingTree: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      ensureItems: async (collectionKey) => {
        const key = storeKey(collectionKey);
        set({
          activeCollectionKey: collectionKey,
          isLoadingItems: true,
          preview: null,
        });
        try {
          const items = await zoteroLocalItems(collectionKey);
          set((s) => ({
            itemsByCollection: { ...s.itemsByCollection, [key]: items },
            isLoadingItems: false,
          }));
        } catch (err) {
          set({
            isLoadingItems: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      previewItem: async (itemKey) => {
        try {
          const preview = await zoteroLocalItemDetail(itemKey);
          set({ preview });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      importCollectionToBib: async (collectionKey, name) => {
        const docStore = useDocumentStore.getState();
        if (!docStore.projectRoot) {
          set({ error: "Open a project before importing BibTeX." });
          return;
        }
        const sk = storeKey(collectionKey);
        set({ isSyncing: sk, error: null });
        try {
          const bibtex = await zoteroLocalBibtex({ collectionKey });
          const bibFileName = `${sanitizeFileName(name) || "references"}.bib`;
          const lastImport = await writeBibToProject(bibFileName, bibtex);
          const projectRoot = docStore.projectRoot;
          set((s) => {
            const projectColls = s.syncedCollections[projectRoot] ?? {};
            return {
              syncedCollections: {
                ...s.syncedCollections,
                [projectRoot]: {
                  ...projectColls,
                  [sk]: { collectionKey, name, bibFileName },
                },
              },
              isSyncing: null,
              lastImport,
            };
          });
        } catch (err) {
          set({
            isSyncing: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      importItemToBib: async (itemKey, citekey) => {
        set({ error: null });
        try {
          const bibtex = await zoteroLocalBibtex({ itemKey });
          const lastImport = await writeBibToProject("references.bib", bibtex);
          log.debug(`Imported ${citekey} into references.bib`);
          set({ lastImport });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      undoLastImport: async () => {
        const undo = get().lastImport;
        if (!undo) return;
        const docStore = useDocumentStore.getState();
        if (undo.created) {
          await docStore.deleteFile(undo.fileId);
        } else if (undo.previousContent !== null) {
          docStore.updateFileContent(undo.fileId, undo.previousContent);
        }
        set({ lastImport: null });
      },
    }),
    {
      name: STORAGE_KEYS.zotero,
      partialize: (state) => ({
        dataDir: state.dataDir,
        syncedCollections: state.syncedCollections,
      }),
    },
  ),
);

export { storeKey, sanitizeFileName, parseBibEntries };
