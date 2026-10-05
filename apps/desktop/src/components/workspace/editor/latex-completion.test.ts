import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  collectCitationKeys,
  collectLabels,
  projectCompletionSource,
} from "./latex-completion";

const files = [
  {
    type: "tex",
    relativePath: "main.tex",
    content:
      "\\section{A}\\label{sec:a}\n\\begin{equation}\\label{eq:1}\\end{equation}",
  },
  { type: "tex", relativePath: "chapters/b.tex", content: "\\label{sec:b}" },
  {
    type: "bib",
    relativePath: "refs.bib",
    content:
      '@article{smith2020,\n title={X}}\n@Book{doe_book, title={Y}}\n@string{foo = "bar"}',
  },
  { type: "image", relativePath: "figures/plot.png" },
];

function complete(doc: string) {
  const state = EditorState.create({ doc });
  const source = projectCompletionSource(() => files);
  const result = source(new CompletionContext(state, doc.length, false));
  if (!result || result instanceof Promise) return null;
  return {
    from: result.from,
    labels: result.options.map((option) => option.label),
  };
}

describe("latex project completions", () => {
  it("collects labels and bib keys", () => {
    expect(collectLabels(files)).toEqual(["eq:1", "sec:a", "sec:b"]);
    expect(collectCitationKeys(files)).toEqual(["doe_book", "smith2020"]);
  });

  it("completes labels inside \\ref-like commands", () => {
    expect(complete("see \\ref{se")).toEqual({
      from: 9,
      labels: ["eq:1", "sec:a", "sec:b"],
    });
    expect(complete("\\cref{eq:1,")?.labels).toContain("sec:a");
  });

  it("completes citation keys after \\cite variants with options", () => {
    expect(complete("\\citep[p.~3]{sm")?.labels).toEqual([
      "doe_book",
      "smith2020",
    ]);
    expect(complete("\\parencite{a,")?.from).toBe("\\parencite{a,".length);
  });

  it("completes input files and figures", () => {
    expect(complete("\\input{chap")?.labels).toEqual(["main", "chapters/b"]);
    expect(complete("\\includegraphics[width=3cm]{fig")?.labels).toEqual([
      "figures/plot.png",
    ]);
  });

  it("stays quiet outside those arguments", () => {
    expect(complete("plain text")).toBeNull();
    expect(complete("\\ref{done} more")).toBeNull();
  });
});
