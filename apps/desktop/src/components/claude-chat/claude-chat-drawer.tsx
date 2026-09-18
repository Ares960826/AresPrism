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

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 280;
const SCROLLBAR_GUTTER = 14;

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

  const chatMode = useLayoutStore((s) => s.chatMode);
  const setChatMode = useLayoutStore((s) => s.setChatMode);
  const isOpen = useLayoutStore((s) => s.chatOpen);
  const setIsOpen = useLayoutStore((s) => s.setChatOpen);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [floatBox, setFloatBox] = useState({ left: 80, width: 640 });
  const panelRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    const shouldOpen = anyStreaming || pendingAttachments.length > 0;
    if (shouldOpen && !isOpen) setIsOpen(true);
  }, [anyStreaming, isOpen, pendingAttachments, setIsOpen]);

  useEffect(() => {
    if (chatMode !== "floating" || !editorEl) return;
    const update = () => {
      const rect = editorEl.getBoundingClientRect();
      setFloatBox({
        left: rect.left,
        width: Math.max(280, rect.width - SCROLLBAR_GUTTER),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(editorEl);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [chatMode, editorEl]);

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

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto flex w-full flex-col overflow-hidden border-border bg-background",
        docked
          ? "relative h-full min-h-0 border-t"
          : "fixed z-40 border shadow-lg",
        isDragging && "!transition-none",
      )}
      style={
        docked
          ? { height }
          : {
              height,
              left: floatBox.left,
              width: floatBox.width,
              bottom: 8,
            }
      }
    >
      <div
        className="group flex shrink-0 cursor-row-resize items-center justify-center gap-2 border-border border-b py-1.5 hover:bg-muted/50"
        onMouseDown={handleMouseDown}
      >
        <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        <ChevronDownIcon className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
        <div className="absolute right-2 flex items-center gap-1">
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={docked ? "Float" : "Dock"}
            onClick={(e) => {
              e.stopPropagation();
              setChatMode(docked ? "floating" : "docked");
            }}
          >
            {docked ? (
              <PictureInPicture2Icon className="size-3.5" />
            ) : (
              <PanelBottomIcon className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Close"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <ChatTabBar />
      {error && (
        <div className="mx-3 mt-2 mb-1 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-destructive text-xs">
          {error}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChatMessages />
      </div>
      <ChatComposer isOpen={isOpen} />
    </div>
  );

  if (!isOpen) {
    const fab = (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto absolute right-6 bottom-4 z-20 flex size-10 items-center justify-center rounded-full border border-border bg-background shadow-md hover:shadow-lg"
        aria-label="Open AI Assistant"
      >
        <MessageCircleIcon className="size-4 text-foreground" />
      </button>
    );
    if (editorEl) return createPortal(fab, editorEl);
    return fab;
  }

  if (!docked) {
    return createPortal(panel, document.body);
  }
  return panel;
}
