import { useTheme } from "next-themes";
import { LeafIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
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
import { EDITOR_FONT_OPTIONS, UI_FONT_OPTIONS } from "@/lib/appearance";
import { cn } from "@/lib/utils";

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
        <div className="flex gap-1">
          {(
            [
              ["system", "System", MonitorIcon],
              ["light", "Light", SunIcon],
              ["dark", "Dark", MoonIcon],
              ["warm", "护眼", LeafIcon],
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

export function LatexSettings() {
  const compilerBackend = useSettingsStore((s) => s.compilerBackend);
  const setCompilerBackend = useSettingsStore((s) => s.setCompilerBackend);
  const defaultEngine = useSettingsStore((s) => s.defaultEngine);
  const setDefaultEngine = useSettingsStore((s) => s.setDefaultEngine);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setVimMode = useSettingsStore((s) => s.setVimMode);
  const citationFile = useSettingsStore((s) => s.citationFile);
  const setCitationFile = useSettingsStore((s) => s.setCitationFile);
  const files = useDocumentStore((s) => s.files);
  const citationFiles = files.filter((f) => isCitationFileName(f.name));

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
      <Field label="Citation file">
        <Select value={citationFile} onValueChange={(v) => setCitationFile(v)}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="references.bib" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="references.bib">references.bib</SelectItem>
            {citationFiles
              .filter((f) => f.relativePath !== "references.bib")
              .map((f) => (
                <SelectItem key={f.id} value={f.relativePath}>
                  {f.relativePath}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Zotero import writes here. Allowed: .bib, .bibtex, .json (CSL), .ris,
          .enw.
        </p>
      </Field>
      <Field label="Editor">
        <button
          type="button"
          role="switch"
          aria-checked={vimMode}
          className="flex h-8 w-full items-center justify-between rounded-md border border-border px-2.5 text-xs"
          onClick={() => setVimMode(!vimMode)}
        >
          <span>Vim mode</span>
          <span
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              vimMode ? "bg-foreground" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-background transition-transform",
                vimMode ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
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
