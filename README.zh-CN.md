<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  本地 LaTeX IDE，给论文、笔记和简历用。<br/>
  Tectonic、TeX Live、latexmk，实时 PDF 预览和 SyncTeX。
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

文件在你的电脑上，编译也在你的电脑上。

- **完整步骤：** [使用指南](docs/ares/user-guide.md)
- **让 AI 代装：** 把下面这句话发给能操作这台电脑的助手

> 请阅读 https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md ，在这台 Mac 上安装 TeX（如需要）和 AresPrism，装好后打开应用。

开发者文档：[CONTRIBUTING.md](CONTRIBUTING.md)

## 1. 安装 TeX（写论文请装）

AresPrism 自带 **Tectonic**，简单英文稿可以不装 TeX Live。IEEE、学校模板、中文 XeLaTeX 请装 **MacTeX**。

先检查：

```bash
which pdflatex xelatex lualatex latexmk
```

若已有 `/Library/TeX/texbin/pdflatex`，跳到第 2 步。

安装任选其一：

- 打开 <https://www.tug.org/mactex/> 下载安装（大约 4–5 GB）
- 或：`brew install --cask mactex-no-gui`，然后新开一个终端

## 2. 安装 AresPrism（macOS Apple Silicon）

1. 从 [Releases](https://github.com/Ares960826/AresPrism/releases/latest) 下载 `AresPrism_*_aarch64.dmg`
2. 把 **AresPrism** 拖进「应用程序」
3. 第一次：Finder 里 **右键 → 打开**

可以和官方 `ClaudePrism.app` 并排。不要覆盖它。

以后打开软件时，GitHub 有新版本会提示，可在软件里一键更新。

## 3. 开始写

1. 打开 AresPrism → **New** 或 **Import**
2. 默认目录：`~/Documents/AresPrism`
3. **⌘ Enter** 编译，右边看 PDF

**设置 → LaTeX**（或预览顶栏两个菜单）：

| 编译器 | 什么时候用 |
|---|---|
| Tectonic | 简单稿、还没装 MacTeX |
| TeX Live | 已装 MacTeX，论文模板 |
| latexmk | 已装 MacTeX，参考文献 |

没有 `% !TEX program` 时默认 **pdfLaTeX**。中文、`fontspec` 常用 **XeLaTeX**。

## 4. 可选 AI

不装 AI 也能写。若本机已有 Claude Code / Codex / Grok / Kimi，在聊天或 **设置 → Provider** 里选即可。登录仍走各 CLI 自己的方式。

## 许可

从 **0.8.0** 起为 [Business Source License 1.1](./LICENSE)。**写论文、做笔记可以。** 不能拿本仓库去做竞品桌面 LaTeX IDE。上游部分仍是 [MIT](./LICENSES/MIT.txt)。

致谢：[CREDITS.md](./CREDITS.md)。变更：[docs/ares/CHANGELOG.md](./docs/ares/CHANGELOG.md)。
