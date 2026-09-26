import { FileIcon } from "lucide-react";

const formats: Record<string, [string, string]> = {
  tex: ["TeX", "#3182ce"],
  bib: ["B", "#a16207"],
  sty: ["ST", "#7c3aed"],
  cls: ["CL", "#7c3aed"],
  pdf: ["PDF", "#dc2626"],
  py: ["Py", "#3776ab"],
  ipynb: ["NB", "#f37726"],
  json: ["{}", "#b7791f"],
  yaml: ["Y", "#c2410c"],
  yml: ["Y", "#c2410c"],
  toml: ["T", "#9a3412"],
  xml: ["<>", "#c2410c"],
  md: ["M↓", "#64748b"],
  txt: ["TXT", "#64748b"],
  csv: ["CSV", "#15803d"],
  tsv: ["TSV", "#15803d"],
  js: ["JS", "#a16207"],
  ts: ["TS", "#3178c6"],
  tsx: ["TS", "#3178c6"],
  sh: [">_", "#15803d"],
  png: ["IMG", "#059669"],
  jpg: ["IMG", "#059669"],
  jpeg: ["IMG", "#059669"],
  svg: ["SVG", "#059669"],
  eps: ["EPS", "#059669"],
  zip: ["ZIP", "#a16207"],
};

/** Compact format glyphs inspired by IDE file trees; original artwork. */
export function FileTypeIcon({ name }: { name: string }) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const format = formats[extension];
  if (!format)
    return (
      <FileIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-label="File"
      />
    );
  const [label, color] = format;
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0"
      role="img"
      aria-label={`${extension.toUpperCase()} file`}
    >
      <path
        d="M3 1.5h10l4 4v13H3z"
        fill={color}
        fillOpacity=".12"
        stroke={color}
        strokeWidth="1.2"
      />
      <path d="M13 1.5v4h4" fill="none" stroke={color} strokeWidth="1.2" />
      <text
        x="10"
        y="13.5"
        textAnchor="middle"
        fill={color}
        fontSize={label.length > 2 ? "6.4" : "8"}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}
