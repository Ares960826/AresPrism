import { PanelResizeHandle } from "react-resizable-panels";
import { cn } from "@/lib/utils";

/** Wider hit target than the 1px rule so panel drags don't miss or overlap content. */
export function WorkspaceResizeHandle({
  direction,
  className,
}: {
  direction: "horizontal" | "vertical";
  className?: string;
}) {
  const horizontal = direction === "horizontal";
  return (
    <PanelResizeHandle
      className={cn(
        "relative z-20 shrink-0 bg-transparent",
        horizontal ? "w-1.5" : "h-1.5",
        "hover:bg-ring/30 data-resize-handle-active:bg-ring/50",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute bg-border",
          horizontal
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2",
        )}
      />
    </PanelResizeHandle>
  );
}
