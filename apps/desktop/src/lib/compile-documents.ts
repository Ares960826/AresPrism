import { isCitationFileName } from "@/lib/citation-file";

interface TexLikeFile {
  type: string;
  name: string;
  relativePath: string;
  content?: string;
}

export interface CompileDocument {
  mainFile: string;
  /** Empty string means no citation file is paired. */
  citationFile: string;
}

export function isLikelyMainTex(file: TexLikeFile): boolean {
  if (file.type !== "tex") return false;
  const content = file.content ?? "";
  if (/\\documentclass[\s{[]/.test(content)) return true;
  return file.name === "main.tex" || file.name === "document.tex";
}

export function inferCompileDocuments(
  files: TexLikeFile[],
  fallbackBib = "",
): CompileDocument[] {
  const bib =
    files.find((file) => isCitationFileName(file.name))?.relativePath ??
    fallbackBib;
  const mains = files.filter(isLikelyMainTex);
  if (mains.length === 0) {
    const anyTex = files.find((file) => file.type === "tex");
    if (!anyTex) return [];
    return [{ mainFile: anyTex.relativePath, citationFile: bib }];
  }
  return mains.map((file) => ({
    mainFile: file.relativePath,
    citationFile: bib,
  }));
}

export function citationFileForMain(
  documents: CompileDocument[],
  mainFile: string | null,
  fallback = "",
): string {
  if (!mainFile) return documents[0]?.citationFile || fallback;
  const match = documents.find((doc) => doc.mainFile === mainFile);
  if (match) return match.citationFile;
  return documents[0]?.citationFile || fallback;
}
