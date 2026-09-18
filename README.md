<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  A local LaTeX IDE for research papers, notes, and CVs.<br/>
  Tectonic, TeX Live, and latexmk — live PDF preview and SyncTeX.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/Ares960826/AresPrism/releases">
    <img src="https://img.shields.io/github/v/release/Ares960826/AresPrism?style=flat-square&label=Latest%20Release&color=green" alt="Latest Release" />
  </a>
</p>

AresPrism is a **local** desktop LaTeX IDE. It is built for research papers first; notes and CVs work too. Compile with **Tectonic**, **TeX Live**, or **latexmk**, and preview the PDF live with SyncTeX.

Credits and origin: [CREDITS.md](./CREDITS.md).

## Install (macOS, Apple Silicon)

1. Download the latest `.dmg` from [Releases](https://github.com/Ares960826/AresPrism/releases).
2. Drag **AresPrism** into `/Applications`.
3. It can sit next to official `ClaudePrism.app` (`com.claude-prism.desktop` vs `dev.ares.prism`).

First launch may need **Right-click → Open** if macOS Gatekeeper blocks the ad-hoc signed build.

## What AresPrism changes

- App name **AresPrism**, bundle id `dev.ares.prism`, teal icon
- Compilers: **Tectonic**, **TeX Live**, **latexmk**
- Engines: **pdfLaTeX** (default when there is no `% !TEX program`), LuaLaTeX, XeLaTeX
- MacTeX / TeX Live binary discovery for 2024–2026 and `/Library/TeX/texbin`
- Upstream auto-update **disabled** (this app must never install official ClaudePrism builds)
- Default projects folder: `~/Documents/AresPrism`

Inherited from ClaudePrism: CodeMirror editor, MuPDF preview, SyncTeX, Git snapshots, Zotero, optional Claude chat, templates.

## Develop

```bash
pnpm install
pnpm dev:desktop      # Tauri dev
pnpm build:desktop    # production .app + .dmg
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). Versioning: [docs/VERSIONING.md](./docs/VERSIONING.md).

macOS Tectonic builds on this tree expect Homebrew ICU/HarfBuzz; `pnpm dev:desktop` / `pnpm build:desktop` set `PKG_CONFIG_PATH`, `CPATH`, and `CXXFLAGS=-std=c++17`.

## Version

Current release: **0.3.0**. The first independent build was 0.1.0, based on ClaudePrism **1.3.0**. Changelog: [docs/ares/CHANGELOG.md](./docs/ares/CHANGELOG.md).

## Lineage

```
OpenAI Prism       cloud product (inspiration only, not our source)
      │
Open Prism         assistant-ui / MIT
      │            https://github.com/assistant-ui/open-prism
      ▼
ClaudePrism        delibae / MIT
      │            https://github.com/delibae/claude-prism
      ├── continues as ClaudePrism
      └── AresPrism   this repository
```

AresPrism’s author and the people who wrote the inherited Open Prism / ClaudePrism code are listed in [CREDITS.md](./CREDITS.md). Please do not treat the GitHub “Contributors” graph as that full list.

## License

[MIT](./LICENSE). Copyright (c) 2025 assistant-ui, 2026 delibae, 2026 Ares.
