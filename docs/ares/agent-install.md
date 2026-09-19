# AresPrism — one-shot install for AI agents

Read this file and do the steps on the user's Mac. Do not ask them to copy commands if you can run them. Human install guides: `docs/ares/install-zh.md`, `docs/ares/install-en.md`, `docs/ares/install-ko.md`.

Product: **AresPrism** (local LaTeX IDE). GitHub: https://github.com/Ares960826/AresPrism  
Bundle id `dev.ares.prism`. Do **not** overwrite `/Applications/ClaudePrism.app`.

## One sentence for the user to paste

> 请阅读 https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md ，在这台 Mac 上安装 TeX（如需要）和 AresPrism，装好后打开应用。

## What to do

1. Confirm macOS Apple Silicon (`uname -m` is `arm64`). If not, stop and say the published dmg is Apple Silicon only.
2. If `pdflatex` is missing, install MacTeX:
   - Prefer: `brew install --cask mactex-no-gui` then `eval "$(/usr/libexec/path_helper)"`
   - Or tell the user to download https://www.tug.org/mactex/ (large, 4–5 GB)
3. Install the app from the latest GitHub release (not from source unless they asked to develop):

```bash
mkdir -p /tmp/aresprism-install && cd /tmp/aresprism-install
gh release download -R Ares960826/AresPrism --pattern 'AresPrism_*_aarch64.dmg' --skip-existing
# if gh is missing:
# curl -sL https://api.github.com/repos/Ares960826/AresPrism/releases/latest \
#   | python3 -c "import sys,json,re; assets=json.load(sys.stdin)['assets'];
# print(next(a['browser_download_url'] for a in assets if a['name'].endswith('_aarch64.dmg')))" \
#   | xargs curl -L -o AresPrism.dmg

DMG=$(ls -1 AresPrism_*_aarch64.dmg | tail -1)
MNT=$(hdiutil attach -nobrowse "$DMG" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
rm -rf /Applications/AresPrism.app
cp -R "$MNT/AresPrism.app" /Applications/AresPrism.app
hdiutil detach "$MNT"
codesign --force --deep --sign - /Applications/AresPrism.app 2>/dev/null || true
open /Applications/AresPrism.app
```

4. Do not clone the git repo unless they want to build from source. Building needs Node 22+, pnpm 10+, Rust, and Homebrew `icu4c harfbuzz pkg-config`. That path is `CONTRIBUTING.md`, not this file.
5. After launch: default projects dir is `~/Documents/AresPrism`. For IEEE / XeLaTeX / school templates, set compiler to **TeX Live** or **latexmk** in Settings → LaTeX. Tectonic is enough for simple English notes.
6. Zotero is optional. The app reads local `zotero.sqlite` (not zotero.org). Do not set up Zotero OAuth. If the user already has Zotero desktop, they can connect it from the sidebar after opening a project.
7. AI (Claude Code / Codex / Grok / Kimi) is optional. Do not install those CLIs unless the user asked.
8. License: Business Source License 1.1 from 0.8.0. Personal and research use is allowed. Do not relicense or publish a competing desktop LaTeX IDE from this tree.

When done, tell the user AresPrism is in `/Applications` and how to pick TeX Live if they write papers.
