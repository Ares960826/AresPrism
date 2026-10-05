import { useEffect } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { compileFromPreview } from "@/lib/preview-compile";
import { jumpEditorToSynctexSource } from "@/lib/synctex-jump";
import {
  PANE_EVENTS,
  paneWindowLabel,
  parseDetachedPane,
  type ChatCallPayload,
  type PreviewPaneSnapshot,
  type PreviewCompilePayload,
  type SynctexJumpPayload,
} from "@/lib/detached-pane";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import {
  getCurrentPdfRootId,
  getPdfVersion,
  useDocumentStore,
} from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useSyncTexStore } from "@/stores/synctex-store";

function buildPreviewSnapshot(): PreviewPaneSnapshot {
  const state = useDocumentStore.getState();
  return {
    projectRoot: state.projectRoot,
    files: state.files.map((file) => ({
      id: file.id,
      name: file.name,
      relativePath: file.relativePath,
      absolutePath: file.absolutePath,
      type: file.type,
      content: file.content,
    })),
    activeFileId: state.activeFileId,
    openFileIds: state.openFileIds,
    pdfRootId: getCurrentPdfRootId(),
    pdfRevision: state.pdfRevision,
    pdfContentRevision: getPdfVersion(getCurrentPdfRootId()),
    full: true,
    compileError: state.compileError,
    isCompiling: state.isCompiling,
  };
}

function pickChatSnapshot(state = useClaudeChatStore.getState()) {
  return {
    messages: state.messages,
    sessionId: state.sessionId,
    isStreaming: state.isStreaming,
    streamingStartedAt: state.streamingStartedAt,
    error: state.error,
    totalInputTokens: state.totalInputTokens,
    totalOutputTokens: state.totalOutputTokens,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeProjectPath: state.activeProjectPath,
    selectedModel: state.selectedModel,
    selectedProviderCredentialId: state.selectedProviderCredentialId,
    selectedProviderModels: state.selectedProviderModels,
    effortLevel: state.effortLevel,
    pendingAttachments: state.pendingAttachments,
    pendingInlineReferences: state.pendingInlineReferences,
    pendingPinnedContextRemovalLabels: state.pendingPinnedContextRemovalLabels,
  };
}

/** Main-window side of detached Preview / AI OS windows. */
export function useMainPaneBridge() {
  const previewFloating = useLayoutStore((s) => s.previewFloating);
  const chatMode = useLayoutStore((s) => s.chatMode);

  useEffect(() => {
    if (parseDetachedPane()) return;

    const unlisten: Array<() => void> = [];
    let disposed = false;
    const register = (fn: () => void) => (disposed ? fn() : unlisten.push(fn));

    void listen<string>(PANE_EVENTS.hello, (event) => {
      if (event.payload === "preview") {
        void emitTo(
          paneWindowLabel(event.payload as "preview" | "chat"),
          PANE_EVENTS.previewState,
          buildPreviewSnapshot(),
        );
        const view = useSyncTexStore.getState().viewRequest;
        if (view)
          void emitTo(
            paneWindowLabel("preview"),
            PANE_EVENTS.synctexView,
            view,
          );
      }
      if (event.payload === "chat") {
        void emitTo(
          paneWindowLabel("chat"),
          PANE_EVENTS.chatState,
          pickChatSnapshot(),
        );
        void emitTo(
          paneWindowLabel(event.payload as "preview" | "chat"),
          PANE_EVENTS.previewState,
          buildPreviewSnapshot(),
        );
      }
    }).then(register);

    void listen<string>(PANE_EVENTS.closed, (event) => {
      if (event.payload === "preview") {
        useLayoutStore.getState().setPreviewFloating(false);
      }
      if (event.payload === "chat") {
        useLayoutStore.getState().setChatMode("docked");
      }
    }).then(register);

    void listen<PreviewCompilePayload>(PANE_EVENTS.compile, (event) => {
      void compileFromPreview(event.payload).catch(() => {});
    }).then(register);

    void listen<SynctexJumpPayload>(PANE_EVENTS.synctexJump, (event) => {
      jumpEditorToSynctexSource(
        event.payload.file,
        event.payload.line,
        event.payload.column,
      );
    }).then(register);

    void listen<ChatCallPayload>(PANE_EVENTS.chatCall, (event) => {
      const fn = useClaudeChatStore.getState()[event.payload.name];
      if (typeof fn === "function") {
        void (fn as (...args: unknown[]) => unknown)(...event.payload.args);
      }
    }).then(register);

    return () => {
      disposed = true;
      for (const stop of unlisten) stop();
    };
  }, []);

  useEffect(() => {
    if (parseDetachedPane() || (!previewFloating && chatMode !== "floating"))
      return;
    let previous = buildPreviewSnapshot();
    const send = (snapshot: PreviewPaneSnapshot) => {
      if (previewFloating)
        void emitTo(
          paneWindowLabel("preview"),
          PANE_EVENTS.previewState,
          snapshot,
        );
      if (chatMode === "floating")
        void emitTo(
          paneWindowLabel("chat"),
          PANE_EVENTS.previewState,
          snapshot,
        );
    };
    send(previous);
    let docTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubDoc = useDocumentStore.subscribe((state, prev) => {
      if (
        state.files === prev.files &&
        state.projectRoot === prev.projectRoot &&
        state.activeFileId === prev.activeFileId &&
        state.openFileIds === prev.openFileIds &&
        state.pdfRevision === prev.pdfRevision &&
        state.compileError === prev.compileError &&
        state.isCompiling === prev.isCompiling
      )
        return;
      if (docTimer) return;
      docTimer = setTimeout(() => {
        docTimer = null;
        const next = buildPreviewSnapshot();
        if (next.projectRoot !== previous.projectRoot) send(next);
        else {
          const old = new Map(previous.files.map((file) => [file.id, file]));
          const ids = new Set(next.files.map((file) => file.id));
          send({
            ...next,
            full: false,
            files: next.files.filter(
              (file) =>
                !old.has(file.id) ||
                Object.entries(file).some(
                  ([key, value]) =>
                    value !== old.get(file.id)?.[key as keyof typeof file],
                ),
            ),
            removedFileIds: previous.files
              .filter((file) => !ids.has(file.id))
              .map((file) => file.id),
          });
        }
        previous = next;
      }, 80);
    });
    const unsubSync = useSyncTexStore.subscribe((state, prev) => {
      if (
        previewFloating &&
        state.viewRequest &&
        state.viewRequest.nonce !== prev.viewRequest?.nonce
      ) {
        void emitTo(
          paneWindowLabel("preview"),
          PANE_EVENTS.synctexView,
          state.viewRequest,
        );
      }
    });
    return () => {
      if (docTimer) clearTimeout(docTimer);
      unsubDoc();
      unsubSync();
    };
  }, [previewFloating, chatMode]);

  useEffect(() => {
    if (parseDetachedPane() || chatMode !== "floating") return;
    let previous = pickChatSnapshot();
    void emitTo(paneWindowLabel("chat"), PANE_EVENTS.chatState, previous);
    // Quotes are consumed by the floating composer; drop the main-window copy
    // so they are not inserted a second time when chat is docked again.
    const handOffQuotes = () => {
      if (useClaudeChatStore.getState().pendingInlineReferences.length > 0)
        useClaudeChatStore.getState().consumePendingInlineReferences();
    };
    handOffQuotes();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useClaudeChatStore.subscribe((state, prev) => {
      const next = pickChatSnapshot(state);
      const before = pickChatSnapshot(prev);
      const keys = Object.keys(next) as Array<keyof typeof next>;
      if (keys.every((key) => next[key] === before[key])) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const latest = pickChatSnapshot();
        const delta = Object.fromEntries(
          Object.entries(latest).filter(
            ([key, value]) => value !== previous[key as keyof typeof previous],
          ),
        );
        previous = latest;
        void emitTo(paneWindowLabel("chat"), PANE_EVENTS.chatState, delta);
        handOffQuotes();
      }, 32);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [chatMode]);
}
