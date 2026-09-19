# Versioning

AresPrism uses its own SemVer. It does not continue ClaudePrism’s 1.x numbers.

| Version | Meaning |
|---|---|
| **0.1.0** | First independent desktop build |
| **0.2.0** | Local Zotero library; workspace pane clipping; editor scroll-latch fix |
| **0.2.1** | Zotero items under folders; toolbar overflow menu on every workspace bar |
| **0.2.2** | Overflow menus keep the original toolbar icons |
| **0.3.0** | Settings: app/editor fonts and sizes; LaTeX compiler defaults |
| **0.4.0** | 察尔汗盐湖 theme, floating preview/AI, citation file setting, Git panel |
| **0.5.0** | Local CLI AgentPort: Codex / Grok Build / Kimi Code |
| **0.6.0** | Chat chrome, CLI models, parallel TeX, 察尔汗盐湖 gutter/PDF |
| **0.6.1** | pdfTeX auto-engine, local CLI models/effort, agent icons, Home vs traffic lights |
| **0.7.0** | Multi main-file settings, live CLI routing, floating AI/preview chrome, new icon |
| **0.7.1** | Codex stdin, docked chat gutter, settings overflow, optional bib, preview toolbar, traffic lights |
| **0.8.0** | Business Source License 1.1; 护眼 renamed 察尔汗盐湖 |
| **0.9.0** | Filled macOS icon, Home gallery PDF + list, in-app GitHub updates |
| **0.9.1** | Home is list-only; gallery and project previews removed |
| **0.10.0** | Cross-file SyncTeX; jj/Git version modes (lock + 50 auto snapshots) |
| **0.10.1** | Settings capsule switches and provider radio dots |
| 0.x.y | Ongoing work. Patch `y` for fixes; minor `x` for user-visible features |
| 1.0.0 | When this app is the daily driver for paper writing |

On each GitHub Release:

1. Bump `version` in `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`
2. Record changes in [docs/ares/CHANGELOG.md](./ares/CHANGELOG.md)
3. Tag `vMAJOR.MINOR.PATCH`

`main` is the installable product line. Feature work lands through `feat/…` branches. Public git history starts at AresPrism 0.1.0; earlier Open Prism / ClaudePrism history is recorded in [CREDITS.md](../CREDITS.md) and [LICENSE](../LICENSE). ClaudePrism remains an optional `upstream` remote for selective merges. After 0.1.0, do not force-push `main`.
