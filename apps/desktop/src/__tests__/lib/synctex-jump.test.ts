import { beforeEach, describe, expect, it } from "vitest";
import { jumpEditorToSynctexSource } from "@/lib/synctex-jump";
import { useDocumentStore } from "@/stores/document-store";

describe("jumpEditorToSynctexSource", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      files: [
        {
          id: "sections/intro.tex",
          name: "intro.tex",
          relativePath: "sections/intro.tex",
          absolutePath: "/paper/sections/intro.tex",
          type: "tex",
          content: "aaa\nbbb\nccc",
          isDirty: false,
        },
      ],
      activeFileId: "sections/intro.tex",
      openFileIds: ["sections/intro.tex"],
      jumpToPosition: null,
      jumpToFileId: null,
    });
  });

  it("jumps to the line/column offset in the matching source file", () => {
    expect(jumpEditorToSynctexSource("sections/intro.tex", 2, 2)).toBe(true);
    const state = useDocumentStore.getState();
    expect(state.jumpToFileId).toBe("sections/intro.tex");
    expect(state.jumpToPosition).toBe(6);
  });

  it("returns false when the source file is unknown", () => {
    expect(jumpEditorToSynctexSource("missing.tex", 1, 1)).toBe(false);
  });
});
