import { describe, expect, it } from "vitest";
import { previewPanelMinPercent } from "@/lib/preview-panel";

describe("previewPanelMinPercent", () => {
  it("keeps both LaTeX menus visible on a typical window", () => {
    const percent = previewPanelMinPercent(1400, true);
    expect((percent / 100) * 1400).toBeGreaterThanOrEqual(336);
  });

  it("uses a smaller floor when the engine menu is hidden", () => {
    expect(previewPanelMinPercent(1400, false)).toBeLessThan(
      previewPanelMinPercent(1400, true),
    );
  });

  it("raises the percent on a narrow workspace instead of clipping menus", () => {
    expect(previewPanelMinPercent(800, true)).toBeGreaterThan(
      previewPanelMinPercent(1400, true),
    );
  });
});
