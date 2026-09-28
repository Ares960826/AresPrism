/** Page offset in scroll-container pixels, including nested positioned wrappers and UI zoom. */
export function pdfPageScrollTop(
  container: HTMLElement,
  page: HTMLElement,
): number {
  const containerRect = container.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  const zoom =
    container.offsetHeight > 0
      ? containerRect.height / container.offsetHeight
      : 1;
  return (
    container.scrollTop +
    (pageRect.top - containerRect.top) / (zoom || 1) -
    container.clientTop
  );
}
