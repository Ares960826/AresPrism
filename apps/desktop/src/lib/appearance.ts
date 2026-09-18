export type UiFontId = "geist" | "system" | "songti" | "yuanti";
export type EditorFontId =
  | "system-mono"
  | "geist-mono"
  | "jetbrains"
  | "fira"
  | "source-code"
  | "sarasa"
  | "lxgw";

const CJK_SANS = `"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei"`;
const CJK_SERIF = `"Songti SC", "Noto Serif SC", "STSong"`;

export const UI_FONT_OPTIONS: { id: UiFontId; label: string; stack: string }[] =
  [
    {
      id: "geist",
      label: "Geist (default)",
      stack: `"Geist", system-ui, ${CJK_SANS}, sans-serif`,
    },
    {
      id: "system",
      label: "System UI",
      stack: `ui-sans-serif, system-ui, ${CJK_SANS}, sans-serif`,
    },
    {
      id: "songti",
      label: "Songti / Serif",
      stack: `${CJK_SERIF}, ui-serif, "Times New Roman", serif`,
    },
    {
      id: "yuanti",
      label: "Yuanti / Rounded",
      stack: `"Yuanti SC", "PingFang SC", ui-rounded, system-ui, sans-serif`,
    },
  ];

export const EDITOR_FONT_OPTIONS: {
  id: EditorFontId;
  label: string;
  stack: string;
}[] = [
  {
    id: "system-mono",
    label: "System Mono",
    stack: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ${CJK_SANS}, monospace`,
  },
  {
    id: "geist-mono",
    label: "Geist Mono",
    stack: `"Geist Mono", ui-monospace, ${CJK_SANS}, monospace`,
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: `"JetBrains Mono", ui-monospace, ${CJK_SANS}, monospace`,
  },
  {
    id: "fira",
    label: "Fira Code",
    stack: `"Fira Code", ui-monospace, ${CJK_SANS}, monospace`,
  },
  {
    id: "source-code",
    label: "Source Code Pro",
    stack: `"Source Code Pro", ui-monospace, ${CJK_SANS}, monospace`,
  },
  {
    id: "sarasa",
    label: "Sarasa Mono SC",
    stack: `"Sarasa Mono SC", "Sarasa Gothic SC", ui-monospace, ${CJK_SANS}, monospace`,
  },
  {
    id: "lxgw",
    label: "LXGW WenKai Mono",
    stack: `"LXGW WenKai Mono", "LXGW WenKai", ui-monospace, ${CJK_SANS}, monospace`,
  },
];

export function uiFontStack(id: UiFontId): string {
  return (
    UI_FONT_OPTIONS.find((item) => item.id === id)?.stack ??
    UI_FONT_OPTIONS[0].stack
  );
}

export function editorFontStack(id: EditorFontId): string {
  return (
    EDITOR_FONT_OPTIONS.find((item) => item.id === id)?.stack ??
    EDITOR_FONT_OPTIONS[0].stack
  );
}

export function applyAppearance(opts: {
  uiFont: UiFontId;
  editorFont: EditorFontId;
  uiFontSize: number;
  editorFontSize: number;
}): void {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", uiFontStack(opts.uiFont));
  root.style.setProperty("--font-mono", editorFontStack(opts.editorFont));
  root.style.setProperty("--app-font-size", `${opts.uiFontSize}px`);
  root.style.setProperty(
    "--editor-font-family",
    editorFontStack(opts.editorFont),
  );
  root.style.setProperty("--editor-font-size", `${opts.editorFontSize}px`);
}
