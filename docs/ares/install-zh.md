# 安装与部署指南

中文 · [English](./install-en.md) · [한국어](./install-ko.md)

当前安装包见 [Releases](https://github.com/Ares960826/AresPrism/releases/latest)。让 AI 代装：[agent-install.md](./agent-install.md)。

从零开始：先装 TeX，再装 AresPrism，然后编译第一份稿。目前发布包面向 **macOS Apple Silicon**。

---

## 1. 安装 TeX

简单英文稿可以只靠应用自带的 Tectonic，跳过本步。  
IEEE、会议模板、中文 XeLaTeX、学校模板请安装 **MacTeX**（TeX Live）。

打开「终端」：

```bash
which pdflatex xelatex lualatex latexmk
```

若已有 `/Library/TeX/texbin/pdflatex` 一类路径，做到第 2 步。

**图形安装：** <https://www.tug.org/mactex/>（大约 4–5 GB）。装完新开一个终端，再跑一次 `which pdflatex`。

**Homebrew：**

```bash
brew install --cask mactex-no-gui
eval "$(/usr/libexec/path_helper)"
which pdflatex
```

应用会自动找 `/Library/TeX/texbin`，一般不用改 PATH。

## 2. 安装 AresPrism

1. 打开 [Releases](https://github.com/Ares960826/AresPrism/releases/latest)
2. 下载 `AresPrism_*_aarch64.dmg`
3. 把 **AresPrism** 拖进「应用程序」
4. 第一次：Finder 里 **右键 → 打开**（未识别开发者时选打开）

不要覆盖已安装的 `ClaudePrism.app`。默认工程目录：`~/Documents/AresPrism`。

以后打开软件，GitHub 有新版本会提示，可在软件里一键更新。

## 3. 打开工程并编译

1. 打开 AresPrism
2. **New** 新建，或 **Import** 打开已有文件夹
3. 左边文件，中间 `.tex`，右边 PDF
4. **⌘ Enter** 编译，或点预览栏刷新

Home 可用画廊或列表。画廊封面来自主文件编出的 PDF（`.prism/build/`）。

## 4. 选择编译器

**设置 → LaTeX**，或预览顶栏左侧两个菜单。

| 编译器 | 何时使用 |
|---|---|
| **Tectonic** | 简单英文稿、尚未安装 MacTeX。不能跑 LuaLaTeX |
| **TeX Live** | 已装 MacTeX。IEEE / 学校模板 / 中文稿 |
| **latexmk** | 已装 MacTeX。参考文献、多次编译 |

引擎：

- 文件有 `% !TEX program = xelatex` 时，选 **Auto**
- 没有这行时默认 **pdfLaTeX**
- 中文、`fontspec` 常用 **XeLaTeX**
- 含 `\input{glyphtounicode}` 的英文稿会自动改用 pdfLaTeX

多个主文件： **设置 → LaTeX → Documents**。第一行是打开工程时默认编译的那份。引用文件可以不选。

## 5. 预览

- 编译成功后右侧 PDF 更新
- 在 PDF 上点文字，编辑器跳到对应位置（SyncTeX）
- 预览可浮动、铺满或全屏

## 6. 接入本机 Zotero（可选）

侧栏 **Zotero** 读的是本机 `zotero.sqlite`，不走 zotero.org。本机装过 Zotero 桌面版即可。

1. 打开工程后点侧栏 Zotero
2. 用默认数据目录，或选 Zotero 的 data 文件夹（里面有 `zotero.sqlite`）
3. 展开集合看条目；可插入 `\cite{...}`，或把条目/文件夹导入工程的引用文件（`.bib` 等）
4. 引用写到哪个文件： **设置 → LaTeX → Documents** 里每份主文件可配对一个引用文件，也可以留空

## 7. 接入 AI Agent（可选）

不接 Agent 也能写。若本机已登录下列 CLI，在聊天或 **设置 → Provider** 里选择即可。安装和登录仍走各 CLI 自己的方式。

| 工具 | 命令 |
|---|---|
| Claude Code | `claude` |
| Codex | `codex` |
| Grok Build | `grok` |
| Kimi Code | `kimi` |

未登录的 CLI 不会出现在聊天选择器里。

## 8. 版本与更新

打开软件后若有新版本，选 **Download and install**。也可以到 [Releases](https://github.com/Ares960826/AresPrism/releases) 手动下载。工程内的 Git 快照在编辑器的 Versions 面板。
