export const CITATION_EXTENSIONS = [
  ".bib",
  ".bibtex",
  ".json",
  ".ris",
  ".enw",
] as const;

export type CitationFormat = "bibtex" | "csljson" | "ris" | "endnote";

export function isCitationFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return CITATION_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function citationFormatForFile(name: string): CitationFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "csljson";
  if (lower.endsWith(".ris")) return "ris";
  if (lower.endsWith(".enw")) return "endnote";
  return "bibtex";
}

function bibtexEntries(content: string): { key: string; body: string }[] {
  const parts = content.split(/\n(?=@)/);
  const out: { key: string; body: string }[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/@(\w+)\{([^,\s]+)/);
    if (match) out.push({ key: match[2], body: trimmed });
  }
  return out;
}

function field(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`${name}\\s*=\\s*\\{([^}]*)\\}`, "i"));
  return match?.[1]?.trim();
}

export function convertCitation(
  content: string,
  format: CitationFormat,
): string {
  if (format === "bibtex")
    return content.endsWith("\n") ? content : `${content}\n`;
  const entries = bibtexEntries(content);
  if (format === "ris") {
    return entries
      .map((entry) => {
        const ty = /@article/i.test(entry.body) ? "JOUR" : "GEN";
        const lines = [
          `TY  - ${ty}`,
          `ID  - ${entry.key}`,
          field(entry.body, "title") && `TI  - ${field(entry.body, "title")}`,
          field(entry.body, "author") && `AU  - ${field(entry.body, "author")}`,
          field(entry.body, "year") && `PY  - ${field(entry.body, "year")}`,
          field(entry.body, "journal") &&
            `JO  - ${field(entry.body, "journal")}`,
          field(entry.body, "doi") && `DO  - ${field(entry.body, "doi")}`,
          "ER  - ",
        ].filter(Boolean);
        return `${lines.join("\n")}\n`;
      })
      .join("\n");
  }
  if (format === "endnote") {
    return entries
      .map((entry) => {
        const lines = [
          `%0 Journal Article`,
          `%F ${entry.key}`,
          field(entry.body, "title") && `%T ${field(entry.body, "title")}`,
          field(entry.body, "author") && `%A ${field(entry.body, "author")}`,
          field(entry.body, "year") && `%D ${field(entry.body, "year")}`,
        ].filter(Boolean);
        return `${lines.join("\n")}\n`;
      })
      .join("\n");
  }
  const csl = entries.map((entry) => ({
    id: entry.key,
    type: "article-journal",
    title: field(entry.body, "title") ?? entry.key,
    author: (field(entry.body, "author") ?? "")
      .split(/\s+and\s+/i)
      .filter(Boolean)
      .map((name) => {
        const [family, given] = name.split(",").map((s) => s.trim());
        return given ? { family, given } : { family: name };
      }),
    issued: field(entry.body, "year")
      ? { "date-parts": [[Number(field(entry.body, "year"))]] }
      : undefined,
    DOI: field(entry.body, "doi"),
    URL: field(entry.body, "url"),
  }));
  return `${JSON.stringify(csl, null, 2)}\n`;
}
