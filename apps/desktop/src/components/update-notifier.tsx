import { useEffect, useState } from "react";
import { useUpdater } from "@/hooks/use-updater";
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
  const { status, checkForUpdate, installUpdate } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const timer = window.setTimeout(() => {
      void checkForUpdate({ silent: true });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkForUpdate]);

  const open =
    !dismissed &&
    (status.state === "available" ||
      status.state === "downloading" ||
      status.state === "installing" ||
      status.state === "ready");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && status.state === "available") setDismissed(true);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {status.state === "ready"
              ? "Restarting"
              : status.state === "installing" || status.state === "downloading"
                ? "Updating"
                : "Update available"}
          </DialogTitle>
          <DialogDescription>
            {status.state === "available"
              ? `${APP_NAME} ${status.version} is ready to download from GitHub.`
              : status.state === "downloading"
                ? `Downloading… ${status.percent}%`
                : status.state === "installing"
                  ? "Installing the update."
                  : "The app will restart."}
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
              className="h-full bg-foreground transition-[width]"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        ) : null}
        <DialogFooter>
          {status.state === "available" ? (
            <>
              <Button variant="outline" onClick={() => setDismissed(true)}>
                Later
              </Button>
              <Button onClick={() => void installUpdate()}>
                Download and install
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
