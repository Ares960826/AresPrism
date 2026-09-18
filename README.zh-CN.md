<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  本地 LaTeX IDE，面向论文、研究笔记和简历。<br/>
  独立产品，基于 <a href="https://github.com/delibae/claude-prism">ClaudePrism</a>（MIT）。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

这不是官方 ClaudePrism 仓库。AresPrism 是同一开源谱系里的**平行产品**。公开源码的真正起点是 [Open Prism](https://github.com/assistant-ui/open-prism)（assistant-ui，MIT）。ClaudePrism 在此基础上做成桌面端。AresPrism 从 ClaudePrism 1.3.0 出发后独立发展。完整来历与贡献者名单见 [CREDITS.md](./CREDITS.md)。

## 安装（macOS Apple Silicon）

1. 从 [Releases](https://github.com/Ares960826/AresPrism/releases) 下载 `.dmg`
2. 把 **AresPrism** 拖进 `/Applications`
3. 可以和官方 `ClaudePrism.app` 并排安装（`dev.ares.prism` vs `com.claude-prism.desktop`）

本机 ad-hoc 签名。若系统拦截第一次打开：Finder 里 **右键 → 打开**。

## AresPrism 相对上游的改动

- 应用名 **AresPrism**，青绿图标
- 编译器：**Tectonic**、**TeX Live**、**latexmk**
- 引擎：无 magic comment 时默认 **pdfLaTeX**，也可 LuaLaTeX / XeLaTeX
- 发现 MacTeX `/Library/TeX/texbin` 以及 2024–2026 路径
- **关闭**官方自动更新
- 默认工程目录：`~/Documents/AresPrism`

从 ClaudePrism 继承：CodeMirror、MuPDF、SyncTeX、Git 快照、Zotero、可选 Claude 聊天、模板库。

## 开发

```bash
pnpm install
pnpm dev:desktop
pnpm build:desktop
```

版本规则见 [docs/VERSIONING.md](./docs/VERSIONING.md)，变更见 [docs/ares/CHANGELOG.md](./docs/ares/CHANGELOG.md)。

## 来历

```
OpenAI Prism       云端产品（仅启发品类，不是本仓库源码）
      │
Open Prism         assistant-ui / MIT
      │            https://github.com/assistant-ui/open-prism
      ▼
ClaudePrism        delibae / MIT
      │            https://github.com/delibae/claude-prism
      ├── 继续作为 ClaudePrism
      └── AresPrism   本仓库
```

继承代码的作者写在 [CREDITS.md](./CREDITS.md)。GitHub 的 Contributors 页面不是这份名单。

## 许可证

[MIT](./LICENSE)。Copyright (c) 2025 assistant-ui、2026 delibae、2026 Ares。
