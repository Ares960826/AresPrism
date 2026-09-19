# Install and deploy

[中文](./install-zh.md) · English · [한국어](./install-ko.md)

Current build: [Releases](https://github.com/Ares960826/AresPrism/releases/latest). AI one-shot: [agent-install.md](./agent-install.md).

From a clean Mac: install TeX, install AresPrism, compile the first file. Published packages are **macOS Apple Silicon** only.

---

## 1. Install TeX

Simple English notes can use the bundled Tectonic and skip this step.  
IEEE, conference templates, Chinese XeLaTeX, and university classes need **MacTeX** (TeX Live).

In Terminal:

```bash
which pdflatex xelatex lualatex latexmk
```

If you see `/Library/TeX/texbin/pdflatex`, go to step 2.

**Installer:** <https://www.tug.org/mactex/> (about 4–5 GB). Open a **new** Terminal afterwards and run `which pdflatex` again.

**Homebrew:**

```bash
brew install --cask mactex-no-gui
eval "$(/usr/libexec/path_helper)"
which pdflatex
```

AresPrism looks in `/Library/TeX/texbin`. You usually do not need to edit PATH.

## 2. Install AresPrism

1. Open [Releases](https://github.com/Ares960826/AresPrism/releases/latest)
2. Download `AresPrism_*_aarch64.dmg`
3. Drag **AresPrism** into Applications
4. First launch: Finder → **Right-click → Open**

Do not overwrite `ClaudePrism.app` if it is already installed. Default projects folder: `~/Documents/AresPrism`.

Later launches can install updates from GitHub inside the app.

## 3. Open a project and compile

1. Open AresPrism
2. **New**, or **Import** an existing folder
3. Files on the left, `.tex` in the middle, PDF on the right
4. Compile with **⌘ Enter**, or the preview refresh control

Home lists projects in a list.

## 4. Choose a compiler

**Settings → LaTeX**, or the two menus on the preview bar.

| Compiler | When |
|---|---|
| **Tectonic** | Simple English docs, no MacTeX. Cannot run LuaLaTeX |
| **TeX Live** | MacTeX installed. IEEE / school templates / Chinese |
| **latexmk** | MacTeX installed. Bibliographies, multi-pass builds |

Engine:

- `% !TEX program = xelatex` → **Auto**
- No magic comment → **pdfLaTeX**
- `fontspec` / many Chinese setups → **XeLaTeX**
- `\input{glyphtounicode}` English CVs switch to pdfLaTeX automatically

Several main files: **Settings → LaTeX → Documents**. The first row is compiled when the project opens. The citation file may be empty.

## 5. Preview

- The PDF pane updates after a successful compile
- Click text in the PDF to jump in the editor (SyncTeX)
- Preview can float, fill, or go fullscreen

## 6. Connect local Zotero (optional)

The **Zotero** sidebar reads this Mac’s `zotero.sqlite`. It does not use zotero.org. Install the Zotero desktop app first.

1. Open a project and click Zotero in the sidebar
2. Use the default data folder, or pick the folder that contains `zotero.sqlite`
3. Expand collections; insert `\cite{...}`, or import an item/folder into the project citation file (`.bib` and similar)
4. Which file is written: **Settings → LaTeX → Documents** — each main file may have a citation file, or none

## 7. Connect an AI agent (optional)

Writing works without an agent. If a CLI is already signed in on this Mac, pick it in chat or **Settings → Provider**. Install and login stay with that CLI.

| Tool | Command |
|---|---|
| Claude Code | `claude` |
| Codex | `codex` |
| Grok Build | `grok` |
| Kimi Code | `kimi` |

Unsigned CLIs stay out of the chat picker.

## 8. Updates and versions

On launch the app checks GitHub for a newer build. You can also:

- Use the refresh control next to the version in the left footer
- **Settings → Updates**, or **Check for updates** on the AresPrism row under **Settings → Environment**

After install the app restarts. A dmg is still on [Releases](https://github.com/Ares960826/AresPrism/releases). Project Git snapshots live in the editor Versions panel.
