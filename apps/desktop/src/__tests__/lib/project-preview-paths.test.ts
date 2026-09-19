import { describe, expect, it } from "vitest";
import {
  jobnameFromMainFile,
  previewPdfCandidates,
} from "@/lib/project-preview-paths";

describe("preview PDF paths", () => {
  it("uses the TeX stem as the build jobname", () => {
    expect(jobnameFromMainFile("General-2026-09-17_v02-en.tex")).toBe(
      "General-2026-09-17_v02-en",
    );
    expect(jobnameFromMainFile("chapters/main file.tex")).toBe("main_file");
  });

  it("looks in per-root .prism/build/<job>/ before legacy main.pdf", () => {
    const paths = previewPdfCandidates(["en.tex", "zh.tex"]);
    expect(paths[0]).toBe(".prism/build/en/en.pdf");
    expect(paths).toContain(".prism/build/zh/zh.pdf");
    expect(paths).toContain("en.pdf");
    expect(paths[paths.length - 1]).toBe("document.pdf");
  });
});
