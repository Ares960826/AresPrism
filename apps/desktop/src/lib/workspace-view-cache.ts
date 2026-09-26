/** Small view-state caches, independent of UI modules and document contents. */
export const editorStateCache = new Map<
  string,
  { cursor: number; scrollTop: number }
>();
export const scrollPositionCache = new Map<string, number>();
export const zoomCache = new Map<
  string,
  { scale: number; fitMode: "fit-width" | "fit-height" | null }
>();
export const clearEditorStateCache = () => editorStateCache.clear();
export const clearScrollPositionCache = () => scrollPositionCache.clear();
export const clearZoomCache = () => zoomCache.clear();
