import { describe, it, expect } from "vitest";
import {
  APP_NAME,
  APP_SLUG,
  APP_REPO_URL,
  DEFAULT_PROJECTS_FOLDER,
  STORAGE_KEYS,
} from "@/lib/app-identity";

describe("app identity", () => {
  it("does not collide with upstream ClaudePrism names", () => {
    expect(APP_NAME).toBe("AresPrism");
    expect(APP_SLUG).toBe("ares-prism");
    expect(DEFAULT_PROJECTS_FOLDER).toBe("AresPrism");
    expect(APP_NAME).not.toMatch(/ClaudePrism/i);
    expect(DEFAULT_PROJECTS_FOLDER).not.toBe("ClaudePrism");
  });

  it("points the in-app GitHub link at the fork", () => {
    expect(APP_REPO_URL).toBe("https://github.com/Ares960826/claude-prism");
    expect(APP_REPO_URL).not.toContain("delibae/claude-prism");
  });

  it("uses fork-local webview storage keys", () => {
    expect(STORAGE_KEYS.settings).toBe("ares-prism-settings");
    expect(STORAGE_KEYS.projects).toBe("ares-prism-projects");
    expect(STORAGE_KEYS.zotero).toBe("ares-prism-zotero");
    expect(Object.values(STORAGE_KEYS).join(" ")).not.toContain("claude-prism");
  });
});
