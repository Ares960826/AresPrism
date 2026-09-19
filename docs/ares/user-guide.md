# AresPrism 使用指南

给写论文、笔记和简历的人。不需要会编译软件。

当前版本见 [Releases](https://github.com/Ares960826/AresPrism/releases)。变更记录：[CHANGELOG.md](./CHANGELOG.md)。

开发者请看仓库里的 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

想让 AI 在这台电脑上代你安装，把 [agent-install.md](./agent-install.md) 发给它。

---

## 1. 这是什么

AresPrism 是装在自己电脑上的 **LaTeX 编辑器**：文件在本地，编译在本地，PDF 预览在本地。适合 IEEE / 会议稿、笔记和简历。

- 可以和官方 ClaudePrism 同时安装，互不影响
- 默认工程目录：`~/Documents/AresPrism`
- 目前安装包面向 **macOS Apple Silicon**（M 系列芯片）

## 2. 先装 TeX（写论文强烈建议）

AresPrism 自带 **Tectonic**，只写简单文档时可以不装 TeX Live。  
IEEE、CVPR、中文 XeLaTeX、学校模板等，请装 **MacTeX**（TeX Live）。

### 2.1 看这台 Mac 有没有 TeX

打开「终端」运行：

```bash
which pdflatex xelatex lualatex latexmk
```

若打印出 `/Library/TeX/texbin/pdflatex` 一类路径，TeX 已经装好，跳到第 3 步。

### 2.2 安装 MacTeX

任选一种：

**方式 A（推荐，图形界面）**

1. 打开 <https://www.tug.org/mactex/>
2. 下载 MacTeX，按提示安装（体积大约 4–5 GB，需要一些时间）
3. 装完**新开一个终端**，再运行上面的 `which pdflatex`

**方式 B（Homebrew）**

```bash
brew install --cask mactex-no-gui
eval "$(/usr/libexec/path_helper)"
which pdflatex
```

AresPrism 会自动找 `/Library/TeX/texbin`，一般不用改 PATH。

## 3. 安装 AresPrism

1. 打开 [Releases](https://github.com/Ares960826/AresPrism/releases/latest)
2. 下载 `AresPrism_*_aarch64.dmg`
3. 打开 dmg，把 **AresPrism** 拖进「应用程序」
4. 第一次打开：在 Finder 里找到 AresPrism，**右键 → 打开**（系统可能提示未识别开发者，选打开即可）

不要覆盖已经安装的 `ClaudePrism.app`。

以后有新版本时，打开软件会提示，可在软件里一键更新。

## 4. 第一次写东西

1. 打开 AresPrism
2. **New** 新建，或 **Import** 打开已有文件夹
3. 工程会出现在 Home。点进去进入编辑器
4. 左边是文件，中间是 `.tex`，右边是 PDF

默认工程目录：`~/Documents/AresPrism`。

Home 可以用画廊或列表看项目。画廊封面来自主文件编出来的 PDF（在项目里的 `.prism/build/`）。

## 5. 选编译器（很重要）

打开任意工程后：**设置 → LaTeX**，或预览顶栏左侧的两个下拉菜单。

| 编译器 | 什么时候用 |
|---|---|
| **Tectonic** | 简单英文稿、不想装 MacTeX。不能跑 LuaLaTeX |
| **TeX Live** | 已装 MacTeX。IEEE / 学校模板 / 中文稿 |
| **latexmk** | 已装 MacTeX，参考文献、多次编译更省心 |

引擎（pdfLaTeX / XeLaTeX / LuaLaTeX / Auto）：

- 文件里有 `% !TEX program = xelatex` 时，选 **Auto** 会按这行走
- 没有这行时，默认 **pdfLaTeX**
- 中文、`fontspec` 常用 **XeLaTeX**
- 含 `\input{glyphtounicode}` 的英文稿会自动改用 pdfLaTeX

快捷键：**⌘ Enter** 编译。点预览栏刷新也可以。

多个主文件（例如中英两份 CV）：在 **设置 → LaTeX → Documents** 里添加。第一行是打开工程时默认编译的那份。引用文件（`.bib`）可以不选。

## 6. 预览和 SyncTeX

- 右边 PDF 会在编译成功后更新
- 在 PDF 里点文字，编辑器会跳到对应位置（SyncTeX）
- 预览可以浮动、铺满或全屏
- 主题里的 **察尔汗盐湖** 是浅绿色界面，不是默认主题

## 7. 可选：AI

AresPrism 是 LaTeX 编辑器，AI 是可选项。不装 AI 也能写论文。

在聊天窗口或 **设置 → Provider / Agent** 里选本机已登录的 CLI：

| 工具 | 常见命令 | 说明 |
|---|---|---|
| Claude Code | `claude` | 默认 |
| Codex | `codex` | 需已登录 Codex |
| Grok Build | `grok` | 需已登录 Grok |
| Kimi Code | `kimi` | 未登录不会出现在聊天选择器 |

这些 CLI 的安装和登录跟 AresPrism 分开，用各自官方方式即可。AresPrism 只负责在当前工程目录里调用它们。

## 8. 更新

打开软件后，若 GitHub 上有新版本，会弹出提示。选 **Download and install** 即可，完成后会重启。

也可以到 [Releases](https://github.com/Ares960826/AresPrism/releases) 手动下载 dmg。

## 9. 许可（写论文够用）

从 0.8.0 起使用 [Business Source License 1.1](../../LICENSE)。**自己写论文、做笔记、实验室用都可以。** 不能拿本仓库去做竞品桌面 LaTeX IDE。

上游 Open Prism / ClaudePrism 的部分仍是 MIT，见 [LICENSES/MIT.txt](../../LICENSES/MIT.txt)。
