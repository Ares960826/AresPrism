/** Report the initial page without mistaking initialization for a user scroll. */
export function observePreviewScroll(
  container: HTMLElement,
  reportPage: () => void,
  onUserScroll: () => void,
  isProgrammatic: () => boolean,
): () => void {
  let frame = 0;
  const report = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(reportPage);
  };
  const handleScroll = () => {
    if (!isProgrammatic()) onUserScroll();
    report();
  };
  container.addEventListener("scroll", handleScroll, { passive: true });
  report();
  return () => {
    container.removeEventListener("scroll", handleScroll);
    cancelAnimationFrame(frame);
  };
}
