# AresPrism 变更

只记本产品相对上一版的差。上游 ClaudePrism 的历史仍在 git 里，不抄到这里。

## 0.1.0 — 2026-09-17

第一版独立发布。基于 ClaudePrism 1.3.0。

- 独立应用身份：**AresPrism**，bundle id `dev.ares.prism`，青绿图标
- 可与官方 `/Applications/ClaudePrism.app` 并排安装
- 编译后端增加 **latexmk**；TeX Live / latexmk 可选 pdfLaTeX、LuaLaTeX、XeLaTeX
- 无 `% !TEX program` 时默认 pdfLaTeX
- 发现 `/Library/TeX/texbin` 与 TeX Live 2024–2026 路径
- 关闭指向官方 ClaudePrism 的自动更新
- 默认工程目录 `~/Documents/AresPrism`
