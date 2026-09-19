# AresPrism 变更

只记本产品相对上一版的差。上游 ClaudePrism 的历史仍在 git 里，不抄到这里。

## 0.10.1 — 2026-09-19

- 设置里的胶囊开关和 Provider 圆点改为灰底/天蓝，带白钮，不再是一整块黑

## 0.10.0 — 2026-09-19

- 跨文件 SyncTeX：PDF 单击跳到对应 `\input` 源文件；设置里可分别开关「跟随光标」和「双击定位」（先高亮行，有选词再高亮词）
- Versions 分成 jj / Git 两种概念模式。jj 默认：自动记版本、可回退、可锁定；未锁定只留最近 50 条。Git 仍是传统工作区，没有仓库时可初始化

## 0.9.1 — 2026-09-19

- Home 去掉项目封面预览和画廊，只保留列表
- 文档招募 Windows 开发合作者（发布包仍为 macOS Apple Silicon）
- README 增加与 OpenAI Prism / ClaudePrism 的对比表，以及各页面截图

## 0.9.0 — 2026-09-19

- macOS 图标改为折页 A 铺满系统图标，去掉里面那层白色圆角底板
- Home 左上角只留 AresPrism 名字，不再放图标
- Home 画廊会去 `.prism/build/<主文件>/` 找对应 PDF 做封面；并增加列表视图
- 设置 → Environment → Skills 里 Imported Skills 置顶
- GitHub 有新版本时软件内提醒，可一键下载安装（只跟 AresPrism 自己的 Release，不跟上游）
- GitHub 首页改为产品介绍；安装与部署指南分中 / 英 / 韩；开发说明在 CONTRIBUTING.md；可用一句话让 AI 代装
- 文档补上本机 Zotero（读 `zotero.sqlite`、插入引用、导入 bib）

## 0.8.0 — 2026-09-19

- 产品许可从 MIT 改为 Business Source License 1.1：写论文、自己用可以；不能拿去做竞品桌面 LaTeX IDE。2029-09-19 起该版本自动变为 Apache-2.0。Open Prism / ClaudePrism 部分仍是 MIT。已发布的 v0.1.0–v0.7.1 标签仍按 MIT
- 主题「护眼」改名为「察尔汗盐湖」

## 0.7.1 — 2026-09-19

- 关掉 Codex / Grok / Kimi 的 stdin，不再出现红条 “Reading additional input from stdin…”
- 嵌入聊天贴在编辑器底部，右侧留出垂直滚动条
- 设置里添加 Provider 时对话框限高，内容在面板内滚动，不再撑出窗口
- 「Add another main file」改成按钮；引用文件可以不选
- 预览工具栏变窄时编译器/引擎菜单保持完整；刷新、翻页、缩放收成简易按钮，不再互相覆盖
- macOS 红绿灯和顶栏略微下移

## 0.7.0 — 2026-09-19

- Home 水平位置恢复，只略微下移，不再把项目名挤到右边
- 设置里可配置多个主文件，每个主文件配对一个引用文件；打开项目时按第一项默认编译
- 聊天 Provider 只列出本机已登录的 CLI；Kimi 未登录时不出现在选择器，设置里仍显示状态
- Codex 列出 CLI 能用的编码模型，不只当前 config 里的那一个
- 模型行沿用 Claude Code 的图标 + 简述；思考档用 L/M/H/xH 简写
- 应用图标换成冰蓝折叠 A
- 预览浮动窗增加铺满和全屏；AI 浮动改为和预览一样的独立窗口

## 0.6.1 — 2026-09-18

- 含 `\input{glyphtounicode}` / `\pdfgentounicode` 的英文稿会自动用 pdfLaTeX，不再被全局 XeLaTeX 编挂（不改用户 TeX）
- Tectonic 遇到 pdfTeX 专用命令时改走 TeX Live / latexmk
- 本机 CLI 的模型和思考档只反映本机配置：Codex 含 xhigh/ultra/max，Grok 含 xhigh，Kimi 仅 Kimi 模型与 thinking 开关
- Codex / Grok / Kimi 使用对应官方图标
- 编辑页 Home 避开 macOS 红绿灯

## 0.6.0 — 2026-09-18

- 聊天去掉继承来的拖拽横条；浮动/关闭放到对话标签栏。高度仍可从顶边拖
- 本机 CLI 放进 Provider：Codex / Grok / Kimi 有模型和思考档（L/M/H）
- 文件树右键「在新标签打开」；编辑栏并行编译独立 `\documentclass` 文档；预览用 PDF 标签切换
- 察尔汗盐湖：行号栏跟主题；PDF 纸色随 Light / Dark / 察尔汗盐湖

## 0.5.0 — 2026-09-18

- 聊天可选用本机 CLI：Claude Code、Codex、Grok Build、Kimi Code（设置 → Agent，或聊天选择器）
- 非 Claude 的输出归一成现有聊天协议；改文件仍走 Proposed Changes
- 默认仍是 Claude Code。察尔汗盐湖主题保持可选，不是默认

## 0.4.0 — 2026-09-18

- 应用字号上限 28；工具提示字号跟随应用字体
- 预览可浮动；AI 默认真嵌入编辑器底部，可浮动且避开编辑区滚动条
- 增加察尔汗盐湖主题
- Zotero 去掉说明文案；引用写入文件可在设置里选（.bib / .bibtex / .json / .ris / .enw）
- Provider 增加 OpenRouter、硅基流动
- Versions 面板增加鼠标操作的 Git 工作区（文件列表、diff、commit）

## 0.3.0 — 2026-09-18

- 修复顶栏 `⋯` 在鼠标靠近时出现括号形阴影（过大的 icon 按钮 + focus ring 被工具栏裁切）
- 设置：应用字体/字号、编辑区字体/字号、主题、编译器与默认引擎、Vim。工作区齿轮或 ⌘,

## 0.2.2 — 2026-09-18

- 顶栏收进 `⋯` 的项目同时显示原来的图标和文字

## 0.2.1 — 2026-09-18

- Zotero 条目显示在对应文件夹下面；展开文件夹即可看到论文。导入 BibTeX 改到文件夹菜单，不再误点下载就跳到新文件
- 导入可 Undo；`.bib` 按参考文献打开，不再当 LaTeX 报 “Missing document environment”
- 所有工作区顶栏（编辑器、图片、预览、搜索、历史）变窄时收入 `⋯`，不再把按钮压没

## 0.2.0 — 2026-09-18

- 分栏缩放时内容裁在各自区域内；拖动手柄可点范围加宽，预览变窄时右上角工具收入 `⋯`，不再互相覆盖或切掉
- 编辑器滚轮结束之后，鼠标移动不再带动滚动
- Zotero 改为读取本机 `zotero.sqlite`（集合树、条目预览、插入 `\\cite`、导入 BibTeX），不再走 zotero.org 网络 API
- 侧栏底部 Python / Skills Environment 条先撤掉，以后放进 Agent 设置

## 0.1.0 — 2026-09-17

第一版独立发布。基于 ClaudePrism 1.3.0。

- 独立应用身份：**AresPrism**，bundle id `dev.ares.prism`，青绿图标
- 可与官方 `/Applications/ClaudePrism.app` 并排安装
- 编译后端增加 **latexmk**；TeX Live / latexmk 可选 pdfLaTeX、LuaLaTeX、XeLaTeX
- 无 `% !TEX program` 时默认 pdfLaTeX
- 发现 `/Library/TeX/texbin` 与 TeX Live 2024–2026 路径
- 关闭指向官方 ClaudePrism 的自动更新
- 默认工程目录 `~/Documents/AresPrism`
