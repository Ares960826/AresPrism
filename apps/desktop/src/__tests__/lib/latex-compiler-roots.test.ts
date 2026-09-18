import { describe, expect, it } from "vitest";
import { independentCompileRoots } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/stores/document-store";

function tex(relativePath: string, content: string): ProjectFile {
  return {
    id: relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    relativePath,
    absolutePath: `/project/${relativePath}`,
    type: "tex",
    content,
    isDirty: false,
  };
}

describe("independentCompileRoots", () => {
  it("keeps two documentclass files as separate compile roots", () => {
    const files = [
      tex(
        "main.tex",
        "\\documentclass{article}\\begin{document}A\\end{document}",
      ),
      tex(
        "supplement.tex",
        "\\documentclass{article}\\begin{document}B\\end{document}",
      ),
      tex("ch1.tex", "\\section{Chapter} included by main"),
    ];
    const roots = independentCompileRoots(
      ["main.tex", "supplement.tex", "ch1.tex"],
      files,
    );
    expect(roots.map((item) => item.rootId)).toEqual([
      "main.tex",
      "supplement.tex",
    ]);
  });
});
