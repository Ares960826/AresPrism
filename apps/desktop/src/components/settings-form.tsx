import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  WavesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { isCitationFileName } from "@/lib/citation-file";
import {
  inferCompileDocuments,
  type CompileDocument,
} from "@/lib/compile-documents";
import { EDITOR_FONT_OPTIONS, UI_FONT_OPTIONS } from "@/lib/appearance";
import {
  AGENT_OPTIONS,
  defaultAgentModel,
  mergeAgentModels,
  type AgentKind,
} from "@/lib/agent-kind";
import { cn } from "@/lib/utils";
import { CapsuleSwitch, RadioDot } from "@/components/ui/capsule-switch";
import { UpdateCheckButton } from "@/components/update-controls";
import { useUpdaterStore } from "@/stores/updater-store";
import { getVersion } from "@tauri-apps/api/app";
import { APP_NAME } from "@/lib/app-identity";

const CITATION_NONE = "__none__";

interface AgentBinaryStatus {
  id: AgentKind;
  label: string;
  binary: string;
  installed: boolean;
  authenticated: boolean;
  ready: boolean;
  detail: string;
  binary_path: string | null;
  version: string | null;
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const uiFont = useSettingsStore((s) => s.uiFont);
  const setUiFont = useSettingsStore((s) => s.setUiFont);
  const editorFont = useSettingsStore((s) => s.editorFont);
  const setEditorFont = useSettingsStore((s) => s.setEditorFont);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const setUiFontSize = useSettingsStore((s) => s.setUiFontSize);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);

  return (
    <div className="space-y-5">
      <Field label="Theme">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["system", "System", MonitorIcon],
              ["light", "Light", SunIcon],
              ["dark", "Dark", MoonIcon],
              ["warm", "察尔汗盐湖", WavesIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs",
                theme === value
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-muted/60",
              )}
              onClick={() => setTheme(value)}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="App font">
        <Select
          value={uiFont}
          onValueChange={(v) => setUiFont(v as typeof uiFont)}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_FONT_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <span style={{ fontFamily: opt.stack }}>{opt.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <SizeRow
        label="App size"
        value={uiFontSize}
        min={12}
        max={28}
        onChange={setUiFontSize}
      />
      <Field label="Editor font">
        <Select
          value={editorFont}
          onValueChange={(v) => setEditorFont(v as typeof editorFont)}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITOR_FONT_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <span style={{ fontFamily: opt.stack }}>{opt.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Uses the font if it is installed on this Mac; otherwise falls back to
          system mono.
        </p>
      </Field>
      <SizeRow
        label="Editor size"
        value={editorFontSize}
        min={11}
        max={22}
        onChange={setEditorFontSize}
      />
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <p className="text-muted-foreground text-xs">App UI</p>
        <p>AresPrism · 论文与笔记</p>
        <p
          className="mt-2 text-muted-foreground text-xs"
          style={{
            fontFamily: "var(--editor-font-family)",
            fontSize: "var(--editor-font-size)",
          }}
        >
          {"\\section{Introduction}  编辑区预览  0123456789"}
        </p>
      </div>
    </div>
  );
}

export function AgentSettings() {
  const agentKind = useSettingsStore((s) => s.agentKind);
  const setAgentKind = useSettingsStore((s) => s.setAgentKind);
  const agentModels = useSettingsStore((s) => s.agentModels);
  const setAgentModel = useSettingsStore((s) => s.setAgentModel);
  const [statuses, setStatuses] = useState<AgentBinaryStatus[]>([]);
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const modelOptions = mergeAgentModels(agentKind, liveModels);
  const selectedModel =
    modelOptions.find((item) => item.id === agentModels[agentKind])?.id ||
    modelOptions[0]?.id ||
    defaultAgentModel(agentKind);

  useEffect(() => {
    let cancelled = false;
    invoke<AgentBinaryStatus[]>("check_agents_status")
      .then((result) => {
        if (!cancelled) setStatuses(result);
      })
      .catch(() => {
        if (!cancelled) setStatuses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    invoke<{ id: string }[]>("list_agent_models", { agent: agentKind })
      .then((result) => {
        if (!cancelled) setLiveModels(result.map((item) => item.id));
      })
      .catch(() => {
        if (!cancelled) setLiveModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agentKind]);

  return (
    <div className="space-y-5">
      <Field label="Local CLI">
        <div className="space-y-1.5">
          {AGENT_OPTIONS.map((option) => {
            const status = statuses.find((item) => item.id === option.id);
            const selected = agentKind === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left",
                  selected
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-muted/60",
                )}
                onClick={() => {
                  if (option.id === "claude" || status?.ready) {
                    setAgentKind(option.id);
                  }
                }}
              >
                <RadioDot selected={selected} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs">{option.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {status?.detail || "…"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Chat runs this CLI in the project folder. Sign in with that CLI
          (browser / OAuth). API keys in the section below are only for Claude
          Code; they do not log you into Codex, Grok, or Kimi.
        </p>
      </Field>
      {agentKind !== "claude" && modelOptions.length > 0 && (
        <Field label="Model">
          <Select
            value={selectedModel}
            onValueChange={(value) => setAgentModel(agentKind, value)}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}

export function LatexSettings() {
  const compilerBackend = useSettingsStore((s) => s.compilerBackend);
  const setCompilerBackend = useSettingsStore((s) => s.setCompilerBackend);
  const defaultEngine = useSettingsStore((s) => s.defaultEngine);
  const setDefaultEngine = useSettingsStore((s) => s.setDefaultEngine);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setVimMode = useSettingsStore((s) => s.setVimMode);
  const synctexFollowCursor = useSettingsStore((s) => s.synctexFollowCursor);
  const setSynctexFollowCursor = useSettingsStore(
    (s) => s.setSynctexFollowCursor,
  );
  const synctexDblClickLocate = useSettingsStore(
    (s) => s.synctexDblClickLocate,
  );
  const setSynctexDblClickLocate = useSettingsStore(
    (s) => s.setSynctexDblClickLocate,
  );
  const citationFile = useSettingsStore((s) => s.citationFile);
  const setCitationFile = useSettingsStore((s) => s.setCitationFile);
  const compileDocumentsByProject = useSettingsStore(
    (s) => s.compileDocumentsByProject,
  );
  const setProjectCompileDocuments = useSettingsStore(
    (s) => s.setProjectCompileDocuments,
  );
  const files = useDocumentStore((s) => s.files);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const citationFiles = files.filter((f) => isCitationFileName(f.name));
  const texFiles = files.filter((f) => f.type === "tex");
  const storedDocs = projectRoot
    ? (compileDocumentsByProject[projectRoot] ?? [])
    : [];
  const inferredDocs = inferCompileDocuments(files, citationFile);
  const compileDocs =
    storedDocs.length > 0 ? storedDocs : inferredDocs.slice(0, 1);

  const persistDocs = (next: CompileDocument[]) => {
    if (!projectRoot) return;
    setProjectCompileDocuments(projectRoot, next);
    setCitationFile(next[0]?.citationFile ?? "");
  };

  return (
    <div className="space-y-5">
      <Field label="Compiler">
        <Select
          value={compilerBackend}
          onValueChange={(v) => setCompilerBackend(v as typeof compilerBackend)}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tectonic">Tectonic</SelectItem>
            <SelectItem value="texlive">TeX Live</SelectItem>
            <SelectItem value="latexmk">latexmk</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Default engine">
        <Select
          value={defaultEngine}
          onValueChange={(v) => setDefaultEngine(v as typeof defaultEngine)}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pdflatex">pdfLaTeX</SelectItem>
            <SelectItem value="xelatex">XeLaTeX</SelectItem>
            <SelectItem value="lualatex">LuaLaTeX</SelectItem>
            <SelectItem value="auto">Auto (% !TEX program)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Used when the file has no % !TEX program comment.
        </p>
      </Field>
      <Field label="Documents">
        {!projectRoot ? (
          <p className="text-[11px] text-muted-foreground">
            Open a project to choose main files and their citation files.
          </p>
        ) : (
          <div className="space-y-2">
            {compileDocs.map((doc, index) => (
              <div key={`${doc.mainFile}-${index}`} className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {index === 0
                    ? "Default open / compile"
                    : `Document ${index + 1}`}
                </p>
                <Select
                  value={doc.mainFile}
                  onValueChange={(value) => {
                    const next = compileDocs.map((item, i) =>
                      i === index ? { ...item, mainFile: value } : item,
                    );
                    persistDocs(next);
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="main.tex" />
                  </SelectTrigger>
                  <SelectContent>
                    {texFiles.map((file) => (
                      <SelectItem key={file.id} value={file.relativePath}>
                        {file.relativePath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={doc.citationFile || CITATION_NONE}
                  onValueChange={(value) => {
                    const next = compileDocs.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            citationFile: value === CITATION_NONE ? "" : value,
                          }
                        : item,
                    );
                    persistDocs(next);
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CITATION_NONE}>None</SelectItem>
                    {doc.citationFile &&
                    !citationFiles.some(
                      (file) => file.relativePath === doc.citationFile,
                    ) ? (
                      <SelectItem value={doc.citationFile}>
                        {doc.citationFile}
                      </SelectItem>
                    ) : null}
                    {citationFiles.map((f) => (
                      <SelectItem key={f.id} value={f.relativePath}>
                        {f.relativePath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {compileDocs.length > 1 && (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      persistDocs(compileDocs.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => {
                const used = new Set(compileDocs.map((doc) => doc.mainFile));
                const nextMain =
                  texFiles.find((file) => !used.has(file.relativePath))
                    ?.relativePath ?? compileDocs[0]?.mainFile;
                if (!nextMain) return;
                persistDocs([
                  ...compileDocs,
                  {
                    mainFile: nextMain,
                    citationFile: "",
                  },
                ]);
              }}
            >
              <PlusIcon className="size-3.5" />
              Add another main file
            </Button>
            <p className="text-[11px] text-muted-foreground">
              First row is opened and compiled when the project loads. Citation
              files are optional.
            </p>
          </div>
        )}
      </Field>
      <Field label="SyncTeX">
        <div className="space-y-1.5">
          <CapsuleSwitch
            checked={synctexFollowCursor}
            label="Follow cursor"
            onCheckedChange={setSynctexFollowCursor}
          />
          <CapsuleSwitch
            checked={synctexDblClickLocate}
            label="Double-click to locate"
            onCheckedChange={setSynctexDblClickLocate}
          />
          <p className="text-[11px] text-muted-foreground">
            PDF click jumps to the matching source file. Double-click a word in
            the editor to flash the line, then the word.
          </p>
        </div>
      </Field>
      <Field label="Editor">
        <CapsuleSwitch
          checked={vimMode}
          label="Vim mode"
          onCheckedChange={setVimMode}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SizeRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (size: number) => void;
}) {
  return (
    <Field label={`${label} (${value}px)`}>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-foreground"
      />
    </Field>
  );
}

export function UpdateSettings() {
  const [version, setVersion] = useState("");
  const status = useUpdaterStore((s) => s.status);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const detail =
    status.state === "available"
      ? `v${version || "…"} → v${status.version}`
      : status.state === "up-to-date"
        ? `v${version} (latest)`
        : status.state === "error"
          ? status.message
          : version
            ? `v${version}`
            : "…";

  return (
    <div className="space-y-5">
      <Field label="This app">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-2">
          <div className="min-w-0">
            <p className="font-medium text-xs">{APP_NAME}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {detail}
            </p>
          </div>
          <UpdateCheckButton />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Checks GitHub Releases and installs into this app, then restarts. You
          can also click the version in the sidebar footer.
        </p>
      </Field>
    </div>
  );
}
