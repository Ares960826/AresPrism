import { describe, expect, it } from "vitest";
import {
  citationFormatForFile,
  convertCitation,
  isCitationFileName,
} from "@/lib/citation-file";

describe("citation files", () => {
  it("accepts bibliography extensions and rejects txt", () => {
    expect(isCitationFileName("ref.bib")).toBe(true);
    expect(isCitationFileName("lib.json")).toBe(true);
    expect(isCitationFileName("notes.txt")).toBe(false);
    expect(isCitationFileName("paper.tex")).toBe(false);
  });

  it("maps extensions to formats", () => {
    expect(citationFormatForFile("a.bib")).toBe("bibtex");
    expect(citationFormatForFile("a.ris")).toBe("ris");
    expect(citationFormatForFile("a.json")).toBe("csljson");
  });

  it("converts a bibtex entry to RIS", () => {
    const ris = convertCitation(
      `@article{smith2020,\n  title = {Hello},\n  author = {Smith, Jane},\n  year = {2020},\n}\n`,
      "ris",
    );
    expect(ris).toContain("TY  - JOUR");
    expect(ris).toContain("ID  - smith2020");
    expect(ris).toContain("TI  - Hello");
  });
});
