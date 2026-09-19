/** Match latex.rs jobname_from_main_file so Home can find built PDFs. */
export function jobnameFromMainFile(mainFile: string): string {
  const base = mainFile.split(/[/\\]/).pop() ?? "document";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base) || "document";
  const safe = stem.replace(/[^A-Za-z0-9_-]/g, "_");
  return safe || "document";
}

/** Relative PDF paths to try for Home gallery/list thumbnails. */
export function previewPdfCandidates(mains: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  for (const main of mains) {
    const posix = main.replace(/\\/g, "/");
    const job = jobnameFromMainFile(posix);
    const slash = posix.lastIndexOf("/");
    const dir = slash >= 0 ? posix.slice(0, slash) : "";
    push(`.prism/build/${job}/${job}.pdf`);
    push(`.prism/build/${job}.pdf`);
    if (dir) push(`${dir}/${job}.pdf`);
    push(`${job}.pdf`);
  }

  push(".prism/build/main/main.pdf");
  push(".prism/build/main.pdf");
  push("main.pdf");
  push("document.pdf");
  return out;
}
