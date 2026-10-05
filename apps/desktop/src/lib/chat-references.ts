/** Code or text quoted from the editor into the chat input as one block. */
export interface InlineReference {
  /** Placeholder text kept in the input, e.g. `⟦main.tex:12-18⟧`. */
  token: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}

const OPEN = "⟦";
const CLOSE = "⟧";

export function makeReferenceToken(
  filePath: string,
  startLine: number,
  endLine: number,
): string {
  const lines =
    startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  return `${OPEN}${filePath}:${lines}${CLOSE}`;
}

export function createInlineReference(
  filePath: string,
  startLine: number,
  endLine: number,
  text: string,
): InlineReference {
  return {
    token: makeReferenceToken(filePath, startLine, endLine),
    filePath,
    startLine,
    endLine,
    text,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fenceLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "bib") return "bibtex";
  if (ext === "tex" || ext === "sty" || ext === "cls") return "latex";
  if (ext === "py") return "python";
  return ext ?? "";
}

function fenceFor(text: string): string {
  let fence = "```";
  while (text.includes(fence)) fence += "`";
  return fence;
}

/** Text to insert at the caret: the token, separated from neighbouring words. */
export function tokenInsertion(
  input: string,
  caret: number,
  token: string,
): { value: string; caret: number } {
  const before = input.slice(0, caret);
  const after = input.slice(caret);
  const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const trail = /^\s/.test(after) ? "" : " ";
  const value = `${before}${lead}${token}${trail}${after}`;
  // Leave the caret after the separating whitespace, ready to keep typing.
  return { value, caret: before.length + lead.length + token.length + 1 };
}

/** References whose token is still present in the input, in input order. */
export function referencesInInput(
  input: string,
  references: InlineReference[],
): InlineReference[] {
  return references
    .filter((ref) => input.includes(ref.token))
    .sort((a, b) => input.indexOf(a.token) - input.indexOf(b.token));
}

/** Replace each token with the quoted block it stands for. */
export function expandInlineReferences(
  input: string,
  references: InlineReference[],
): string {
  const quoted = referencesInInput(input, references);
  if (quoted.length === 0) return input.trim();
  // Only the seams between prose and blocks are normalized; the quoted text
  // itself is passed through byte for byte so agents can match it in edits.
  let output = "";
  let afterBlock = false;
  for (const part of splitByReferenceTokens(input, quoted)) {
    if (!part.isToken) {
      output += afterBlock ? part.text.replace(/^\s+/, "") : part.text;
      afterBlock = false;
      continue;
    }
    const ref = quoted.find((item) => item.token === part.text)!;
    const fence = fenceFor(ref.text);
    const lines =
      ref.startLine === ref.endLine
        ? `line ${ref.startLine}`
        : `lines ${ref.startLine}-${ref.endLine}`;
    const block = `${ref.filePath} (${lines}):\n${fence}${fenceLanguage(ref.filePath)}\n${ref.text.replace(/\n$/, "")}\n${fence}`;
    output = output.replace(/\s+$/, "");
    output += `${output ? "\n\n" : ""}${block}\n\n`;
    afterBlock = true;
  }
  return output.replace(/^\s+/, "").replace(/\s+$/, "");
}

/** The token range the caret is inside or touching, for atomic deletion. */
export function tokenRangeForDeletion(
  input: string,
  caret: number,
  references: InlineReference[],
  direction: "backward" | "forward",
): { from: number; to: number } | null {
  for (const ref of references) {
    let index = input.indexOf(ref.token);
    while (index !== -1) {
      const end = index + ref.token.length;
      const hit =
        direction === "backward"
          ? caret > index && caret <= end
          : caret >= index && caret < end;
      if (hit) return { from: index, to: end };
      index = input.indexOf(ref.token, end);
    }
  }
  return null;
}

/** Split the input so tokens can be drawn as blocks behind the textarea. */
export function splitByReferenceTokens(
  input: string,
  references: InlineReference[],
): { text: string; isToken: boolean }[] {
  const tokens = references.map((ref) => ref.token).filter(Boolean);
  if (tokens.length === 0) return [{ text: input, isToken: false }];
  const escaped = tokens.map(escapeRegExp);
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  return input
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, isToken: tokens.includes(part) }));
}
