import { describe, expect, it } from "vitest";
import {
  createInlineReference,
  expandInlineReferences,
  makeReferenceToken,
  referencesInInput,
  splitByReferenceTokens,
  tokenInsertion,
  tokenRangeForDeletion,
} from "./chat-references";

const ref = createInlineReference(
  "sections/intro.tex",
  12,
  14,
  "\\section{Intro}\nText\n",
);

describe("chat references", () => {
  it("builds a compact token with a line range", () => {
    expect(makeReferenceToken("main.tex", 3, 3)).toBe("⟦main.tex:3⟧");
    expect(ref.token).toBe("⟦sections/intro.tex:12-14⟧");
  });

  it("inserts the token with surrounding spaces and moves the caret past it", () => {
    expect(tokenInsertion("", 0, ref.token)).toEqual({
      value: `${ref.token} `,
      caret: ref.token.length + 1,
    });
    const mid = tokenInsertion("fix this please", 8, ref.token);
    expect(mid.value).toBe(`fix this ${ref.token} please`);
    expect(mid.value.slice(mid.caret)).toBe("please");
    const glued = tokenInsertion("abc", 3, ref.token);
    expect(glued.value).toBe(`abc ${ref.token} `);
  });

  it("expands tokens into fenced blocks and drops removed ones", () => {
    const other = createInlineReference("main.tex", 1, 1, "x");
    const out = expandInlineReferences(`Explain ${ref.token} briefly`, [
      ref,
      other,
    ]);
    expect(out).toBe(
      "Explain\n\nsections/intro.tex (lines 12-14):\n```latex\n\\section{Intro}\nText\n```\n\nbriefly",
    );
    expect(referencesInInput("no tokens", [ref])).toEqual([]);
  });

  it("uses a longer fence when the quoted text contains backticks", () => {
    const code = createInlineReference("a.py", 2, 2, "s = '```'");
    expect(expandInlineReferences(code.token, [code])).toBe(
      "a.py (line 2):\n````python\ns = '```'\n````",
    );
  });

  it("finds the whole token for atomic deletion", () => {
    const input = `see ${ref.token} ok`;
    const start = 4;
    const end = start + ref.token.length;
    expect(tokenRangeForDeletion(input, end, [ref], "backward")).toEqual({
      from: start,
      to: end,
    });
    expect(tokenRangeForDeletion(input, start, [ref], "forward")).toEqual({
      from: start,
      to: end,
    });
    expect(tokenRangeForDeletion(input, start, [ref], "backward")).toBeNull();
    expect(tokenRangeForDeletion(input, end, [ref], "forward")).toBeNull();
  });

  it("splits input into text and token parts for the overlay", () => {
    expect(splitByReferenceTokens(`a ${ref.token} b`, [ref])).toEqual([
      { text: "a ", isToken: false },
      { text: ref.token, isToken: true },
      { text: " b", isToken: false },
    ]);
  });
});

describe("quoted text fidelity", () => {
  it("keeps blank lines and indentation inside the quote unchanged", () => {
    const text = "a\n\n\n\n  b\n";
    const quote = createInlineReference("main.tex", 1, 5, text);
    expect(expandInlineReferences(`x ${quote.token} y`, [quote])).toBe(
      "x\n\nmain.tex (lines 1-5):\n```latex\na\n\n\n\n  b\n```\n\ny",
    );
  });
});
