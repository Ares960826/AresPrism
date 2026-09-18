import { TypeIcon, FileCodeIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppearanceSettings, LatexSettings } from "@/components/settings-form";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

type SettingsTab = "appearance" | "latex";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.settingsOpen);
  const setOpen = useSettingsStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<SettingsTab>("appearance");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-border border-b px-5 py-3">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-80 grid-cols-[9rem_minmax(0,1fr)]">
          <aside className="space-y-1 border-border border-r p-2">
            <TabButton
              active={tab === "appearance"}
              icon={TypeIcon}
              label="Appearance"
              onClick={() => setTab("appearance")}
            />
            <TabButton
              active={tab === "latex"}
              icon={FileCodeIcon}
              label="LaTeX"
              onClick={() => setTab("latex")}
            />
          </aside>
          <div className="min-w-0 overflow-auto p-4">
            {tab === "appearance" ? <AppearanceSettings /> : <LatexSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof TypeIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs",
        active ? "bg-accent font-medium" : "hover:bg-muted/60",
      )}
      onClick={onClick}
    >
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}
