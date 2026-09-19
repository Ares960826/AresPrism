import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  FolderOpenIcon,
  XIcon,
  FileTextIcon,
  SparklesIcon,
  CheckCircle2Icon,
  CircleIcon,
  DownloadIcon,
  Loader2Icon,
  KeyRoundIcon,
  SearchIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
  TypeIcon,
  FileCodeIcon,
  GithubIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useClaudeSetupStore } from "@/stores/claude-setup-store";
import { useUvSetupStore } from "@/stores/uv-setup-store";
import { APP_NAME, APP_REPO_URL } from "@/lib/app-identity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectWizard, type CreationMode } from "./project-wizard";
import { ClaudeSetup } from "./claude-setup";
import {
  AgentSettings,
  AppearanceSettings,
  LatexSettings,
} from "@/components/settings-form";
import { cn } from "@/lib/utils";

interface DefaultProject {
  path: string;
  name: string;
  last_modified: number;
  has_main_tex: boolean;
}

type ProjectPickerSection = "projects" | "settings";
type SettingsDetailSection =
  | "appearance"
  | "latex"
  | "provider"
  | "environment";

type RecentProject = {
  path: string;
  name: string;
  lastOpened: number;
};

export function ProjectPicker() {
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [wizardMode, setWizardMode] = useState<CreationMode | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] =
    useState<ProjectPickerSection>("projects");
  const [settingsDetailSection, setSettingsDetailSection] =
    useState<SettingsDetailSection>("appearance");
  const [searchQuery, setSearchQuery] = useState("");
  const [removeProjectTarget, setRemoveProjectTarget] =
    useState<RecentProject | null>(null);
  const defaultProjectsDiscoveredRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { theme = "system", setTheme } = useTheme();
  const searchShortcutLabel = "⌘ K";

  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);

  const claudeStatus = useClaudeSetupStore((s) => s.status);
  const checkClaudeStatus = useClaudeSetupStore((s) => s.checkStatus);
  const isClaudeReady = claudeStatus === "ready";

  useEffect(() => {
    checkClaudeStatus();
    getVersion().then(setAppVersion);
  }, [checkClaudeStatus]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        event.altKey ||
        event.shiftKey ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      setActiveSection("projects");
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (defaultProjectsDiscoveredRef.current || recentProjects.length > 0) {
      return;
    }
    defaultProjectsDiscoveredRef.current = true;

    let cancelled = false;

    async function discoverDefaultProjects() {
      try {
        const projects = await invoke<DefaultProject[]>(
          "list_default_projects",
        );
        if (cancelled || projects.length === 0) return;

        for (const project of [...projects].reverse()) {
          addRecentProject(project.path);
        }
      } catch (err) {
        console.warn("Failed to discover default projects:", err);
      }
    }

    discoverDefaultProjects();

    return () => {
      cancelled = true;
    };
  }, [addRecentProject, recentProjects.length]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Project Folder",
      });
      if (typeof selected === "string" && selected) {
        await openProject(selected);
        addRecentProject(selected);
      }
    } catch (err) {
      console.warn("Failed to open selected project folder:", err);
      toast.error("Failed to open project folder", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      await openProject(path);
      addRecentProject(path);
    } catch (err) {
      removeRecentProject(path);
      console.warn("Failed to open recent project:", { path, error: err });
    }
  };

  const handleSelectMode = (mode: CreationMode) => {
    setShowModeDialog(false);
    setWizardMode(mode);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleProjects = useMemo(() => {
    if (!normalizedSearch) return recentProjects;
    return recentProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(normalizedSearch) ||
        project.path.toLowerCase().includes(normalizedSearch),
    );
  }, [normalizedSearch, recentProjects]);

  if (wizardMode) {
    return (
      <ProjectWizard mode={wizardMode} onBack={() => setWizardMode(null)} />
    );
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
          isSidebarCollapsed ? "w-12" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-[calc(48px+var(--titlebar-height))] items-center gap-2 px-3 pt-[var(--titlebar-height)]",
            isSidebarCollapsed ? "justify-center" : "justify-between",
          )}
        >
          {!isSidebarCollapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-sm">{APP_NAME}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-lg text-muted-foreground hover:text-foreground",
              isSidebarCollapsed ? "size-7" : "size-8",
            )}
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            aria-label={
              isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <PanelLeftIcon
              className={cn(
                "size-3.5 transition-transform duration-200",
                isSidebarCollapsed && "rotate-180",
              )}
            />
          </Button>
        </div>

        <nav
          className={cn(
            "flex flex-col gap-1",
            isSidebarCollapsed ? "items-center px-0" : "px-2",
          )}
        >
          <ProjectNavButton
            active={activeSection === "projects"}
            collapsed={isSidebarCollapsed}
            icon={FolderOpenIcon}
            onClick={() => setActiveSection("projects")}
          >
            All Projects
          </ProjectNavButton>
          <ProjectNavButton
            active={activeSection === "settings"}
            collapsed={isSidebarCollapsed}
            icon={SettingsIcon}
            onClick={() => setActiveSection("settings")}
          >
            Settings
          </ProjectNavButton>
        </nav>

        <div
          className={cn(
            "mt-auto flex h-9 items-center border-sidebar-border border-t text-muted-foreground text-xs",
            isSidebarCollapsed ? "justify-center px-0" : "justify-between px-3",
          )}
        >
          {isSidebarCollapsed ? (
            <img src="/icon-192.png" alt={APP_NAME} className="size-4" />
          ) : (
            <>
              <span className="truncate">
                {APP_NAME} v{appVersion}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="size-6" asChild>
                  <a
                    href={APP_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="GitHub"
                  >
                    <GithubIcon className="size-3.5" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => {
                    if (theme === "system") setTheme("light");
                    else if (theme === "light") setTheme("dark");
                    else setTheme("system");
                  }}
                  title={
                    theme === "system"
                      ? "System theme"
                      : theme === "light"
                        ? "Light mode"
                        : "Dark mode"
                  }
                >
                  {theme === "system" ? (
                    <MonitorIcon className="size-3.5" />
                  ) : theme === "light" ? (
                    <SunIcon className="size-3.5" />
                  ) : (
                    <MoonIcon className="size-3.5" />
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[calc(48px+var(--titlebar-height))] shrink-0 flex-nowrap items-center gap-3 border-border/70 border-b bg-background px-5">
          <div className="mr-auto flex min-w-0 items-center">
            <h1 className="truncate font-semibold text-lg leading-none">
              {activeSection === "settings" ? "Settings" : "All Projects"}
            </h1>
          </div>

          {activeSection === "projects" && (
            <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
              <div className="relative flex min-w-40 flex-1 items-center sm:max-w-sm">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="h-9 w-full rounded-lg border border-input bg-background pr-16 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-2 flex h-6 min-w-10 -translate-y-1/2 items-center justify-center rounded-md border border-border/70 bg-muted/30 px-1.5 font-medium text-[11px] text-muted-foreground leading-none">
                  {searchShortcutLabel}
                </kbd>
              </div>

              <Button
                onClick={handleOpenFolder}
                variant="secondary"
                className="h-9 shrink-0 gap-1.5 rounded-lg px-3.5"
              >
                <FolderOpenIcon className="size-4" />
                Import
              </Button>
              <Button
                onClick={() => setShowModeDialog(true)}
                className="h-9 shrink-0 gap-1.5 rounded-lg px-4"
              >
                <PlusIcon className="size-4" />
                New
              </Button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {activeSection === "settings" ? (
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-8 py-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
              <aside className="space-y-1 lg:border-border/60 lg:border-r lg:pr-4">
                <SettingsDetailButton
                  active={settingsDetailSection === "appearance"}
                  icon={TypeIcon}
                  label="Appearance"
                  meta="Fonts"
                  onClick={() => setSettingsDetailSection("appearance")}
                />
                <SettingsDetailButton
                  active={settingsDetailSection === "latex"}
                  icon={FileCodeIcon}
                  label="LaTeX"
                  meta="Compile"
                  onClick={() => setSettingsDetailSection("latex")}
                />
                <SettingsDetailButton
                  active={settingsDetailSection === "provider"}
                  icon={KeyRoundIcon}
                  label="Provider"
                  meta={isClaudeReady ? "Ready" : "Setup"}
                  onClick={() => setSettingsDetailSection("provider")}
                />
                <SettingsDetailButton
                  active={settingsDetailSection === "environment"}
                  icon={CheckCircle2Icon}
                  label="Environment"
                  meta="Python / Skills"
                  onClick={() => setSettingsDetailSection("environment")}
                />
              </aside>

              <div className="min-w-0">
                {settingsDetailSection === "appearance" ? (
                  <SettingsPanel title="Appearance" icon={TypeIcon}>
                    <AppearanceSettings />
                  </SettingsPanel>
                ) : settingsDetailSection === "latex" ? (
                  <SettingsPanel title="LaTeX" icon={FileCodeIcon}>
                    <LatexSettings />
                  </SettingsPanel>
                ) : settingsDetailSection === "provider" ? (
                  <SettingsPanel title="Provider" icon={KeyRoundIcon}>
                    <div className="space-y-6">
                      <AgentSettings />
                      <div className="-mx-4 border-border border-t">
                        <ClaudeSetup variant="embedded" />
                      </div>
                    </div>
                  </SettingsPanel>
                ) : (
                  <SettingsPanel
                    title="Environment"
                    icon={CheckCircle2Icon}
                    contentClassName="p-0"
                  >
                    <EnvironmentStatus appVersion={appVersion} />
                  </SettingsPanel>
                )}
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-4 px-5 py-5">
              {visibleProjects.length === 0 ? (
                <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-border border-dashed bg-muted/10 px-6 text-center">
                  <FileTextIcon className="mb-4 size-10 text-muted-foreground/70" />
                  <h2 className="font-semibold text-lg">
                    {normalizedSearch ? "No matching projects" : "No projects"}
                  </h2>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Button onClick={() => setShowModeDialog(true)}>
                      <PlusIcon className="mr-2 size-4" />
                      New
                    </Button>
                    <Button onClick={handleOpenFolder} variant="outline">
                      <FolderOpenIcon className="mr-2 size-4" />
                      Import
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visibleProjects.map((project) => (
                    <ProjectListRow
                      key={project.path}
                      project={project}
                      onOpen={() => handleOpenRecent(project.path)}
                      onRemove={() => setRemoveProjectTarget(project)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* New Project mode selection dialog */}
      <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>How would you like to start?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSelectMode("template")}
              className="group flex flex-1 flex-col items-center gap-3 rounded-lg border border-border/70 p-4 text-center transition-colors hover:border-border hover:bg-muted/50"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover:bg-muted">
                <SparklesIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Guided Setup</div>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  Pick a template and let AI help you get started
                </p>
              </div>
              <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                Recommended
              </span>
            </button>

            <button
              onClick={() => handleSelectMode("scratch")}
              className="group flex flex-1 flex-col items-center gap-3 rounded-lg border border-border/70 p-4 text-center transition-colors hover:border-border hover:bg-muted/50"
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover:bg-muted">
                <FileTextIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Blank Document</div>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  Start with an empty LaTeX file
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!removeProjectTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveProjectTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Remove "{removeProjectTarget?.name ?? "this project"}" from All
              Projects? The project files will stay on disk.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveProjectTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!removeProjectTarget) return;
                removeRecentProject(removeProjectTarget.path);
                setRemoveProjectTarget(null);
              }}
              disabled={!removeProjectTarget}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Environment Status (shown when Claude is ready) ───

interface SkillsStatus {
  installed: boolean;
  skill_count: number;
  location: string;
}

function formatOpenedDate(lastOpened: number) {
  if (!lastOpened) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(lastOpened));
}

function ProjectListRow({
  project,
  onOpen,
  onRemove,
}: {
  project: RecentProject;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const opened = formatOpenedDate(project.lastOpened);
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5 hover:border-foreground/20">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpen}
      >
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{project.name}</div>
          <div className="mt-0.5 truncate text-muted-foreground text-xs">
            {[opened, project.path].filter(Boolean).join(" · ")}
          </div>
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onRemove}
        aria-label={`Remove ${project.name}`}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function ProjectNavButton({
  active,
  collapsed,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center rounded-lg font-medium text-sm transition-colors",
        collapsed
          ? "size-8 justify-center"
          : "h-10 w-full justify-start gap-3 px-3 text-left",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      title={typeof children === "string" ? children : undefined}
    >
      <Icon className="size-3.5 shrink-0" />
      {!collapsed && <span className="truncate">{children}</span>}
    </button>
  );
}

function SettingsDetailButton({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border",
          active
            ? "border-border/70 bg-background/70"
            : "border-border/60 bg-muted/20",
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{label}</div>
        <div className="truncate text-muted-foreground text-xs">{meta}</div>
      </div>
    </button>
  );
}

function SettingsPanel({
  title,
  icon: Icon,
  contentClassName,
  children,
}: {
  title: string;
  icon: LucideIcon;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-muted/10">
      <div className="flex items-center gap-3 border-border/60 border-b px-5 py-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-sm">{title}</h2>
        </div>
      </div>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

function EnvironmentStatus({ appVersion }: { appVersion: string }) {
  const uvStatus = useUvSetupStore((s) => s.status);
  const uvVersion = useUvSetupStore((s) => s.version);
  const uvInstalling = useUvSetupStore((s) => s.isInstalling);
  const checkUv = useUvSetupStore((s) => s.checkStatus);
  const installUv = useUvSetupStore((s) => s.install);
  const _finishUvInstall = useUvSetupStore((s) => s._finishInstall);

  const [skillsStatus, setSkillsStatus] = useState<SkillsStatus | null>(null);
  const [skillsInstalling, _setSkillsInstalling] = useState(false);
  const [showSkillsOnboarding, setShowSkillsOnboarding] = useState(false);

  const checkSkills = useCallback(async () => {
    try {
      const gs = await invoke<SkillsStatus>("check_skills_installed", {
        projectPath: null,
      });
      setSkillsStatus(gs);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkUv();
    checkSkills();
  }, [checkUv, checkSkills]);

  // Listen for uv install completion
  useEffect(() => {
    const unlisten = listen<boolean>("uv-install-complete", (event) => {
      _finishUvInstall(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [_finishUvInstall]);

  // Lazy load skills onboarding
  const [OnboardingComponent, setOnboardingComponent] = useState<ComponentType<{
    onClose: () => void;
  }> | null>(null);

  useEffect(() => {
    if (showSkillsOnboarding && !OnboardingComponent) {
      import(
        "@/components/scientific-skills/scientific-skills-onboarding"
      ).then((mod) =>
        setOnboardingComponent(() => mod.ScientificSkillsOnboarding),
      );
    }
  }, [showSkillsOnboarding, OnboardingComponent]);

  return (
    <>
      <div className="divide-y divide-border/60">
        {/* Python (uv) */}
        <StatusRow
          ok={uvStatus === "ready"}
          label="Python (uv)"
          detail={
            uvInstalling
              ? "Installing..."
              : uvStatus === "ready"
                ? (uvVersion ?? "Installed")
                : uvStatus === "checking"
                  ? "Checking..."
                  : "Not installed"
          }
          action={
            uvStatus === "not-installed" && !uvInstalling
              ? { label: "Install", onClick: installUv }
              : uvInstalling
                ? { label: "Installing...", loading: true }
                : undefined
          }
        />

        {/* Scientific Skills */}
        <StatusRow
          ok={!!skillsStatus?.installed}
          label="Scientific Skills"
          detail={
            skillsInstalling
              ? "Installing..."
              : skillsStatus?.installed
                ? `${skillsStatus.skill_count} skills`
                : "Not installed"
          }
          action={
            skillsInstalling
              ? { label: "Installing...", loading: true }
              : {
                  label: skillsStatus?.installed ? "Manage" : "Install",
                  onClick: () => setShowSkillsOnboarding(true),
                  icon: skillsStatus?.installed ? "settings" : "download",
                }
          }
        />

        <StatusRow
          ok={true}
          label={APP_NAME}
          detail={appVersion ? `v${appVersion}` : "Checking..."}
        />
      </div>

      {showSkillsOnboarding && OnboardingComponent && (
        <OnboardingComponent
          onClose={() => {
            setShowSkillsOnboarding(false);
            checkSkills();
          }}
        />
      )}
    </>
  );
}

function StatusRow({
  ok,
  label,
  detail,
  action,
}: {
  ok: boolean;
  label: string;
  detail: string;
  action?: {
    label: string;
    onClick?: () => void;
    loading?: boolean;
    icon?: "download" | "key" | "settings";
  };
}) {
  return (
    <div className="flex min-h-12 min-w-0 items-center gap-3 px-4 py-3">
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border",
          ok
            ? "border-green-500/20 bg-green-500/10 text-green-600"
            : "border-border/70 bg-muted/30 text-muted-foreground",
        )}
      >
        {ok ? (
          <CheckCircle2Icon className="size-3.5" />
        ) : (
          <CircleIcon className="size-3.5" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span
          className={cn(
            "w-32 shrink-0 truncate font-medium text-sm",
            ok ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
          {detail}
        </span>
      </div>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 rounded-md px-2.5 text-xs"
          onClick={action.onClick}
          disabled={action.loading}
        >
          {action.loading ? (
            <Loader2Icon className="mr-1 size-3 animate-spin" />
          ) : action.icon === "key" ? (
            <KeyRoundIcon className="mr-1 size-3" />
          ) : action.icon === "settings" ? (
            <SettingsIcon className="mr-1 size-3" />
          ) : (
            <DownloadIcon className="mr-1 size-3" />
          )}
          {action.label}
        </Button>
      )}
    </div>
  );
}
