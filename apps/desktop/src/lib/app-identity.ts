/** Fork-local product identity. Must stay distinct from upstream ClaudePrism
 *  (`com.claude-prism.desktop`) so both apps can be installed and run at once. */
export const APP_NAME = "AresPrism";
export const APP_SLUG = "ares-prism";
export const DEFAULT_PROJECTS_FOLDER = "AresPrism";
export const APP_REPO_URL = "https://github.com/Ares960826/claude-prism";

export const STORAGE_KEYS = {
  settings: "ares-prism-settings",
  projects: "ares-prism-projects",
  zotero: "ares-prism-zotero",
} as const;
