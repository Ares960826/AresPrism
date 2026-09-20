import { useEffect } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { compileIndependentRoots } from "@/lib/latex-compiler";
import { jumpEditorToSynctexSource } from "@/lib/synctex-jump";
import {
  PANE_EVENTS,
  parseDetachedPane,
  type ChatCallPayload,
  type PreviewPaneSnapshot,
  type SynctexJumpPayload,
} from "@/lib/detached-pane";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { getCurrentPdfRootId, useDocumentStore } from "@/stores/document-store";
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
    compileError: state.compileError,
    isCompiling: state.isCompiling,
  };
}

function pickChatSnapshot() {
  const state = useClaudeChatStore.getState();
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

    void listen<string>(PANE_EVENTS.hello, (event) => {
      if (event.payload === "preview") {
        void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
        const view = useSyncTexStore.getState().viewRequest;
        if (view) void emit(PANE_EVENTS.synctexView, view);
      }
      if (event.payload === "chat") {
        void emit(PANE_EVENTS.chatState, pickChatSnapshot());
        void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
      }
    }).then((fn) => unlisten.push(fn));

    void listen<string>(PANE_EVENTS.closed, (event) => {
      if (event.payload === "preview") {
        useLayoutStore.getState().setPreviewFloating(false);
      }
      if (event.payload === "chat") {
        useLayoutStore.getState().setChatMode("docked");
      }
    }).then((fn) => unlisten.push(fn));

    void listen(PANE_EVENTS.compile, () => {
      const state = useDocumentStore.getState();
      if (!state.activeFileId) return;
      void compileIndependentRoots([state.activeFileId]);
    }).then((fn) => unlisten.push(fn));

    void listen<SynctexJumpPayload>(PANE_EVENTS.synctexJump, (event) => {
      jumpEditorToSynctexSource(
        event.payload.file,
        event.payload.line,
        event.payload.column,
      );
    }).then((fn) => unlisten.push(fn));

    void listen<ChatCallPayload>(PANE_EVENTS.chatCall, (event) => {
      const fn = useClaudeChatStore.getState()[event.payload.name];
      if (typeof fn === "function") {
        void (fn as (...args: unknown[]) => unknown)(...event.payload.args);
      }
    }).then((fn) => unlisten.push(fn));

    return () => {
      for (const stop of unlisten) stop();
    };
  }, []);

  useEffect(() => {
    if (parseDetachedPane() || !previewFloating) return;
    void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
    let docTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubDoc = useDocumentStore.subscribe(() => {
      if (docTimer) clearTimeout(docTimer);
      docTimer = setTimeout(() => {
        void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
      }, 80);
    });
    const unsubSync = useSyncTexStore.subscribe((state, prev) => {
      if (
        state.viewRequest &&
        state.viewRequest.nonce !== prev.viewRequest?.nonce
      ) {
        void emit(PANE_EVENTS.synctexView, state.viewRequest);
      }
    });
    return () => {
      if (docTimer) clearTimeout(docTimer);
      unsubDoc();
      unsubSync();
    };
  }, [previewFloating]);

  useEffect(() => {
    if (parseDetachedPane() || chatMode !== "floating") return;
    void emit(PANE_EVENTS.chatState, pickChatSnapshot());
    void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
    let chatTimer: ReturnType<typeof setTimeout> | null = null;
    let docTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubChat = useClaudeChatStore.subscribe(() => {
      if (chatTimer) clearTimeout(chatTimer);
      chatTimer = setTimeout(() => {
        void emit(PANE_EVENTS.chatState, pickChatSnapshot());
      }, 32);
    });
    const unsubDoc = useDocumentStore.subscribe(() => {
      if (docTimer) clearTimeout(docTimer);
      docTimer = setTimeout(() => {
        void emit(PANE_EVENTS.previewState, buildPreviewSnapshot());
      }, 80);
    });
    return () => {
      if (chatTimer) clearTimeout(chatTimer);
      if (docTimer) clearTimeout(docTimer);
      unsubChat();
      unsubDoc();
    };
  }, [chatMode]);
}
