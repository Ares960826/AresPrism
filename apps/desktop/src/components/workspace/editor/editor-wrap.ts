import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { EditorWrapMode } from "@/stores/settings-store";

/** CodeMirror's default `.cm-line` left padding, plus `.cm-content` padding. */
const TEXT_INSET_PX = 6 + 8;

/** Soft wrap at the pane edge, or keep source lines intact and draw a guide
 *  at a fixed column (the classic "print margin" of code editors). */
export function editorWrapExtension(
  mode: EditorWrapMode,
  column: number,
): Extension {
  if (mode === "wrap") return EditorView.lineWrapping;
  const at = `calc(${column}ch + ${TEXT_INSET_PX}px)`;
  const end = `calc(${column}ch + ${TEXT_INSET_PX + 1}px)`;
  return EditorView.theme({
    ".cm-content": {
      backgroundImage: `linear-gradient(to right, transparent ${at}, var(--border) ${at}, var(--border) ${end}, transparent ${end})`,
      backgroundRepeat: "no-repeat",
    },
  });
}
