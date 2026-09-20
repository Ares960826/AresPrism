/** Independent OS windows for Preview / AI. Query `?pane=` selects the child UI. */

export type DetachedPane = "preview" | "chat";

export const PREVIEW_PANE_LABEL = "preview-pane";
export const CHAT_PANE_LABEL = "chat-pane";

export const PANE_EVENTS = {
  closed: "ares-pane:closed",
  hello: "ares-pane:hello",
  previewState: "ares-pane:preview-state",
  compile: "ares-pane:compile",
  synctexJump: "ares-pane:synctex-jump",
  synctexView: "ares-pane:synctex-view",
  chatState: "ares-pane:chat-state",
  chatCall: "ares-pane:chat-call",
} as const;

export const CHAT_RELAY_ACTIONS = [
  "sendPrompt",
  "cancelExecution",
  "createTab",
  "closeTab",
  "setActiveTab",
  "saveDraft",
  "setSelectedModel",
  "setSelectedProviderCredentialId",
  "setSelectedProviderModel",
  "setEffortLevel",
  "newSession",
  "resumeSession",
  "clearMessages",
  "queueGuidance",
  "removeQueuedGuidance",
  "forceQueuedGuidanceNow",
  "consumePendingAttachments",
  "consumePendingPinnedContextRemovals",
  "_setError",
  "_setSessionTitle",
] as const;

export type ChatRelayAction = (typeof CHAT_RELAY_ACTIONS)[number];

export function parseDetachedPane(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): DetachedPane | null {
  const value = new URLSearchParams(search).get("pane");
  if (value === "preview" || value === "chat") return value;
  return null;
}

export function paneWindowLabel(pane: DetachedPane): string {
  return pane === "chat" ? CHAT_PANE_LABEL : PREVIEW_PANE_LABEL;
}

/** Match `latex.rs` `jobname_from_main_file`. */
export function jobnameFromMainFile(mainFile: string): string {
  const stem = fileStem(mainFile);
  const safe = Array.from(stem, (char) =>
    /[A-Za-z0-9_-]/.test(char) ? char : "_",
  ).join("");
  return safe.length === 0 ? "document" : safe;
}

export function fileStem(mainFile: string): string {
  const base = mainFile.replace(/\\/g, "/").split("/").pop() || "document";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.length === 0 ? "document" : stem;
}

/** `<project>/.prism/build/<jobname>/<stem>.pdf` — same layout as `latex.rs`. */
export function compiledPdfAbsolutePath(
  projectRoot: string,
  mainFile: string,
): string {
  const root = projectRoot.replace(/[/\\]+$/, "");
  const job = jobnameFromMainFile(mainFile);
  const stem = fileStem(mainFile);
  return `${root}/.prism/build/${job}/${stem}.pdf`;
}

export interface PreviewFileSnapshot {
  id: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  type: string;
  content?: string;
}

export interface PreviewPaneSnapshot {
  projectRoot: string | null;
  files: PreviewFileSnapshot[];
  activeFileId: string;
  openFileIds: string[];
  pdfRootId: string | null;
  pdfRevision: number;
  compileError: string | null;
  isCompiling: boolean;
}

export interface SynctexJumpPayload {
  file: string;
  line: number;
  column: number;
}

export interface ChatCallPayload {
  name: ChatRelayAction;
  args: unknown[];
}
