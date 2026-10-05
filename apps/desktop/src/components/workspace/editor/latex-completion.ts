import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { latexCompletionSource } from "codemirror-lang-latex";

interface CompletionFile {
  type: string;
  relativePath: string;
  content?: string;
}

const REF_COMMAND =
  /\\(?:ref|eqref|autoref|pageref|nameref|cref|Cref|cpageref|Cpageref|vref|labelcref)\*?\{([^{}]*,)?([^{},]*)$/;
const CITE_COMMAND =
  /\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite|bibentry)\*?(?:\[[^\]]*\]){0,2}\{([^{}]*,)?([^{},]*)$/;
const INPUT_COMMAND = /\\(?:input|include|subfile|includeonly)\{([^{}]*)$/;
const GRAPHICS_COMMAND = /\\includegraphics(?:\[[^\]]*\])?\{([^{}]*)$/;
const BIB_RESOURCE =
  /\\(?:bibliography|addbibresource)(?:\[[^\]]*\])?\{([^{}]*,)?([^{},]*)$/;

const LABEL_PATTERN = /\\label\{([^{}]+)\}/g;
const BIB_KEY_PATTERN =
  /@(?!comment\b|string\b|preamble\b)[a-zA-Z]+\s*[{(]\s*([^,\s{}()]+)\s*,/gi;
const GRAPHIC_EXTENSIONS = /\.(pdf|png|jpe?g|eps|svg)$/i;

export function collectLabels(files: CompletionFile[]): string[] {
  const labels = new Set<string>();
  for (const file of files) {
    if (file.type !== "tex" || !file.content) continue;
    for (const match of file.content.matchAll(LABEL_PATTERN)) {
      labels.add(match[1].trim());
    }
  }
  return [...labels].sort();
}

export function collectCitationKeys(files: CompletionFile[]): string[] {
  const keys = new Set<string>();
  for (const file of files) {
    if (file.type !== "bib" || !file.content) continue;
    for (const match of file.content.matchAll(BIB_KEY_PATTERN)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

/** Completions that need the project: \ref labels, \cite keys, file paths. */
export function projectCompletionSource(
  getFiles: () => CompletionFile[],
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    const ref = REF_COMMAND.exec(before);
    if (ref) {
      return {
        from: context.pos - ref[2].length,
        options: collectLabels(getFiles()).map((label) => ({
          label,
          type: "variable",
          detail: "label",
        })),
        validFor: /^[^{},]*$/,
      };
    }

    const cite = CITE_COMMAND.exec(before);
    if (cite) {
      return {
        from: context.pos - cite[2].length,
        options: collectCitationKeys(getFiles()).map((key) => ({
          label: key,
          type: "constant",
          detail: "bib",
        })),
        validFor: /^[^{},]*$/,
      };
    }

    const input = INPUT_COMMAND.exec(before);
    if (input) {
      return {
        from: context.pos - input[1].length,
        options: getFiles()
          .filter((file) => file.type === "tex")
          .map<Completion>((file) => ({
            label: file.relativePath.replace(/\.tex$/i, ""),
            type: "text",
            detail: "tex",
          })),
        validFor: /^[^{}]*$/,
      };
    }

    const graphics = GRAPHICS_COMMAND.exec(before);
    if (graphics) {
      return {
        from: context.pos - graphics[1].length,
        options: getFiles()
          .filter(
            (file) =>
              file.type === "image" ||
              (file.type === "pdf" &&
                GRAPHIC_EXTENSIONS.test(file.relativePath)),
          )
          .map<Completion>((file) => ({
            label: file.relativePath,
            type: "text",
            detail: "figure",
          })),
        validFor: /^[^{}]*$/,
      };
    }

    const bib = BIB_RESOURCE.exec(before);
    if (bib) {
      return {
        from: context.pos - bib[2].length,
        options: getFiles()
          .filter((file) => file.type === "bib")
          .map<Completion>((file) => ({
            label: before.includes("\\bibliography{")
              ? file.relativePath.replace(/\.bib$/i, "")
              : file.relativePath,
            type: "text",
            detail: "bib",
          })),
        validFor: /^[^{},]*$/,
      };
    }

    return null;
  };
}

/** Tab accepts the open completion; otherwise it indents as before. */
export const tabCompletionKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) =>
        completionStatus(view.state) === "active"
          ? acceptCompletion(view)
          : false,
    },
  ]),
);

export function latexAutocompletion(
  getFiles: () => CompletionFile[],
): Extension {
  return [
    tabCompletionKeymap,
    autocompletion({
      override: [
        latexCompletionSource(true),
        projectCompletionSource(getFiles),
      ],
      activateOnTyping: true,
      icons: true,
    }),
  ];
}
