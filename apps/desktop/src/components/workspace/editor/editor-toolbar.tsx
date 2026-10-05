import { RefObject, useCallback, useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import {
  BoldIcon,
  ItalicIcon,
  ListIcon,
  Heading1Icon,
  Heading2Icon,
  CodeIcon,
  CropIcon,
  FunctionSquareIcon,
  FileTextIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  BookMarkedIcon,
  ExternalLinkIcon,
  LayersIcon,
  WrapTextIcon,
  RulerIcon,
  PlayIcon,
  LoaderIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import vscodeIcon from "@/assets/vscode.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { compileIndependentRoots } from "@/lib/latex-compiler";
import { requestPreviewCompile } from "@/lib/preview-compile";
import { useHistoryStore } from "@/stores/history-store";
import { cn } from "@/lib/utils";
import { OverflowToolbar } from "@/components/workspace/overflow-toolbar";

interface EditorInfo {
  id: string;
  name: string;
}

const ZOOM_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

function OpenEditorIcon({ editor }: { editor: EditorInfo }) {
  if (editor.id === "vscode") {
    return (
      <img
        src={vscodeIcon}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-5"
      />
    );
  }

  return <ExternalLinkIcon className="size-4" />;
}

function getOpenEditorButtonClassName(editor: EditorInfo) {
  return editor.id === "vscode"
    ? "h-7 w-7 border border-border/70 bg-muted/30 p-1 hover:bg-muted/50"
    : undefined;
}

interface EditorToolbarProps {
  editorView: RefObject<EditorView | null>;
  fileType?: "tex" | "image";
  imageScale?: number;
  onImageScaleChange?: (scale: number) => void;
  cropMode?: boolean;
  onCropToggle?: () => void;
}

export function EditorToolbar({
  editorView,
  fileType = "tex",
  imageScale = 1,
  onImageScaleChange,
  cropMode,
  onCropToggle,
}: EditorToolbarProps) {
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setVimMode = useSettingsStore((s) => s.setVimMode);
  const editorWrapMode = useSettingsStore((s) => s.editorWrapMode);
  const setEditorWrapMode = useSettingsStore((s) => s.setEditorWrapMode);
  const editorRulerColumn = useSettingsStore((s) => s.editorRulerColumn);
  const toggleWrapMode = () =>
    setEditorWrapMode(editorWrapMode === "wrap" ? "ruler" : "wrap");

  const fileName = useDocumentStore((s) => {
    const activeFile = s.files.find((f) => f.id === s.activeFileId);
    return activeFile?.name ?? "main.tex";
  });
  const activeFilePath = useDocumentStore((s) => {
    const activeFile = s.files.find((f) => f.id === s.activeFileId);
    return activeFile?.relativePath;
  });
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const hasTexFile = useDocumentStore((s) =>
    s.files.some((file) => file.type === "tex"),
  );
  const isCompiling = useDocumentStore((s) => s.isCompiling);
  const compileError = useDocumentStore((s) => s.compileError);
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  const [editors, setEditors] = useState<EditorInfo[]>([]);

  useEffect(() => {
    invoke<EditorInfo[]>("detect_editors")
      .then(setEditors)
      .catch(() => {});
  }, []);

  const openInEditor = useCallback(
    (editorId: string) => {
      if (!projectRoot) return;
      const view = editorView.current;
      const line = view
        ? view.state.doc.lineAt(view.state.selection.main.head).number
        : undefined;
      invoke("open_in_editor", {
        editorId,
        projectPath: projectRoot,
        filePath: activeFilePath,
        line,
      }).catch((err) => console.error("open_in_editor failed:", err));
    },
    [projectRoot, activeFilePath, editorView],
  );

  const insertText = (before: string, after: string = "") => {
    const view = editorView.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: {
        from,
        to,
        insert: before + selectedText + after,
      },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
    });
    view.focus();
  };

  const wrapSelection = (wrapper: string) => {
    insertText(wrapper, wrapper);
  };

  const compileCurrentDocument = () => {
    useHistoryStore.getState().stopReview();
    void requestPreviewCompile(true).catch(() => {});
  };

  const compileOpenDocuments = () => {
    const { openFileIds, activeFileId } = useDocumentStore.getState();
    const ids = openFileIds.length > 0 ? openFileIds : [activeFileId];
    void compileIndependentRoots(ids);
  };

  const zoomIn = () => onImageScaleChange?.(Math.min(4, imageScale + 0.25));
  const zoomOut = () => onImageScaleChange?.(Math.max(0.25, imageScale - 0.25));

  if (fileType === "image") {
    return (
      <OverflowToolbar
        className="h-[calc(var(--workspace-topbar-height)+var(--titlebar-height))] border-border border-b bg-muted/30 px-2 pt-[var(--titlebar-height)]"
        items={[
          {
            id: "name",
            label: fileName,
            sticky: true,
            node: (
              <div className="flex min-w-0 max-w-[10rem] items-center gap-1.5">
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 truncate font-medium text-muted-foreground text-sm"
                  title={activeFilePath ?? fileName}
                >
                  {fileName}
                </span>
              </div>
            ),
          },
          {
            id: "zoom-out",
            label: "Zoom out",
            icon: <MinusIcon className="size-4" />,
            onSelect: zoomOut,
            node: (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={zoomOut}
                disabled={imageScale <= 0.25}
              >
                <MinusIcon className="size-3.5" />
              </Button>
            ),
          },
          {
            id: "zoom-in",
            label: "Zoom in",
            icon: <PlusIcon className="size-4" />,
            onSelect: zoomIn,
            node: (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={zoomIn}
                disabled={imageScale >= 4}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            ),
          },
          {
            id: "zoom",
            label: "Zoom",
            sticky: true,
            node: (
              <Select
                value={imageScale.toString()}
                onValueChange={(v) => onImageScaleChange?.(Number(v))}
              >
                <SelectTrigger size="sm" className="h-6! w-auto text-xs">
                  <SelectValue>{Math.round(imageScale * 100)}%</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ZOOM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          ...(onCropToggle && !fileName.toLowerCase().endsWith(".svg")
            ? [
                {
                  id: "crop",
                  label: "Crop",
                  icon: <CropIcon className="size-4" />,
                  onSelect: onCropToggle,
                  node: (
                    <Button
                      variant={cropMode ? "default" : "ghost"}
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={onCropToggle}
                    >
                      <CropIcon className="size-3.5" />
                      Crop
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        trailing={
          <>
            {editors.length === 1 && (
              <TooltipIconButton
                tooltip={`Open in ${editors[0].name}`}
                onClick={() => openInEditor(editors[0].id)}
                className={getOpenEditorButtonClassName(editors[0])}
              >
                <OpenEditorIcon editor={editors[0]} />
              </TooltipIconButton>
            )}
            {editors.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 p-1"
                    title="Open in Editor"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {editors.map((editor) => (
                    <DropdownMenuItem
                      key={editor.id}
                      onClick={() => openInEditor(editor.id)}
                    >
                      {editor.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
    );
  }

  return (
    <OverflowToolbar
      className="h-[calc(var(--workspace-topbar-height)+var(--titlebar-height))] border-border border-b bg-muted/30 px-2 pt-[var(--titlebar-height)]"
      items={[
        {
          id: "name",
          label: fileName,
          sticky: true,
          node: (
            <div className="flex min-w-0 max-w-[10rem] items-center gap-1.5">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span
                className="min-w-0 truncate font-medium text-muted-foreground text-sm"
                title={activeFilePath ?? fileName}
              >
                {fileName}
              </span>
            </div>
          ),
        },
        {
          id: "bold",
          label: "Bold",
          icon: <BoldIcon className="size-4" />,
          onSelect: () => insertText("\\textbf{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Bold (\\textbf)"
              onClick={() => insertText("\\textbf{", "}")}
            >
              <BoldIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "italic",
          label: "Italic",
          icon: <ItalicIcon className="size-4" />,
          onSelect: () => insertText("\\textit{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Italic (\\textit)"
              onClick={() => insertText("\\textit{", "}")}
            >
              <ItalicIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "code",
          label: "Code",
          icon: <CodeIcon className="size-4" />,
          onSelect: () => insertText("\\texttt{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Code (\\texttt)"
              onClick={() => insertText("\\texttt{", "}")}
            >
              <CodeIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "section",
          label: "Section",
          icon: <Heading1Icon className="size-4" />,
          onSelect: () => insertText("\\section{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Section"
              onClick={() => insertText("\\section{", "}")}
            >
              <Heading1Icon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "subsection",
          label: "Subsection",
          icon: <Heading2Icon className="size-4" />,
          onSelect: () => insertText("\\subsection{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Subsection"
              onClick={() => insertText("\\subsection{", "}")}
            >
              <Heading2Icon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "item",
          label: "List item",
          icon: <ListIcon className="size-4" />,
          onSelect: () => insertText("\\item "),
          node: (
            <TooltipIconButton
              tooltip="List item"
              onClick={() => insertText("\\item ")}
            >
              <ListIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "math-inline",
          label: "Inline math",
          icon: <FunctionSquareIcon className="size-4" />,
          onSelect: () => wrapSelection("$"),
          node: (
            <TooltipIconButton
              tooltip="Inline math ($...$)"
              onClick={() => wrapSelection("$")}
            >
              <FunctionSquareIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "math-display",
          label: "Display math",
          icon: <span className="font-mono text-xs">∫</span>,
          onSelect: () => insertText("\\[\n  ", "\n\\]"),
          node: (
            <TooltipIconButton
              tooltip="Display math (\\[...\\])"
              onClick={() => insertText("\\[\n  ", "\n\\]")}
            >
              <span className="font-mono text-xs">∫</span>
            </TooltipIconButton>
          ),
        },
        {
          id: "cite",
          label: "Citation",
          icon: <BookMarkedIcon className="size-4" />,
          onSelect: () => insertText("\\cite{", "}"),
          node: (
            <TooltipIconButton
              tooltip="Citation (\\cite)"
              onClick={() => insertText("\\cite{", "}")}
            >
              <BookMarkedIcon className="size-4" />
            </TooltipIconButton>
          ),
        },
        {
          id: "wrap",
          label:
            editorWrapMode === "wrap"
              ? "Wrap: soft wrap"
              : `Wrap: guide at column ${editorRulerColumn}`,
          icon:
            editorWrapMode === "wrap" ? (
              <WrapTextIcon className="size-4" />
            ) : (
              <RulerIcon className="size-4" />
            ),
          onSelect: toggleWrapMode,
          node: (
            <TooltipIconButton
              tooltip={
                editorWrapMode === "wrap"
                  ? "Soft wrap (click: no wrap + column guide)"
                  : `No wrap, guide at column ${editorRulerColumn} (click: soft wrap)`
              }
              onClick={toggleWrapMode}
            >
              {editorWrapMode === "wrap" ? (
                <WrapTextIcon className="size-4" />
              ) : (
                <RulerIcon className="size-4" />
              )}
            </TooltipIconButton>
          ),
        },
        {
          id: "vim",
          label: "Vim mode",
          icon: (
            <span className="font-mono font-semibold text-[10px]">VIM</span>
          ),
          onSelect: () => setVimMode(!vimMode),
          node: (
            <Button
              variant={vimMode ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 font-mono text-xs"
              onClick={() => setVimMode(!vimMode)}
              title="Toggle Vim mode"
            >
              VIM
            </Button>
          ),
        },
      ]}
      trailing={
        <>
          <TooltipIconButton
            tooltip={
              isCompiling
                ? "Compiling…"
                : `${compileError ? "Retry compile" : "Compile"} (${isMac ? "⌘S / ⌘↵" : "Ctrl+S / Ctrl+Enter"})`
            }
            onClick={compileCurrentDocument}
            disabled={!hasTexFile}
            className={cn(compileError && !isCompiling && "text-destructive")}
          >
            {isCompiling ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="Compile open documents in parallel"
            onClick={compileOpenDocuments}
          >
            <LayersIcon className="size-4" />
          </TooltipIconButton>
          {editors.length === 1 && (
            <TooltipIconButton
              tooltip={`Open in ${editors[0].name}`}
              onClick={() => openInEditor(editors[0].id)}
              className={getOpenEditorButtonClassName(editors[0])}
            >
              <OpenEditorIcon editor={editors[0]} />
            </TooltipIconButton>
          )}
          {editors.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 p-1"
                  title="Open in Editor"
                >
                  <ExternalLinkIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {editors.map((editor) => (
                  <DropdownMenuItem
                    key={editor.id}
                    onClick={() => openInEditor(editor.id)}
                  >
                    {editor.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    />
  );
}
