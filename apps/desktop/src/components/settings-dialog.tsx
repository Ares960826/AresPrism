import {
  TypeIcon,
  FileCodeIcon,
  KeyRoundIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgentSettings,
  AppearanceSettings,
  LatexSettings,
  UpdateSettings,
} from "@/components/settings-form";
import { ClaudeSetup } from "@/components/claude-setup";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

type SettingsTab = "appearance" | "latex" | "provider" | "updates";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.settingsOpen);
  const setOpen = useSettingsStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<SettingsTab>("appearance");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] min-h-[min(20rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-border border-b px-5 py-3">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[9rem_minmax(0,1fr)] overflow-hidden">
          <aside className="space-y-1 overflow-y-auto border-border border-r p-2">
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
            <TabButton
              active={tab === "provider"}
              icon={KeyRoundIcon}
              label="Provider"
              onClick={() => setTab("provider")}
            />
            <TabButton
              active={tab === "updates"}
              icon={RefreshCwIcon}
              label="Updates"
              onClick={() => setTab("updates")}
            />
          </aside>
          <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
            {tab === "appearance" ? (
              <AppearanceSettings />
            ) : tab === "latex" ? (
              <LatexSettings />
            ) : tab === "updates" ? (
              <UpdateSettings />
            ) : (
              <div className="space-y-6">
                <AgentSettings />
                <div className="border-border border-t pt-4">
                  <ClaudeSetup variant="embedded" />
                </div>
              </div>
            )}
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
