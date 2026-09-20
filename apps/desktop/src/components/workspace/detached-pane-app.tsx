import { useEffect } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { readFile, exists } from "@tauri-apps/plugin-fs";
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
  compiledPdfAbsolutePath,
  PANE_EVENTS,
  type ChatCallPayload,
  type DetachedPane,
  type PreviewPaneSnapshot,
} from "@/lib/detached-pane";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import {
  useSyncTexStore,
  type SyncTexViewRequest,
} from "@/stores/synctex-store";
import type { ProjectFileType } from "@/lib/tauri/fs";

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

async function loadPreviewPdf(snapshot: PreviewPaneSnapshot) {
  if (!snapshot.projectRoot || !snapshot.pdfRootId) return;
  const file = snapshot.files.find((item) => item.id === snapshot.pdfRootId);
  if (!file) return;
  const pdfPath = compiledPdfAbsolutePath(
    snapshot.projectRoot,
    file.relativePath,
  );
  try {
    if (!(await exists(pdfPath))) return;
    const bytes = await readFile(pdfPath);
    useDocumentStore
      .getState()
      .setPdfData(new Uint8Array(bytes), snapshot.pdfRootId);
  } catch {
    // Keep the last preview if the build PDF is not readable yet.
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
    const unlisten: Array<() => void> = [];
    let cancelled = false;

    const start = async () => {
      if (pane === "preview") {
        unlisten.push(
          await listen<PreviewPaneSnapshot>(
            PANE_EVENTS.previewState,
            (event) => {
              const snapshot = {
                ...event.payload,
                files: event.payload.files.map((file) => ({
                  ...file,
                  type: file.type as ProjectFileType,
                })),
              };
              useDocumentStore.getState().applyPreviewSnapshot(snapshot);
              void loadPreviewPdf(snapshot);
            },
          ),
        );
        unlisten.push(
          await listen<SyncTexViewRequest>(PANE_EVENTS.synctexView, (event) => {
            useSyncTexStore.setState({
              viewRequest: event.payload,
              followPaused: false,
            });
          }),
        );
      }

      if (pane === "chat") {
        unlisten.push(
          await listen<Partial<ReturnType<typeof useClaudeChatStore.getState>>>(
            PANE_EVENTS.chatState,
            (event) => {
              useClaudeChatStore.setState(event.payload);
            },
          ),
        );
        unlisten.push(
          await listen<PreviewPaneSnapshot>(
            PANE_EVENTS.previewState,
            (event) => {
              useDocumentStore.getState().applyPreviewSnapshot({
                ...event.payload,
                files: event.payload.files.map((file) => ({
                  ...file,
                  type: file.type as ProjectFileType,
                })),
              });
            },
          ),
        );
      }

      if (!cancelled) void emit(PANE_EVENTS.hello, pane);
    };

    void start();

    return () => {
      cancelled = true;
      for (const stop of unlisten) stop();
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
