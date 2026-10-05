import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  MessageCircleIcon,
  PictureInPicture2Icon,
  PanelBottomIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useClaudeEvents } from "@/hooks/use-claude-events";
import { ChatMessages } from "./chat-messages";
import { ChatComposer } from "./chat-composer";
import { ChatTabBar } from "./chat-tab-bar";
import { parseDetachedPane } from "@/lib/detached-pane";

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 280;
/** Leave the CodeMirror overlay scrollbar clickable when chat is docked. */
const SCROLLBAR_GUTTER = 16;

export function ClaudeChatDrawer({
  editorEl,
}: {
  editorEl?: HTMLElement | null;
}) {
  useClaudeEvents();

  const anyStreaming = useClaudeChatStore((s) =>
    s.tabs.some((t) => t.isStreaming),
  );
  const error = useClaudeChatStore((s) => s.error);
  const pendingAttachments = useClaudeChatStore((s) => s.pendingAttachments);
  const pendingInlineReferences = useClaudeChatStore(
    (s) => s.pendingInlineReferences,
  );

  const chatMode = useLayoutStore((s) => s.chatMode);
  const setChatMode = useLayoutStore((s) => s.setChatMode);
  const isOpen = useLayoutStore((s) => s.chatOpen);
  const setIsOpen = useLayoutStore((s) => s.setChatOpen);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    const shouldOpen =
      anyStreaming ||
      pendingAttachments.length > 0 ||
      pendingInlineReferences.length > 0;
    if (shouldOpen && !isOpen) setIsOpen(true);
  }, [
    anyStreaming,
    isOpen,
    pendingAttachments,
    pendingInlineReferences,
    setIsOpen,
  ]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    hasDraggedRef.current = false;
    const startY = e.clientY;
    const startHeight = heightRef.current;
    const handleMouseMove = (ev: MouseEvent) => {
      hasDraggedRef.current = true;
      const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight * 0.6);
      const newHeight = Math.min(
        Math.max(startHeight + (startY - ev.clientY), MIN_HEIGHT),
        maxHeight,
      );
      heightRef.current = newHeight;
      if (panelRef.current) panelRef.current.style.height = `${newHeight}px`;
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      setHeight(heightRef.current);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const docked = chatMode === "docked";
  const detachedChat = parseDetachedPane() === "chat";

  const collapse = () => {
    setIsOpen(false);
    if (!docked) setChatMode("docked");
  };

  const panelBody = (
    <>
      {detachedChat ? null : (
        // Top edge: the first few pixels resize; just below them a hidden
        // strip appears on hover, and clicking it collapses the chat.
        <div className="group/chat-edge relative h-3.5 shrink-0">
          <div
            className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize"
            onMouseDown={handleMouseDown}
            title="Drag to resize"
          />
          <button
            type="button"
            className="group/collapse absolute inset-x-0 top-1.5 bottom-0 flex cursor-pointer items-center justify-center outline-none"
            title="Collapse chat"
            aria-label="Collapse chat"
            onClick={collapse}
          >
            <span className="h-[3px] w-10 rounded-full bg-muted-foreground/40 opacity-0 transition-[opacity,width,background-color] duration-100 group-hover/collapse:w-20 group-hover/collapse:bg-foreground/70 group-hover/chat-edge:opacity-100 group-focus-visible/collapse:opacity-100 group-active/collapse:bg-foreground" />
          </button>
        </div>
      )}
      <ChatTabBar
        extraActions={
          <>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
              title={docked ? "Float" : "Dock"}
              onClick={() => setChatMode(docked ? "floating" : "docked")}
            >
              {docked ? (
                <PictureInPicture2Icon className="size-3.5" />
              ) : (
                <PanelBottomIcon className="size-3.5" />
              )}
            </button>
            {detachedChat && (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
                title="Close"
                onClick={collapse}
              >
                <ChevronDownIcon className="size-3.5" />
              </button>
            )}
          </>
        }
      />
      {error && (
        <div className="mx-3 mt-2 mb-1 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-destructive text-xs">
          {error}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChatMessages />
      </div>
      <ChatComposer isOpen={isOpen} />
    </>
  );

  if (detachedChat) {
    return (
      <div
        ref={panelRef}
        className={cn(
          "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background",
          isDragging && "!transition-none",
        )}
      >
        {panelBody}
      </div>
    );
  }

  if (!isOpen) {
    const fab = (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto absolute bottom-4 z-20 flex size-10 items-center justify-center rounded-full border border-border bg-background shadow-md hover:shadow-lg"
        style={{ right: SCROLLBAR_GUTTER + 8 }}
        aria-label="Open AI Assistant"
      >
        <MessageCircleIcon className="size-4 text-foreground" />
      </button>
    );
    if (editorEl) return createPortal(fab, editorEl);
    return fab;
  }

  if (!docked) {
    return null;
  }

  if (!editorEl) return null;
  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto absolute bottom-0 left-0 z-20 flex flex-col overflow-hidden border-border border-t bg-background shadow-[0_-8px_24px_rgba(0,0,0,0.12)]",
        isDragging && "!transition-none",
      )}
      style={{ height, right: SCROLLBAR_GUTTER }}
    >
      {panelBody}
    </div>,
    editorEl,
  );
}
