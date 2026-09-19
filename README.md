<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  A local LaTeX IDE for papers, notes, and CVs.<br/>
  Tectonic, TeX Live, latexmk — live PDF preview and SyncTeX.
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

AresPrism is a **local** desktop LaTeX editor. Files stay on your computer. Compile and preview stay on your computer.

- Full walkthrough (Chinese): **[使用指南](docs/ares/user-guide.md)**
- Let an AI install it for you: **[agent-install.md](docs/ares/agent-install.md)**
- Developers: [CONTRIBUTING.md](CONTRIBUTING.md)

## Let an AI install it

Paste this to any assistant that can use this Mac:

> Read https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md and install TeX (if needed) and AresPrism on this Mac, then open the app.

## 1. Install TeX (recommended for papers)

AresPrism ships **Tectonic**. Simple notes can skip this step. IEEE / school templates / Chinese XeLaTeX need **MacTeX**.

Check:

```bash
which pdflatex xelatex lualatex latexmk
```

If that prints `/Library/TeX/texbin/pdflatex`, skip to step 2.

Install either from <https://www.tug.org/mactex/> or:

```bash
brew install --cask mactex-no-gui
eval "$(/usr/libexec/path_helper)"
```

## 2. Install AresPrism (macOS Apple Silicon)

1. Download the `.dmg` from [Releases](https://github.com/Ares960826/AresPrism/releases/latest)
2. Drag **AresPrism** into `/Applications`
3. First launch: Finder → **Right-click → Open** (Gatekeeper)

It can sit next to official `ClaudePrism.app`. Do not replace that app.

Later versions can be installed from inside the app when GitHub has a new release.

## 3. First document

1. Open AresPrism
2. **New** or **Import** a folder
3. Default projects dir: `~/Documents/AresPrism`
4. Compile with **⌘ Enter**, or the refresh control on the preview

**Settings → LaTeX** (or the two menus on the preview bar):

| Compiler | Use when |
|---|---|
| Tectonic | Simple English docs, no MacTeX |
| TeX Live | MacTeX installed; IEEE / templates / Chinese |
| latexmk | MacTeX installed; bibliographies, multi-pass |

Engine: **pdfLaTeX** unless the file has `% !TEX program = …`. Use **XeLaTeX** for `fontspec` / many Chinese setups.

## 4. Optional AI

Writing works without AI. If you already use Claude Code, Codex, Grok, or Kimi on this machine, pick them in the chat or **Settings → Provider**. AresPrism does not replace those CLIs’ own login.

## License

From **0.8.0**, AresPrism is [Business Source License 1.1](./LICENSE). You may use it to write papers and notes. You may not ship a competing desktop LaTeX IDE from this tree without a commercial license. On **2029-09-19** (or four years after a given version is published, whichever is first), that version becomes Apache-2.0.

Upstream Open Prism / ClaudePrism portions stay [MIT](./LICENSES/MIT.txt). Tags **v0.1.0–v0.7.1** remain MIT.

Credits: [CREDITS.md](./CREDITS.md). Changelog: [docs/ares/CHANGELOG.md](./docs/ares/CHANGELOG.md).
