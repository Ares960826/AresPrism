<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  本地 LaTeX IDE，面向论文、研究笔记和简历。<br/>
  支持 Tectonic、TeX Live、latexmk，实时 PDF 预览与 SyncTeX。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

AresPrism 是**本地**桌面 LaTeX IDE，面向论文，也适合研究笔记和简历。可用 **Tectonic**、**TeX Live** 或 **latexmk** 编译，并提供实时 PDF 预览与 SyncTeX。

致谢与来历见 [CREDITS.md](./CREDITS.md)。

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

AresPrism 作者以及 Open Prism / ClaudePrism 继承代码的作者写在 [CREDITS.md](./CREDITS.md)。GitHub Contributors 页面不是完整致谢名单。

## 许可证

AresPrism **0.8.0 起**使用 [Business Source License 1.1](./LICENSE)。写论文、做笔记、自己用都可以。不能在未获得 Ares 商业许可的情况下，用本仓库去做竞品桌面 LaTeX IDE。到 **2029-09-19**（或该版本首次发布满四年，以较早者为准），该版本自动变为 Apache-2.0。

来自 Open Prism（assistant-ui）和 ClaudePrism（delibae）的部分仍是 [MIT](./LICENSES/MIT.txt)，版权声明必须保留。

Git 标签 **v0.1.0–v0.7.1** 当时以 MIT 发布，那些标签仍按 MIT 可用。
