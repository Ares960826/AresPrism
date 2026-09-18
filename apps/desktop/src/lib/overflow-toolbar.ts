export interface OverflowMeasureItem {
  id: string;
  sticky?: boolean;
  width: number;
}

/** Hide non-sticky items from the right until the rest fit, reserving room for ⋯. */
export function overflowingItemIds(
  items: OverflowMeasureItem[],
  availableWidth: number,
  moreWidth: number,
  gap = 0,
): string[] {
  if (availableWidth <= 0) {
    return items.filter((item) => !item.sticky).map((item) => item.id);
  }

  const stickyWidth = items
    .filter((item) => item.sticky)
    .reduce((sum, item) => sum + item.width + gap, 0);
  const flexible = items.filter((item) => !item.sticky);
  const flexibleWidth = flexible.reduce(
    (sum, item) => sum + item.width + gap,
    0,
  );
  const spaceForFlexible = availableWidth - stickyWidth;
  if (flexibleWidth <= spaceForFlexible) return [];

  let remaining = spaceForFlexible - moreWidth - gap;
  const hidden: string[] = [];
  for (const item of flexible) {
    if (hidden.length === 0 && item.width + gap <= remaining) {
      remaining -= item.width + gap;
    } else {
      hidden.push(item.id);
    }
  }
  return hidden;
}
