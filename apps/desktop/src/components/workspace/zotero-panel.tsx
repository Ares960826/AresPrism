import { useEffect, useState } from "react";
import {
  SettingsIcon,
  DownloadIcon,
  LoaderIcon,
  RefreshCwIcon,
  FolderIcon,
  LibraryIcon,
  QuoteIcon,
  CopyIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileTextIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  Undo2Icon,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useZoteroStore } from "@/stores/zotero-store";
import {
  insertCite,
  type ZoteroCollectionNode,
  type ZoteroLocalItem,
} from "@/lib/zotero-local";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MYLIB_KEY = "__my_library__";

export function ZoteroPanel() {
  const isConnected = useZoteroStore((s) => s.isConnected);
  const isOpening = useZoteroStore((s) => s.isOpening);
  const isLoadingTree = useZoteroStore((s) => s.isLoadingTree);
  const isLoadingItems = useZoteroStore((s) => s.isLoadingItems);
  const error = useZoteroStore((s) => s.error);
  const collections = useZoteroStore((s) => s.collections);
  const itemsByCollection = useZoteroStore((s) => s.itemsByCollection);
  const activeCollectionKey = useZoteroStore((s) => s.activeCollectionKey);
  const preview = useZoteroStore((s) => s.preview);
  const lastImport = useZoteroStore((s) => s.lastImport);
  const connectLocal = useZoteroStore((s) => s.connectLocal);
  const refresh = useZoteroStore((s) => s.refresh);
  const ensureItems = useZoteroStore((s) => s.ensureItems);
  const previewItem = useZoteroStore((s) => s.previewItem);
  const importCollectionToBib = useZoteroStore((s) => s.importCollectionToBib);
  const importItemToBib = useZoteroStore((s) => s.importItemToBib);
  const undoLastImport = useZoteroStore((s) => s.undoLastImport);
  const isSyncing = useZoteroStore((s) => s.isSyncing);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pickFolder = async () => {
    const dir = await openDialog({
      directory: true,
      title: "Zotero data folder",
    });
    if (typeof dir === "string") {
      await connectLocal(dir);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {lastImport && (
        <div className="flex shrink-0 items-center gap-1 border-sidebar-border border-b bg-muted/40 px-2 py-1">
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            Wrote {lastImport.fileId} without switching files.
          </p>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] hover:bg-sidebar-accent"
            onClick={() => void undoLastImport()}
          >
            <Undo2Icon className="size-3" />
            Undo
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {!isConnected ? (
          <NotConnectedView
            isOpening={isOpening}
            error={error}
            onOpenDefault={() => void connectLocal(null)}
            onPickFolder={() => void pickFolder()}
          />
        ) : (
          <div className="py-0.5">
            {error && (
              <div className="mx-2 mb-1 rounded bg-destructive/10 px-2 py-1 text-destructive text-xs">
                {error}
              </div>
            )}
            <p className="px-2 pb-1 text-[10px] text-muted-foreground">
              Expand a folder to see papers. Cite inserts at the cursor. Import
              BibTeX is in the folder menu.
            </p>
            <CollectionBranch
              name="My Library"
              icon={<LibraryIcon className="size-3.5" />}
              collectionKey={null}
              itemCount={undefined}
              childrenNodes={collections}
              depth={0}
              defaultOpen
              skipItems
              items={undefined}
              activeKey={activeCollectionKey}
              isLoadingItems={isLoadingItems}
              onEnsure={(key) => void ensureItems(key)}
              onPreview={(key) => void previewItem(key)}
              onImport={(key, name) => void importCollectionToBib(key, name)}
              onCite={insertCite}
              onCopyKey={(key) => void navigator.clipboard.writeText(key)}
              onImportItem={(itemKey, citekey) =>
                void importItemToBib(itemKey, citekey)
              }
              importingKey={isSyncing}
              itemsByCollection={itemsByCollection}
            />
            {isLoadingTree && (
              <div className="flex items-center gap-1 px-2 py-1 text-muted-foreground text-xs">
                <LoaderIcon className="size-3 animate-spin" />
                Loading collections...
              </div>
            )}
          </div>
        )}
      </div>
      {preview && (
        <div className="shrink-0 border-sidebar-border border-t px-2 py-1.5">
          <p className="truncate font-medium text-xs">{preview.item.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {preview.item.creators}
            {preview.item.year ? ` (${preview.item.year})` : ""}
          </p>
          {preview.publication && (
            <p className="truncate text-[11px] text-muted-foreground italic">
              {preview.publication}
            </p>
          )}
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {preview.item.citekey}
          </p>
          <div className="mt-1 flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[11px]"
              onClick={() => insertCite(preview.item.citekey)}
            >
              Cite
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() =>
                void importItemToBib(preview.item.key, preview.item.citekey)
              }
            >
              Add to .bib
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ZoteroHeader() {
  const isConnected = useZoteroStore((s) => s.isConnected);
  const dataDir = useZoteroStore((s) => s.dataDir);
  const isLoadingTree = useZoteroStore((s) => s.isLoadingTree);
  const refresh = useZoteroStore((s) => s.refresh);
  const disconnect = useZoteroStore((s) => s.disconnect);
  const connectLocal = useZoteroStore((s) => s.connectLocal);

  const pickFolder = async () => {
    const dir = await openDialog({
      directory: true,
      title: "Zotero data folder",
    });
    if (typeof dir === "string") {
      await connectLocal(dir);
    }
  };

  return (
    <div className="relative flex w-full min-w-0 items-center justify-center overflow-hidden px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isConnected ? "bg-foreground" : "bg-muted-foreground/30",
          )}
        />
        <span className="font-medium text-xs">Zotero</span>
      </div>
      {isConnected && (
        <div className="absolute right-3 flex items-center gap-1">
          <button
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            onClick={() => void refresh()}
            title="Reload local library"
          >
            <RefreshCwIcon
              className={cn("size-3.5", isLoadingTree && "animate-spin")}
            />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
                <SettingsIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1">
                <p className="text-[10px] text-muted-foreground">
                  Local database
                </p>
                <p className="truncate text-xs" title={dataDir ?? undefined}>
                  {dataDir ?? "Zotero"}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void pickFolder()}>
                <FolderOpenIcon className="mr-2 size-3.5" />
                Choose data folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={disconnect}>
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function NotConnectedView({
  isOpening,
  error,
  onOpenDefault,
  onPickFolder,
}: {
  isOpening: boolean;
  error: string | null;
  onOpenDefault: () => void;
  onPickFolder: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Browse your local Zotero library, cite keys, and import BibTeX. No
        zotero.org account required.
      </p>
      {isOpening ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          Opening library...
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <Button
            size="sm"
            className="h-6 gap-1 text-[11px]"
            onClick={onOpenDefault}
          >
            Open local library
          </Button>
          <button
            className="text-[10px] text-muted-foreground underline"
            onClick={onPickFolder}
          >
            Choose data folder
          </button>
        </div>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

function CollectionBranch({
  name,
  icon,
  collectionKey,
  itemCount,
  childrenNodes,
  depth,
  defaultOpen,
  skipItems,
  items,
  activeKey,
  isLoadingItems,
  onEnsure,
  onPreview,
  onImport,
  onCite,
  onCopyKey,
  onImportItem,
  importingKey,
  itemsByCollection,
}: {
  name: string;
  icon: React.ReactNode;
  collectionKey: string | null;
  itemCount?: number;
  childrenNodes: ZoteroCollectionNode[];
  depth: number;
  defaultOpen?: boolean;
  skipItems?: boolean;
  items?: ZoteroLocalItem[];
  activeKey: string | null;
  isLoadingItems: boolean;
  onEnsure: (key: string | null) => void;
  onPreview: (key: string) => void;
  onImport: (key: string | null, name: string) => void;
  onCite: (citekey: string) => void;
  onCopyKey: (citekey: string) => void;
  onImportItem: (itemKey: string, citekey: string) => void;
  importingKey: string | null;
  itemsByCollection: Record<string, ZoteroLocalItem[]>;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const storeKey = collectionKey ?? MYLIB_KEY;
  const selected = activeKey === collectionKey;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !skipItems) onEnsure(collectionKey);
  };

  return (
    <div>
      <div
        className={cn(
          "group flex min-w-0 items-center gap-1 py-0.5 pr-1",
          selected && "bg-sidebar-accent/40",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent"
          onClick={toggle}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={toggle}
        >
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
          {itemCount !== undefined && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {itemCount}
            </span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground group-hover:opacity-100"
              title="Folder actions"
            >
              <MoreHorizontalIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              disabled={importingKey === storeKey}
              onClick={() => onImport(collectionKey, name)}
            >
              <DownloadIcon className="mr-2 size-3.5" />
              Import BibTeX into project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <>
          {childrenNodes.map((child) => (
            <CollectionBranch
              key={child.key}
              name={child.name}
              icon={<FolderIcon className="size-3.5" />}
              collectionKey={child.key}
              itemCount={child.item_count}
              childrenNodes={child.children}
              depth={depth + 1}
              items={itemsByCollection[child.key]}
              activeKey={activeKey}
              isLoadingItems={isLoadingItems && activeKey === child.key}
              onEnsure={onEnsure}
              onPreview={onPreview}
              onImport={onImport}
              onCite={onCite}
              onCopyKey={onCopyKey}
              onImportItem={onImportItem}
              importingKey={importingKey}
              itemsByCollection={itemsByCollection}
            />
          ))}
          {isLoadingItems && (
            <div
              className="flex items-center gap-1 py-0.5 text-muted-foreground text-xs"
              style={{ paddingLeft: 28 + depth * 12 }}
            >
              <LoaderIcon className="size-3 animate-spin" />
              Loading papers...
            </div>
          )}
          {!isLoadingItems &&
            items?.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                depth={depth + 1}
                onPreview={onPreview}
                onCite={onCite}
                onCopyKey={onCopyKey}
                onImportItem={onImportItem}
              />
            ))}
        </>
      )}
    </div>
  );
}

function ItemRow({
  item,
  depth,
  onPreview,
  onCite,
  onCopyKey,
  onImportItem,
}: {
  item: ZoteroLocalItem;
  depth: number;
  onPreview: (key: string) => void;
  onCite: (citekey: string) => void;
  onCopyKey: (citekey: string) => void;
  onImportItem: (itemKey: string, citekey: string) => void;
}) {
  return (
    <button
      type="button"
      className="group flex w-full min-w-0 items-start gap-1.5 py-0.5 pr-1 text-left hover:bg-sidebar-accent/50"
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => onPreview(item.key)}
    >
      <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{item.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[item.creators, item.year].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <IconAction
          title="Cite"
          onClick={(e) => {
            e.stopPropagation();
            onCite(item.citekey);
          }}
        >
          <QuoteIcon className="size-3" />
        </IconAction>
        <IconAction
          title="Copy citekey"
          onClick={(e) => {
            e.stopPropagation();
            onCopyKey(item.citekey);
          }}
        >
          <CopyIcon className="size-3" />
        </IconAction>
        <IconAction
          title="Add to references.bib"
          onClick={(e) => {
            e.stopPropagation();
            onImportItem(item.key, item.citekey);
          }}
        >
          <DownloadIcon className="size-3" />
        </IconAction>
      </span>
    </button>
  );
}

function IconAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      {children}
    </span>
  );
}
