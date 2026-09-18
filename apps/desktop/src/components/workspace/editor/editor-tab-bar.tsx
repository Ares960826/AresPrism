import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

export function EditorTabBar() {
  const files = useDocumentStore((s) => s.files);
  const openFileIds = useDocumentStore((s) => s.openFileIds);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const closeFileTab = useDocumentStore((s) => s.closeFileTab);

  const tabs = openFileIds
    .map((id) => files.find((file) => file.id === id))
    .filter((file): file is NonNullable<typeof file> => !!file);

  if (tabs.length === 0) return null;

  return (
    <div className="flex min-h-8 shrink-0 items-center overflow-x-auto border-border border-b bg-muted/20">
      {tabs.map((file) => {
        const active = file.id === activeFileId;
        return (
          <button
            key={file.id}
            type="button"
            onClick={() => setActiveFile(file.id)}
            className={cn(
              "group flex max-w-[11rem] items-center gap-1 border-border border-r px-2.5 py-1.5 text-xs",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            title={file.relativePath}
          >
            <span className="truncate">{file.name}</span>
            {file.isDirty && (
              <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
            )}
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                className="rounded-sm p-0.5 opacity-0 hover:bg-muted-foreground/20 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  closeFileTab(file.id);
                }}
              >
                <XIcon className="size-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
