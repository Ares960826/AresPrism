import { RefreshCwIcon } from "lucide-react";
import { useUpdaterStore } from "@/stores/updater-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UpdateCheckButton({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const status = useUpdaterStore((s) => s.status);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  const installUpdate = useUpdaterStore((s) => s.installUpdate);
  const checking = status.state === "checking";
  const available = status.state === "available";
  const busy = status.state === "downloading" || status.state === "installing";

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-6", className)}
        title={
          available
            ? `Install ${status.version}`
            : checking
              ? "Checking for updates"
              : "Check for updates"
        }
        disabled={checking || busy}
        onClick={() => {
          if (available) void installUpdate();
          else void checkForUpdate();
        }}
      >
        <RefreshCwIcon className={cn("size-3.5", checking && "animate-spin")} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-7 shrink-0 rounded-md px-2.5 text-xs", className)}
      disabled={checking || busy}
      onClick={() => {
        if (available) void installUpdate();
        else void checkForUpdate();
      }}
    >
      <RefreshCwIcon
        className={cn("mr-1 size-3", checking && "animate-spin")}
      />
      {available
        ? `Install v${status.version}`
        : checking
          ? "Checking..."
          : busy
            ? "Updating..."
            : "Check for updates"}
    </Button>
  );
}
