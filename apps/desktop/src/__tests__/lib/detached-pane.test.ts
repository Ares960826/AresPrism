import { describe, expect, it } from "vitest";
import {
  compiledPdfAbsolutePath,
  fileStem,
  jobnameFromMainFile,
  paneWindowLabel,
  parseDetachedPane,
} from "@/lib/detached-pane";

describe("parseDetachedPane", () => {
  it("reads preview and chat from the query string", () => {
    expect(parseDetachedPane("?pane=preview")).toBe("preview");
    expect(parseDetachedPane("?pane=chat&x=1")).toBe("chat");
  });

  it("ignores unknown or missing pane values", () => {
    expect(parseDetachedPane("")).toBeNull();
    expect(parseDetachedPane("?debug=1")).toBeNull();
    expect(parseDetachedPane("?pane=debug")).toBeNull();
  });
});

describe("paneWindowLabel", () => {
  it("uses stable Tauri window labels", () => {
    expect(paneWindowLabel("preview")).toBe("preview-pane");
    expect(paneWindowLabel("chat")).toBe("chat-pane");
  });
});

describe("compiled PDF path", () => {
  it("matches latex.rs jobname sanitizing", () => {
    expect(jobnameFromMainFile("main.tex")).toBe("main");
    expect(jobnameFromMainFile("sections/intro.tex")).toBe("intro");
    expect(jobnameFromMainFile("my paper.tex")).toBe("my_paper");
    expect(fileStem("my paper.tex")).toBe("my paper");
  });

  it("puts the PDF under .prism/build/<job>/<stem>.pdf", () => {
    expect(compiledPdfAbsolutePath("/paper/", "main.tex")).toBe(
      "/paper/.prism/build/main/main.pdf",
    );
    expect(compiledPdfAbsolutePath("/paper", "supplement.tex")).toBe(
      "/paper/.prism/build/supplement/supplement.pdf",
    );
    expect(compiledPdfAbsolutePath("/paper", "my paper.tex")).toBe(
      "/paper/.prism/build/my_paper/my paper.pdf",
    );
  });
});
