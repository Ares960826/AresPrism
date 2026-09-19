<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  A local LaTeX editor and compiler.<br/>
  Simple UI · local Zotero · optional AI agents · version history.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/Ares960826/AresPrism/releases/latest">
    <img src="https://img.shields.io/badge/Download-macOS_(Apple_Silicon)-black?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS (Apple Silicon)" />
  </a>
</p>
<p align="center">
  <a href="https://github.com/Ares960826/AresPrism/releases">
    <img src="https://img.shields.io/github/v/release/Ares960826/AresPrism?style=flat-square&label=Latest%20Release&color=green" alt="Latest Release" />
  </a>
</p>

<p align="center">
  <img src="./docs/ares/screenshots/workspace.jpg" alt="AresPrism editor and PDF preview" width="800" />
</p>

AresPrism is a **local** LaTeX tool: you edit, compile, and preview on your own machine. It is meant to stay quiet and get out of the way — papers first, also notes and CVs.

## Why AresPrism?

[OpenAI Prism](https://openai.com/prism/) is a cloud workspace. [ClaudePrism](https://github.com/delibae/claude-prism) is a local Claude-centered writing app. AresPrism starts from the same desktop lineage, then treats **LaTeX as the product** and AI as optional.

| | OpenAI Prism | ClaudePrism | AresPrism |
|---|:---:|:---:|:---:|
| What it is | Cloud LaTeX | Claude + LaTeX + skills | **Local LaTeX editor/compiler** |
| Runtime | Browser | Native desktop | **Native desktop (Tauri 2)** |
| Compile | Cloud | Tectonic | **Tectonic + TeX Live + latexmk** |
| Engines | — | Tectonic | **pdfLaTeX / XeLaTeX / LuaLaTeX** |
| Bibliography | — | Zotero OAuth | **Local `zotero.sqlite`** |
| AI | Cloud GPT | Claude only | **Optional: Claude, Codex, Grok, Kimi** |
| UI | Cloud app | Feature-dense | **Simple, including 察尔汗盐湖** |
| Versions | — | Git history | **Git snapshots in the editor** |
| Source | Proprietary | MIT | **BSL 1.1** (tags through 0.7.1 stay MIT) |

Files stay on disk. Compile is local. If you never open the chat, nothing is sent to an LLM.

## Features

### Editor and live PDF

CodeMirror 6, MuPDF preview, SyncTeX. **⌘ Enter** compiles. TeX Live / XeLaTeX (or pdfLaTeX / LuaLaTeX) in the preview bar.

<p align="center">
  <img src="./docs/ares/screenshots/workspace.jpg" alt="Editor, outline, Zotero, PDF" width="800" />
</p>

### Home

Projects in a list. **New** or **Import**. Default folder: `~/Documents/AresPrism`.

<p align="center">
  <img src="./docs/ares/screenshots/home.jpg" alt="Home project list" width="800" />
</p>

### Compilers

**Settings → LaTeX**: Tectonic, TeX Live, or latexmk. Pair several main files; citation files are optional.

<p align="center">
  <img src="./docs/ares/screenshots/settings-latex.jpg" alt="LaTeX compiler settings" width="700" />
</p>

### Local Zotero

The sidebar reads this Mac’s `zotero.sqlite` (not zotero.org). Insert `\cite`, import a collection to `.bib`.

### Templates

Guided setup or a blank `.tex`. IEEE / ACM / thesis templates included.

<p align="center">
  <img src="./docs/ares/screenshots/templates.jpg" alt="Create project" width="600" />
</p>
<p align="center">
  <img src="./docs/ares/screenshots/templates-gallery.jpg" alt="Template gallery" width="800" />
</p>

### Optional AI agents

Claude Code, Codex, Grok, or Kimi — only if that CLI is already signed in. Appearance, Python/uv, and skills stay in Settings.

<p align="center">
  <img src="./docs/ares/screenshots/settings.jpg" alt="Appearance settings" width="700" />
</p>
<p align="center">
  <img src="./docs/ares/screenshots/settings-environment.jpg" alt="Environment settings" width="700" />
</p>

## Install and deploy

- [中文](docs/ares/install-zh.md) · [English](docs/ares/install-en.md) · [한국어](docs/ares/install-ko.md)

**Let an AI do the install** — paste this to an assistant that can use this Mac:

> Read https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md and install TeX (if needed) and AresPrism on this Mac, then open the app.

Build from source: [CONTRIBUTING.md](CONTRIBUTING.md).

## Windows contributors wanted

The published app is **macOS Apple Silicon** only. We want collaborators who can own **Windows** packaging, TeX Live paths, installers, and testing. Open an [Issue](https://github.com/Ares960826/AresPrism/issues) or a PR.

## License

From **0.8.0**, [Business Source License 1.1](./LICENSE). Writing papers and notes is allowed. Shipping a competing desktop LaTeX IDE from this tree is not, unless you have a commercial license. On **2029-09-19** (or four years after a given version is published, whichever is first), that version becomes Apache-2.0.

Upstream Open Prism / ClaudePrism portions stay [MIT](./LICENSES/MIT.txt). Tags **v0.1.0–v0.7.1** remain MIT.

[Changelog](./docs/ares/CHANGELOG.md)

## Acknowledgments

AresPrism comes from this line of work. The people below are the earlier founders and major contributors of the code this product started from.

- [Open Prism](https://github.com/assistant-ui/open-prism) by [assistant-ui](https://github.com/assistant-ui) — first public source in this family; a browser LaTeX workspace (MIT). OpenAI Prism is a separate cloud product and is not the source.
- [ClaudePrism](https://github.com/delibae/claude-prism) by [Hanjin Bae](https://github.com/delibae) (`delibae`) — took Open Prism into a native desktop app with local compile and Claude. AresPrism started from the ClaudePrism **1.3.0** snapshot (`674e7c7`).

ClaudePrism continues on its own. AresPrism is an independent parallel product, not the official ClaudePrism project.

Full inherited names: [CREDITS.md](./CREDITS.md).
