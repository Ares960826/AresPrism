import { describe, expect, it } from "vitest";
import { insertCite, INSERT_LATEX_EVENT } from "@/lib/zotero-local";

describe("insertCite", () => {
  it("dispatches a cite command the editor can insert", () => {
    const seen: string[] = [];
    const handler = (event: Event) => {
      seen.push((event as CustomEvent<string>).detail);
    };
    window.addEventListener(INSERT_LATEX_EVENT, handler);
    insertCite("smith2020deep");
    window.removeEventListener(INSERT_LATEX_EVENT, handler);
    expect(seen).toEqual(["\\cite{smith2020deep}"]);
  });
});
