import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { overflowingItemIds } from "@/lib/overflow-toolbar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface OverflowToolbarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  sticky?: boolean;
  node: ReactNode;
  onSelect?: () => void;
}

export function OverflowToolbar({
  className,
  items,
  trailing,
}: {
  className?: string;
  items: OverflowToolbarItem[];
  trailing?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const itemKey = items.map((item) => item.id).join("|");

  useLayoutEffect(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure) return;

    const update = () => {
      const children = Array.from(measure.children) as HTMLElement[];
      const measured = itemsRef.current.map((item, index) => ({
        id: item.id,
        sticky: item.sticky,
        width: children[index]?.getBoundingClientRect().width ?? 0,
      }));
      const trailingWidth =
        trailingRef.current?.getBoundingClientRect().width ?? 0;
      const available = host.getBoundingClientRect().width - trailingWidth;
      setHiddenIds(overflowingItemIds(measured, available, 32, 4));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [itemKey]);

  const hidden = new Set(hiddenIds);
  const stickyItems = items.filter((item) => item.sticky);
  const visibleFlexible = items.filter(
    (item) => !item.sticky && !hidden.has(item.id),
  );
  const overflowItems = items.filter(
    (item) => hidden.has(item.id) && item.label && item.onSelect,
  );

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative flex min-w-0 items-center overflow-hidden",
        className,
      )}
    >
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-y-0 left-0 flex items-center gap-1"
      >
        {items.map((item) => (
          <div key={item.id} className="shrink-0">
            {item.node}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {stickyItems.map((item) => (
          <div key={item.id} className="shrink-0">
            {item.node}
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {visibleFlexible.map((item) => (
          <div key={item.id} className="shrink-0">
            {item.node}
          </div>
        ))}
        {overflowItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 shrink-0 shadow-none outline-none ring-0 hover:bg-muted/70 focus-visible:border-transparent focus-visible:ring-0 data-[state=open]:bg-muted/70"
                aria-label="More"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {overflowItems.map((item) => (
                <DropdownMenuItem key={item.id} onClick={item.onSelect}>
                  {item.icon ? (
                    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
                      {item.icon}
                    </span>
                  ) : null}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div data-tauri-drag-region className="min-w-2 flex-1 self-stretch" />
      </div>
      {trailing ? (
        <div ref={trailingRef} className="flex shrink-0 items-center gap-1">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
