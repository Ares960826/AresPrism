import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoaderIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GitFileStatus {
  path: string;
  status: string;
}

interface GitCommitInfo {
  id: string;
  message: string;
  timestamp: number;
}

export function GitPanel() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!projectRoot) return;
    setError(null);
    try {
      const [nextFiles, nextCommits] = await Promise.all([
        invoke<GitFileStatus[]>("git_status", { projectRoot }),
        invoke<GitCommitInfo[]>("git_log", { projectRoot }),
      ]);
      setFiles(nextFiles);
      setCommits(nextCommits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectRoot]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!projectRoot || !selected) {
      setDiff("");
      return;
    }
    invoke<string>("git_diff_file", { projectRoot, path: selected })
      .then(setDiff)
      .catch((err) => setDiff(String(err)));
  }, [projectRoot, selected]);

  const commit = async () => {
    if (!projectRoot || !message.trim()) return;
    setBusy(true);
    try {
      await invoke("git_commit", { projectRoot, message: message.trim() });
      setMessage("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const initialize = async () => {
    if (!projectRoot) return;
    setBusy(true);
    try {
      await invoke("git_init", { projectRoot });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const needsInit = Boolean(error && /no git repository/i.test(error));

  return (
    <div className="flex h-[28rem] min-h-0 flex-col gap-2">
      {needsInit ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
          <p className="text-[11px] text-muted-foreground">
            This project has no Git repository. Initialize one to commit and
            share with collaborators.
          </p>
          <Button
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => void initialize()}
          >
            {busy ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              "Initialize Git repository"
            )}
          </Button>
        </div>
      ) : null}
      {error && !needsInit && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
      {!needsInit && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <div className="min-h-0 overflow-auto rounded border border-border">
              {files.length === 0 ? (
                <p className="p-2 text-[11px] text-muted-foreground">
                  Working tree clean
                </p>
              ) : (
                files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted/50",
                      selected === file.path && "bg-muted",
                    )}
                    onClick={() => setSelected(file.path)}
                  >
                    <span
                      className={cn(
                        "w-16 shrink-0 font-medium",
                        file.status === "untracked" && "text-emerald-600",
                        file.status === "deleted" && "text-destructive",
                        file.status === "modified" && "text-amber-600",
                      )}
                    >
                      {file.status}
                    </span>
                    <span className="min-w-0 truncate">{file.path}</span>
                  </button>
                ))
              )}
            </div>
            <pre className="min-h-0 overflow-auto rounded border border-border bg-muted/20 p-2 font-mono text-[10px] leading-snug">
              {diff || "Select a file"}
            </pre>
          </div>
          <div className="flex gap-2">
            <input
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              placeholder="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={busy || files.length === 0 || !message.trim()}
              onClick={() => void commit()}
            >
              {busy ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                "Commit"
              )}
            </Button>
          </div>
          <div className="max-h-24 overflow-auto text-[10px] text-muted-foreground">
            {commits.slice(0, 8).map((commit) => (
              <div key={commit.id} className="truncate">
                {commit.id.slice(0, 7)} {commit.message}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
