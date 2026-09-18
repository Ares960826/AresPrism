import { useCallback, useRef, useState, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FloatingPane({
  title,
  onDock,
  children,
}: {
  title: string;
  onDock: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ x: 80, y: 80, w: 520, h: 640 });
  const dragRef = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    setPos((p) => ({
      ...p,
      x: Math.max(0, start.x + e.clientX - start.px),
      y: Math.max(24, start.y + e.clientY - start.py),
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-xl"
      style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
    >
      <div
        className="flex h-8 shrink-0 cursor-grab items-center justify-between border-border border-b bg-muted/40 px-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="truncate text-xs">{title}</span>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onDock}
          title="Dock"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      <div
        className={cn("absolute right-0 bottom-0 size-4 cursor-nwse-resize")}
        onPointerDown={(e) => {
          e.stopPropagation();
          const start = { w: pos.w, h: pos.h, px: e.clientX, py: e.clientY };
          const move = (ev: PointerEvent) => {
            setPos((p) => ({
              ...p,
              w: Math.max(320, start.w + ev.clientX - start.px),
              h: Math.max(240, start.h + ev.clientY - start.py),
            }));
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
    </div>
  );
}
