import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { FolderIcon, XIcon } from "lucide-react";
import { scanProjectFolder } from "@/lib/tauri/fs";
import {
  useWorkspaceStore,
  activateWorkspaceRoot,
} from "@/stores/workspace-store";
import { useDocumentStore } from "@/stores/document-store";
import { FileTypeIcon } from "./file-type-icon";
export function WorkspaceFolders({ children }: { children: ReactNode }) {
  const root = useDocumentStore((s) => s.projectRoot);
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeId),
  );
  const remove = useWorkspaceStore((s) => s.removeRoot);
  if (!workspace) return <>{children}</>;
  return (
    <>
      {workspace.roots.map((path) => (
        <section key={path}>
          <div className="flex items-center gap-1 px-1 py-1">
            <button
              type="button"
              title={path}
              className="flex min-w-0 flex-1 items-center gap-1 font-semibold text-xs"
              onClick={() =>
                void activateWorkspaceRoot(path).catch((e) =>
                  toast.error(String(e)),
                )
              }
            >
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate">{path.split(/[\\/]/).pop()}</span>
            </button>
            {path !== root && (
              <button
                type="button"
                aria-label={`Remove ${path} from workspace`}
                onClick={() => remove(path)}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
          {path === root ? children : <OtherFolder root={path} />}
        </section>
      ))}
    </>
  );
}
function OtherFolder({ root }: { root: string }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void invoke("allow_project_directory", { rootPath: root })
      .then(() => scanProjectFolder(root))
      .then((result) => {
        if (!cancelled) setPaths(result.files.map((f) => f.relativePath));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [root]);
  return (
    <div
      className="pl-2"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {error && <p className="text-destructive text-xs">{error}</p>}
      <FolderContents root={root} paths={paths} prefix="" />
    </div>
  );
}
function FolderContents({
  root,
  paths,
  prefix,
}: {
  root: string;
  paths: string[];
  prefix: string;
}) {
  const entries = Array.from(
    new Set(
      paths
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length).split("/")[0]),
    ),
  ).sort();
  return (
    <>
      {entries.map((name) => {
        const path = prefix + name;
        if (paths.some((p) => p.startsWith(`${path}/`)))
          return (
            <details key={path}>
              <summary className="cursor-pointer py-1 text-xs">{name}</summary>
              <div className="pl-3">
                <FolderContents root={root} paths={paths} prefix={`${path}/`} />
              </div>
            </details>
          );
        return (
          <button
            type="button"
            key={path}
            title={path}
            className="flex w-full items-center gap-1 py-1 text-left text-xs"
            onClick={() =>
              void activateWorkspaceRoot(root, path).catch((e) =>
                toast.error(String(e)),
              )
            }
          >
            <FileTypeIcon name={name} />
            <span className="truncate">{name}</span>
          </button>
        );
      })}
    </>
  );
}
