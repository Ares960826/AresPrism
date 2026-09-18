import { describe, expect, it } from "vitest";
import {
  citationFileForMain,
  inferCompileDocuments,
} from "@/lib/compile-documents";
function tex(path: string, content: string) {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    relativePath: path,
    absolutePath: `/p/${path}`,
    type: "tex",
    content,
    isDirty: false,
  };
}

describe("compile documents", () => {
  it("pairs each documentclass file with the default bib", () => {
    const files = [
      tex(
        "en.tex",
        "\\documentclass{article}\\begin{document}A\\end{document}",
      ),
      tex(
        "zh.tex",
        "\\documentclass{article}\\begin{document}B\\end{document}",
      ),
      {
        ...tex("ch.tex", "\\section{Chapter}"),
      },
    ];
    const docs = inferCompileDocuments(files, "refs.bib");
    expect(docs).toEqual([
      { mainFile: "en.tex", citationFile: "refs.bib" },
      { mainFile: "zh.tex", citationFile: "refs.bib" },
    ]);
  });

  it("resolves the bib for the active main file", () => {
    const docs = [
      { mainFile: "en.tex", citationFile: "en.bib" },
      { mainFile: "zh.tex", citationFile: "zh.bib" },
    ];
    expect(citationFileForMain(docs, "zh.tex")).toBe("zh.bib");
    expect(citationFileForMain(docs, "other.tex")).toBe("en.bib");
  });

  it("keeps citation files optional", () => {
    const files = [
      tex(
        "paper.tex",
        "\\documentclass{article}\\begin{document}A\\end{document}",
      ),
    ];
    expect(inferCompileDocuments(files)).toEqual([
      { mainFile: "paper.tex", citationFile: "" },
    ]);
    expect(
      citationFileForMain(
        [{ mainFile: "paper.tex", citationFile: "" }],
        "paper.tex",
      ),
    ).toBe("");
  });
});
