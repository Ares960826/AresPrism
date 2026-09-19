import { useEffect } from "react";
import { toast } from "sonner";
import { useUpdaterStore } from "@/stores/updater-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/app-identity";

export function UpdateNotifier() {
  const status = useUpdaterStore((s) => s.status);
  const dismissed = useUpdaterStore((s) => s.dismissed);
  const lastCheckManual = useUpdaterStore((s) => s.lastCheckManual);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  const installUpdate = useUpdaterStore((s) => s.installUpdate);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkForUpdate({ silent: true });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [checkForUpdate]);

  useEffect(() => {
    if (status.state === "up-to-date" && lastCheckManual) {
      toast.success("You're on the latest version.");
    }
  }, [status, lastCheckManual]);

  const busy =
    status.state === "downloading" ||
    status.state === "installing" ||
    status.state === "ready";

  const open =
    busy ||
    (!dismissed && status.state === "available") ||
    (lastCheckManual && status.state === "error");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {status.state === "ready"
              ? "Restarting"
              : status.state === "installing"
                ? "Installing"
                : status.state === "downloading"
                  ? "Downloading"
                  : status.state === "error"
                    ? "Update failed"
                    : "Update available"}
          </DialogTitle>
          <DialogDescription>
            {status.state === "available"
              ? `${APP_NAME} ${status.version} is on GitHub. Download and install it here.`
              : status.state === "downloading"
                ? `Downloading… ${status.percent}%`
                : status.state === "installing"
                  ? "Installing the update."
                  : status.state === "ready"
                    ? "The app will restart."
                    : status.state === "error"
                      ? status.message
                      : "Checking GitHub for a newer build."}
          </DialogDescription>
        </DialogHeader>
        {status.state === "available" && status.notes ? (
          <p className="max-h-40 overflow-auto whitespace-pre-wrap text-muted-foreground text-xs">
            {status.notes}
          </p>
        ) : null}
        {status.state === "downloading" ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-sky-600 transition-[width]"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        ) : null}
        <DialogFooter>
          {status.state === "available" ? (
            <>
              <Button variant="outline" onClick={dismiss}>
                Later
              </Button>
              <Button onClick={() => void installUpdate()}>
                Download and install
              </Button>
            </>
          ) : null}
          {status.state === "error" ? (
            <>
              <Button variant="outline" onClick={dismiss}>
                Close
              </Button>
              <Button onClick={() => void checkForUpdate()}>Try again</Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
