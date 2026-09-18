/** Keep TeXLive / Tectonic / latexmk fully readable. */
export const PREVIEW_COMPILER_MIN_PX = 220;
/** Compiler + engine dropdowns + trailing chrome (float / history / ⋯). */
export const PREVIEW_COMPILER_ENGINE_MIN_PX = 336;

/** Preview pane minSize as a percent of the workspace, so the two LaTeX menus stay fully visible. */
export function previewPanelMinPercent(
  workspaceWidth: number,
  showEngine: boolean,
): number {
  const minPx = showEngine
    ? PREVIEW_COMPILER_ENGINE_MIN_PX
    : PREVIEW_COMPILER_MIN_PX;
  if (!Number.isFinite(workspaceWidth) || workspaceWidth <= 0) return 22;
  return Math.min(48, Math.max(14, (minPx / workspaceWidth) * 100));
}
