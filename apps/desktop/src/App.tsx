import { useSaveBeforeClose } from "@/hooks/use-save-before-close";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

import { useDocumentStore } from "@/stores/document-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { ProjectPicker } from "@/components/project-picker";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUvSetupStore } from "@/stores/uv-setup-store";
import { ErrorFallback } from "@/components/error-fallback";
import { createLogger } from "@/lib/debug/logger";
import { EnvironmentOnboarding } from "@/components/environment-onboarding";
import { AppearanceBridge } from "@/components/appearance-bridge";
import { NativeWindowThemeBridge } from "@/components/native-window-theme-bridge";
import { useSettingsStore } from "@/stores/settings-store";
import { UpdateNotifier } from "@/components/update-notifier";
import { useMainPaneBridge } from "@/hooks/use-main-pane-bridge";
import { useLayoutStore } from "@/stores/layout-store";
import { APP_NAME } from "@/lib/app-identity";

const WorkspaceLayout = lazy(() =>
  import("@/components/workspace/workspace-layout").then((m) => ({
    default: m.WorkspaceLayout,
  })),
);
const SettingsDialog = lazy(() =>
  import("@/components/settings-dialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);

const log = createLogger("app");

const LazyDebugPage = lazy(() =>
  import("@/components/debug/debug-page").then((m) => ({
    default: m.DebugPage,
  })),
);

interface ClaudeSessionInfo {
  session_id: string;
  title: string;
  last_modified: number;
}

function WorkspaceWithClaude() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const initialized = useDocumentStore((s) => s.initialized);
  const autoResumedProjectRef = useRef<string | null>(null);
  const chatProjectRef = useRef<string | null>(null);

  // Update window title
  useEffect(() => {
    if (projectRoot) {
      const name = projectRoot.split(/[/\\]/).pop() || APP_NAME;
      getCurrentWindow().setTitle(`${name} - ${APP_NAME}`);
    }
  }, [projectRoot]);

  useEffect(() => {
    if (chatProjectRef.current === projectRoot) return;
    chatProjectRef.current = projectRoot;
    useClaudeChatStore.getState().resetForProject(projectRoot ?? null);
  }, [projectRoot]);

  // Auto-setup Python venv when project opens
  useEffect(() => {
    if (!initialized || !projectRoot) return;
    const uvStore = useUvSetupStore.getState();
    uvStore
      .checkStatus()
      .then(() => {
        const { status } = useUvSetupStore.getState();
        if (status === "ready") {
          return uvStore.setupVenv(projectRoot);
        }
      })
      .catch((err) => {
        log.error("Failed to setup Python venv", { error: String(err) });
      });
  }, [initialized, projectRoot]);

  // Open the most recent chat when entering a project.
  useEffect(() => {
    if (!projectRoot) {
      autoResumedProjectRef.current = null;
      return;
    }
    if (!initialized) return;
    if (autoResumedProjectRef.current === projectRoot) return;

    const chatState = useClaudeChatStore.getState();
    if (chatState.pendingInitialPrompt) return;

    autoResumedProjectRef.current = projectRoot;
    let cancelled = false;

    invoke<ClaudeSessionInfo[]>("list_claude_sessions", {
      projectPath: projectRoot,
      generateTitles: false,
    })
      .then((sessions) => {
        if (cancelled) return;
        const latest = sessions
          .slice()
          .sort((a, b) => b.last_modified - a.last_modified)[0];

        const current = useClaudeChatStore.getState();
        if (current.pendingInitialPrompt || current.isStreaming) {
          return;
        }

        if (!latest?.session_id) {
          current.newSession();
          return;
        }

        current.resumeSession(latest.session_id, latest.title).catch((err) => {
          log.warn("Failed to auto-resume latest chat session", {
            sessionId: latest.session_id,
            error: String(err),
          });
        });
      })
      .catch((err) => {
        log.warn("Failed to auto-resume latest chat session", {
          error: String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [initialized, projectRoot]);

  // Consume pending initial prompt from project wizard
  useEffect(() => {
    if (!initialized) return;
    // Delay to let ClaudeChatDrawer mount and register event listeners
    const timer = setTimeout(() => {
      const prompt = useClaudeChatStore
        .getState()
        .consumePendingInitialPrompt();
      if (prompt) {
        useClaudeChatStore.getState().sendPrompt(prompt);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [initialized]);

  return (
    <Suspense
      fallback={
        <div className="grid h-screen place-items-center text-muted-foreground text-sm">
          Opening workspace…
        </div>
      }
    >
      <WorkspaceLayout />
    </Suspense>
  );
}

export function App({ onReady }: { onReady?: () => void }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const saveError = useDocumentStore((s) => s.saveError);
  const [showDebug, setShowDebug] = useState(false);

  // Register global keyboard shortcuts (Cmd+S, Cmd+N) at the app level
  useKeyboardShortcuts();
  useMainPaneBridge();
  useSaveBeforeClose();

  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", preventNativeContextMenu);
    return () => {
      document.removeEventListener("contextmenu", preventNativeContextMenu);
    };
  }, []);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!projectRoot) {
      getCurrentWindow().setTitle(APP_NAME);
      useLayoutStore.getState().setPreviewFloating(false);
      useLayoutStore.getState().setChatMode("docked");
    }
  }, [projectRoot]);

  // Listen for debug panel toggle (Ctrl+Shift+D)
  useEffect(() => {
    const handler = () => setShowDebug((prev) => !prev);
    window.addEventListener("toggle-debug-panel", handler);
    return () => window.removeEventListener("toggle-debug-panel", handler);
  }, []);

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
          {settingsOpen && (
            <Suspense fallback={null}>
              <SettingsDialog />
            </Suspense>
          )}
          <UpdateNotifier />
          {/* Global macOS titlebar drag region — sits above all content */}
          <div
            data-tauri-drag-region
            className="fixed inset-x-0 top-0 z-[9999] h-[var(--titlebar-height)]"
          />
          {projectRoot ? <WorkspaceWithClaude /> : <ProjectPicker />}
          <EnvironmentOnboarding />
          {showDebug && (
            <div className="fixed inset-0 z-[9998] flex items-end justify-center">
              <div
                className="absolute inset-0 bg-black/20"
                onClick={() => setShowDebug(false)}
              />
              <div className="relative h-[60vh] w-full border-border border-t bg-background shadow-lg">
                <div className="flex h-8 items-center justify-between border-border border-b bg-muted/50 px-3">
                  <span className="font-medium text-xs">Debug Panel</span>
                  <button
                    className="text-muted-foreground text-xs hover:text-foreground"
                    onClick={() => setShowDebug(false)}
                  >
                    Close (Ctrl+Shift+D)
                  </button>
                </div>
                <div className="h-[calc(60vh-2rem)] overflow-auto">
                  <Suspense
                    fallback={
                      <div className="p-4 text-muted-foreground text-sm">
                        Loading...
                      </div>
                    }
                  >
                    <LazyDebugPage />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
          {saveError && (
            <div
              role="alert"
              className="fixed bottom-4 left-1/2 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm shadow-lg"
            >
              <span className="text-destructive">{saveError}</span>
              <button
                className="ml-4 rounded px-2 py-1 font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  void useDocumentStore
                    .getState()
                    .saveAllFiles()
                    .catch(() => {})
                }
              >
                Retry save
              </button>
            </div>
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
