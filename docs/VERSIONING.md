# Versioning

AresPrism uses its own SemVer. It does not continue ClaudePrism’s 1.x numbers.

| Version | Meaning |
|---|---|
| **0.1.0** | First independent desktop build |
| **0.2.0** | Local Zotero library; workspace pane clipping; editor scroll-latch fix |
| **0.2.1** | Zotero items under folders; toolbar overflow menu on every workspace bar |
| 0.x.y | Ongoing work. Patch `y` for fixes; minor `x` for user-visible features |
| 1.0.0 | When this app is the daily driver for paper writing |

On each GitHub Release:

1. Bump `version` in `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`
2. Record changes in [docs/ares/CHANGELOG.md](./ares/CHANGELOG.md)
3. Tag `vMAJOR.MINOR.PATCH`

`main` is the installable product line. Feature work lands through `feat/…` branches. Public git history starts at AresPrism 0.1.0; earlier Open Prism / ClaudePrism history is recorded in [CREDITS.md](../CREDITS.md) and [LICENSE](../LICENSE). ClaudePrism remains an optional `upstream` remote for selective merges. After 0.1.0, do not force-push `main`.
