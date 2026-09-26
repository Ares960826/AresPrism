import { createLogger } from "@/lib/debug/logger";
import { useEffect } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppearanceBridge } from "@/components/appearance-bridge";
import { NativeWindowThemeBridge } from "@/components/native-window-theme-bridge";
import { ErrorFallback } from "@/components/error-fallback";
import { ClaudeChatDrawer } from "@/components/claude-chat/claude-chat-drawer";
import { PdfPreview } from "@/components/workspace/preview/pdf-preview";
import {
  CHAT_RELAY_ACTIONS,
  mergePreviewSnapshot,
  paneWindowLabel,
  PANE_EVENTS,
  type ChatCallPayload,
  type DetachedPane,
  type PreviewPaneSnapshot,
} from "@/lib/detached-pane";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { getPdfBytes, useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import {
  useSyncTexStore,
  type SyncTexViewRequest,
} from "@/stores/synctex-store";
import type { ProjectFileType } from "@/lib/tauri/fs";

const log = createLogger("detached-pane");

function installChatActionRelay() {
  const patch: Record<string, unknown> = {};
  for (const name of CHAT_RELAY_ACTIONS) {
    patch[name] = (...args: unknown[]) => {
      const payload: ChatCallPayload = { name, args };
      void emit(PANE_EVENTS.chatCall, payload);
    };
  }
  useClaudeChatStore.setState(patch);
}

async function loadPreviewPdf(
  snapshot: PreviewPaneSnapshot,
  isCurrent: () => boolean,
) {
  if (!snapshot.projectRoot || !snapshot.pdfRootId) return;
  const file = snapshot.files.find((item) => item.id === snapshot.pdfRootId);
  if (!file) return;
  try {
    const buffer = await invoke<ArrayBuffer>("read_compiled_pdf", {
      projectDir: snapshot.projectRoot,
      mainFile: file.relativePath,
    });
    const bytes = new Uint8Array(buffer);
    log.info("Loaded preview PDF", {
      bytes: bytes.length,
      revision: snapshot.pdfContentRevision,
    });
    if (!isCurrent()) return;
    useDocumentStore.getState().setPdfData(bytes, snapshot.pdfRootId);
    return true;
  } catch (error) {
    log.warn("Could not read compiled preview", { error: String(error) });
    if (isCurrent())
      useDocumentStore
        .getState()
        .setCompileError(`Could not read preview: ${String(error)}`);
  }
}

export function DetachedPaneApp({
  pane,
  onReady,
}: {
  pane: DetachedPane;
  onReady?: () => void;
}) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (pane === "preview") {
      useLayoutStore.setState({ previewFloating: true });
    } else {
      useLayoutStore.setState({ chatMode: "floating", chatOpen: true });
      installChatActionRelay();
    }
    const stops: Array<() => void> = [];
    const unlisten = {
      push: (stop: () => void) => (cancelled ? stop() : stops.push(stop)),
    };
    let previous: PreviewPaneSnapshot | null = null;
    let pdfKey = "";
    const loadedVersions = new Map<string, number>();
    let loadGeneration = 0;
    const apply = (payload: PreviewPaneSnapshot) => {
      if (cancelled) return;
      const snapshot = mergePreviewSnapshot(previous, payload);
      previous = snapshot;
      log.debug("Received document state", {
        root: snapshot.pdfRootId,
        files: snapshot.files.length,
        revision: snapshot.pdfContentRevision,
      });
      useDocumentStore.getState().applyPreviewSnapshot({
        ...snapshot,
        files: snapshot.files.map((file) => ({
          ...file,
          type: file.type as ProjectFileType,
        })),
      });
      const key = JSON.stringify([
        snapshot.projectRoot,
        snapshot.pdfRootId,
        snapshot.pdfContentRevision ?? snapshot.pdfRevision,
      ]);
      if (pane === "preview" && key !== pdfKey) {
        pdfKey = key;
        const generation = ++loadGeneration;
        const documentKey = JSON.stringify([
          snapshot.projectRoot,
          snapshot.pdfRootId,
        ]);
        const version = snapshot.pdfContentRevision ?? snapshot.pdfRevision;
        if (
          snapshot.pdfRootId &&
          loadedVersions.get(documentKey) === version &&
          getPdfBytes(snapshot.pdfRootId)
        )
          return;
        void loadPreviewPdf(
          snapshot,
          () => !cancelled && generation === loadGeneration,
        ).then((loaded) => {
          if (loaded) loadedVersions.set(documentKey, version);
        });
      }
    };
    let cancelled = false;

    const start = async () => {
      if (pane === "preview") {
        unlisten.push(
          await listen<PreviewPaneSnapshot>(
            PANE_EVENTS.previewState,
            (event) => {
              apply(event.payload);
            },
            { target: paneWindowLabel(pane) },
          ),
        );
        unlisten.push(
          await listen<SyncTexViewRequest>(
            PANE_EVENTS.synctexView,
            (event) => {
              useSyncTexStore.setState({
                viewRequest: event.payload,
                followPaused: false,
              });
            },
            { target: paneWindowLabel(pane) },
          ),
        );
      }

      if (pane === "chat") {
        unlisten.push(
          await listen<Partial<ReturnType<typeof useClaudeChatStore.getState>>>(
            PANE_EVENTS.chatState,
            (event) => {
              useClaudeChatStore.setState(event.payload);
            },
            { target: paneWindowLabel(pane) },
          ),
        );
        unlisten.push(
          await listen<PreviewPaneSnapshot>(
            PANE_EVENTS.previewState,
            (event) => {
              apply(event.payload);
            },
            { target: paneWindowLabel(pane) },
          ),
        );
      }

      if (!cancelled) void emit(PANE_EVENTS.hello, pane);
    };

    void start();

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
  }, [pane]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        themes={["light", "dark", "system", "warm"]}
      >
        <TooltipProvider>
          <NativeWindowThemeBridge />
          <AppearanceBridge />
          <div className="flex h-screen min-h-0 w-screen flex-col overflow-hidden bg-background">
            {pane === "preview" ? <PdfPreview /> : <ClaudeChatDrawer />}
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
