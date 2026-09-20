import { useDocumentStore } from "@/stores/document-store";

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/\.\//g, "/");
}

/** Open the matching source file and jump to the SyncTeX line/column. */
export function jumpEditorToSynctexSource(
  file: string,
  line: number,
  column: number,
): boolean {
  const state = useDocumentStore.getState();
  const normalizedTarget = normalizePath(file);
  const targetFile =
    state.files.find(
      (item) => normalizePath(item.relativePath) === normalizedTarget,
    ) ??
    state.files.find((item) =>
      normalizedTarget.endsWith(`/${normalizePath(item.relativePath)}`),
    );
  if (!targetFile) return false;

  if (state.activeFileId !== targetFile.id) {
    state.openFileInTab(targetFile.id);
    state.setActiveFile(targetFile.id);
  }

  const fileContent = targetFile.content ?? "";
  const fileLines = fileContent.split("\n");
  const targetLine = Math.max(1, Math.min(line, fileLines.length || 1));
  let offset = 0;
  for (let i = 0; i < targetLine - 1; i++) {
    offset += (fileLines[i]?.length ?? 0) + 1;
  }
  if (column > 0) {
    offset += Math.min(column, fileLines[targetLine - 1]?.length ?? 0);
  }
  state.requestJumpToPosition(offset, targetFile.id);
  return true;
}
