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
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useZoteroStore } from "@/stores/zotero-store";
import { insertCite, type ZoteroCollectionNode } from "@/lib/zotero-local";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ZoteroPanel() {
  const isConnected = useZoteroStore((s) => s.isConnected);
  const isOpening = useZoteroStore((s) => s.isOpening);
  const isLoadingTree = useZoteroStore((s) => s.isLoadingTree);
  const isLoadingItems = useZoteroStore((s) => s.isLoadingItems);
  const error = useZoteroStore((s) => s.error);
  const collections = useZoteroStore((s) => s.collections);
  const items = useZoteroStore((s) => s.items);
  const activeCollectionKey = useZoteroStore((s) => s.activeCollectionKey);
  const preview = useZoteroStore((s) => s.preview);
  const connectLocal = useZoteroStore((s) => s.connectLocal);
  const refresh = useZoteroStore((s) => s.refresh);
  const selectCollection = useZoteroStore((s) => s.selectCollection);
  const previewItem = useZoteroStore((s) => s.previewItem);
  const importCollectionToBib = useZoteroStore((s) => s.importCollectionToBib);
  const importItemToBib = useZoteroStore((s) => s.importItemToBib);
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
            <CollectionRow
              name="My Library"
              icon={<LibraryIcon className="size-3.5" />}
              selected={activeCollectionKey === null}
              onSelect={() => void selectCollection(null)}
              onImport={() => void importCollectionToBib(null, "My Library")}
              importing={isSyncing === "__my_library__"}
            />
            {isLoadingTree ? (
              <div className="flex items-center gap-1 px-2 py-1 text-muted-foreground text-xs">
                <LoaderIcon className="size-3 animate-spin" />
                Loading collections...
              </div>
            ) : (
              collections.map((col) => (
                <CollectionTree
                  key={col.key}
                  node={col}
                  depth={0}
                  activeKey={activeCollectionKey}
                  onSelect={(key) => void selectCollection(key)}
                  onImport={(key, name) =>
                    void importCollectionToBib(key, name)
                  }
                  importingKey={isSyncing}
                />
              ))
            )}
            <div className="mx-2 my-1 border-sidebar-border border-t" />
            {isLoadingItems ? (
              <div className="flex items-center gap-1 px-2 py-1 text-muted-foreground text-xs">
                <LoaderIcon className="size-3 animate-spin" />
                Loading items...
              </div>
            ) : items.length === 0 ? (
              <p className="px-2 py-1 text-muted-foreground text-xs">
                No items in this collection.
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cn(
                    "group flex w-full min-w-0 items-start gap-1.5 px-2 py-1 text-left hover:bg-sidebar-accent/50",
                    preview?.item.key === item.key && "bg-sidebar-accent/40",
                  )}
                  onClick={() => void previewItem(item.key)}
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
                        insertCite(item.citekey);
                      }}
                    >
                      <QuoteIcon className="size-3" />
                    </IconAction>
                    <IconAction
                      title="Copy citekey"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard.writeText(item.citekey);
                      }}
                    >
                      <CopyIcon className="size-3" />
                    </IconAction>
                    <IconAction
                      title="Add to references.bib"
                      onClick={(e) => {
                        e.stopPropagation();
                        void importItemToBib(item.key, item.citekey);
                      }}
                    >
                      <DownloadIcon className="size-3" />
                    </IconAction>
                  </span>
                </button>
              ))
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
              BibTeX
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
    <div className="relative flex w-full min-w-0 items-center justify-center px-3">
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

function CollectionTree({
  node,
  depth,
  activeKey,
  onSelect,
  onImport,
  importingKey,
}: {
  node: ZoteroCollectionNode;
  depth: number;
  activeKey: string | null;
  onSelect: (key: string) => void;
  onImport: (key: string, name: string) => void;
  importingKey: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <CollectionRow
        name={node.name}
        icon={<FolderIcon className="size-3.5" />}
        depth={depth}
        itemCount={node.item_count}
        selected={activeKey === node.key}
        expandable={hasChildren}
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        onSelect={() => onSelect(node.key)}
        onImport={() => onImport(node.key, node.name)}
        importing={importingKey === node.key}
      />
      {open &&
        node.children.map((child) => (
          <CollectionTree
            key={child.key}
            node={child}
            depth={depth + 1}
            activeKey={activeKey}
            onSelect={onSelect}
            onImport={onImport}
            importingKey={importingKey}
          />
        ))}
    </div>
  );
}

function CollectionRow({
  name,
  icon,
  depth = 0,
  itemCount,
  selected,
  expandable,
  expanded,
  onToggle,
  onSelect,
  onImport,
  importing,
}: {
  name: string;
  icon: React.ReactNode;
  depth?: number;
  itemCount?: number;
  selected: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 py-0.5 pr-1",
        selected && "bg-sidebar-accent/40",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      {expandable ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={onSelect}
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        {itemCount !== undefined && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {itemCount}
          </span>
        )}
      </button>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground disabled:opacity-30 group-hover:opacity-100"
        onClick={onImport}
        disabled={importing}
        title="Import BibTeX into this project"
      >
        {importing ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <DownloadIcon className="size-3" />
        )}
      </button>
    </div>
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
