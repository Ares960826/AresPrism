<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  本地 LaTeX 编辑与编译工具。<br/>
  界面简单 · 本机 Zotero · 可接入 AI Agent · 自带版本管理。
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

AresPrism 是装在自己电脑上的 LaTeX 工具：写、编、预览都在本地。定位是少打扰、把稿子写完——论文优先，也适合笔记和简历。

**它擅长什么**

- Tectonic、TeX Live、latexmk 放在一起，实时 PDF 和 SyncTeX
- 直接读本机 Zotero 库（`zotero.sqlite`）：集合树、插入 `\cite`、导入 `.bib`
- 本机已有 Claude Code / Codex / Grok / Kimi 时，可以接到编辑器里
- 界面克制，工程版本用 Git 快照管理

**安装与部署**

- [中文](docs/ares/install-zh.md) · [English](docs/ares/install-en.md) · [한국어](docs/ares/install-ko.md)

**让 AI 代装** — 把这句话发给能操作这台电脑的助手：

> 请阅读 https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md ，在这台 Mac 上安装 TeX（如需要）和 AresPrism，装好后打开应用。

从源码编译请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 招募 Windows 开发合作者

目前发布包只有 **macOS Apple Silicon**。需要有人一起做 **Windows** 的打包、TeX Live 路径、安装程序和测试。请开 [Issue](https://github.com/Ares960826/AresPrism/issues) 或 PR，环境见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

从 **0.8.0** 起为 [Business Source License 1.1](./LICENSE)。写论文、做笔记可以。不能拿本仓库去做竞品桌面 LaTeX IDE。到 **2029-09-19**（或该版本首次发布满四年，以较早者为准）变为 Apache-2.0。

上游部分仍是 [MIT](./LICENSES/MIT.txt)。**v0.1.0–v0.7.1** 标签仍按 MIT。

[致谢](./CREDITS.md) · [变更](./docs/ares/CHANGELOG.md)
