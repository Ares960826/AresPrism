import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useHistoryStore, type RestoreResult } from "@/stores/history-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("history");

interface RestoreVersionOptions {
  /** Restoring the pre-restore version from the "Undo" toast action. */
  isUndo?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function undoAction(projectRoot: string, previousId: string) {
  return {
    label: "Undo",
    onClick: () => {
      if (useDocumentStore.getState().projectRoot !== projectRoot) {
        toast.error(
          "This restore belongs to another project. Open that project to undo it from the history panel.",
        );
        return;
      }
      void restoreVersion(projectRoot, previousId, { isUndo: true });
    },
  };
}

/**
 * The single safe path for restoring a history version (history panel,
 * editor review banner, and the toast "Undo" action):
 *
 * 1. refuse while an AI agent runs or AI changes await review;
 * 2. cancel autosave timers and save every dirty buffer, then suspend saves
 *    (and block other project reloads / agent sends) under a restore token;
 * 3. restore on the backend (which snapshots the working tree first);
 * 4. reload the project from disk, discarding in-memory buffers so nothing
 *    stale is written back over the restored files; if that reload fails,
 *    drop the buffers entirely;
 * 5. end the restore (always), then offer "Undo", which restores the
 *    pre-restore version through this path.
 *
 * Returns null when the restore did not run or failed (shown as a toast).
 */
export async function restoreVersion(
  projectRoot: string,
  snapshotId: string,
  options: RestoreVersionOptions = {},
): Promise<RestoreResult | null> {
  if (useHistoryStore.getState().isRestoring) return null;
  const documents = useDocumentStore.getState();
  if (documents.isAgentRunning()) {
    toast.error("Stop the AI agent before restoring a version.");
    return null;
  }
  if (useProposedChangesStore.getState().changes.length > 0) {
    toast.error("Accept or reject the AI's pending changes before restoring.");
    return null;
  }

  useHistoryStore.setState({ isRestoring: true });
  useHistoryStore.getState().stopReview();
  const failurePrefix = options.isUndo
    ? "Could not undo restore"
    : "Could not restore version";

  let token: number;
  try {
    token = await documents.prepareForRestore();
  } catch (err) {
    useHistoryStore.setState({ isRestoring: false });
    toast.error(`${failurePrefix}: ${errorMessage(err)}`);
    return null;
  }

  // Every path below ends the restore (the `finally`), so no suspended state
  // outlives this call.
  try {
    let result: RestoreResult;
    try {
      result = await useHistoryStore
        .getState()
        .restoreSnapshot(projectRoot, snapshotId);
    } catch (err) {
      // Nothing on disk changed: the saved buffers are still current.
      log.error("Restore failed", { error: errorMessage(err) });
      toast.error(`${failurePrefix}: ${errorMessage(err)}`);
      return null;
    }

    if (!result.snapshot) {
      toast.info("Already at this version");
      return result;
    }

    try {
      await useDocumentStore.getState().openProject(projectRoot, {
        discardUnsaved: true,
        restoreToken: token,
      });
    } catch (err) {
      // Files on disk are restored but the buffers still hold the old
      // content. Drop them so they can never be written back.
      log.error("Reload after restore failed", { error: errorMessage(err) });
      useDocumentStore.getState().discardBuffers();
      toast.error(
        "The version was restored, but the project could not be reloaded. Reopen the project.",
        { action: undoAction(projectRoot, result.previous_id) },
      );
      return result;
    }

    if (options.isUndo) {
      toast.success("Restore undone");
    } else {
      toast.success("Version restored", {
        action: undoAction(projectRoot, result.previous_id),
      });
    }
    return result;
  } finally {
    useDocumentStore.getState().endRestore(token);
    useHistoryStore.setState({ isRestoring: false });
  }
}
