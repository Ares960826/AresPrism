import { describe, expect, it } from "vitest";
import {
  mergePreviewSnapshot,
  type PreviewPaneSnapshot,
} from "./detached-pane";
const initial: PreviewPaneSnapshot = {
  projectRoot: "/test",
  files: [
    {
      id: "a",
      name: "a",
      relativePath: "a",
      absolutePath: "/test/a",
      type: "tex",
      content: "old",
    },
    {
      id: "b",
      name: "b",
      relativePath: "b",
      absolutePath: "/test/b",
      type: "tex",
      content: "keep",
    },
  ],
  activeFileId: "a",
  openFileIds: ["a"],
  pdfRootId: "a",
  pdfRevision: 1,
  compileError: null,
  isCompiling: false,
};
describe("detached pane deltas", () => {
  it("merges changed files without dropping unchanged content", () => {
    const next = mergePreviewSnapshot(initial, {
      ...initial,
      full: false,
      files: [{ ...initial.files[0], content: "new" }],
    });
    expect(next.files[0].content).toBe("new");
    expect(next.files[1]).toBe(initial.files[1]);
  });
  it("applies removals and replaces state on project changes", () => {
    expect(
      mergePreviewSnapshot(initial, {
        ...initial,
        full: false,
        files: [],
        removedFileIds: ["a"],
      }).files.map((file) => file.id),
    ).toEqual(["b"]);
    expect(
      mergePreviewSnapshot(initial, {
        ...initial,
        projectRoot: "/other",
        full: false,
        files: [],
      }).files,
    ).toEqual([]);
  });
});
