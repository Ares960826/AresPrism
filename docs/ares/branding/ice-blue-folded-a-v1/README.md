# AresPrism 冰蓝折页 A 素材交接

用户选定方案 01。这里只存放素材，尚未接入应用、修改主页或执行构建。

| 文件 | 用途 | 实际尺寸 |
|---|---|---|
| `reference/aresprism-ice-blue-approved-comparison.png` | 用户批准的原始外观基准 | 1536 × 1024 |
| `macos/aresprism-macos-icon-master.png` | macOS 带白色圆角底座的独立 PNG 母图 | 1254 × 1254 |
| `windows/aresprism-windows-icon-master.png` | Windows 无底座的独立 PNG 母图 | 1254 × 1254 |
| `github/aresprism-github-brand-badge.png` | GitHub README 横向品牌小标签，含 AresPrism 字标 | 2172 × 724 |

三个独立素材均带透明通道。GitHub 小标签可按约 240–320 px 宽度显示；它是品牌标签，不是状态徽章或社交分享封面。

## 后续接入说明

原始对照图是外观基准。独立 PNG 是使用内置 imagegen 参照该图重新生成的交付素材，并非逐像素裁切；轮廓、留白和细节可能存在轻微差异。透明轮廓附近可见少量生成边缘杂点，接入前应在深浅背景上检查并清理，尤其是 macOS 底座外缘。当前没有将这些素材声明为已通过系统图标验收。

后续由开发方处理透明边缘、光学留白、小尺寸可读性、多尺寸导出，以及 `.icns` / `.ico` 封装和项目配置。此目录没有覆盖 `apps/desktop/src-tauri/icons/`，也没有生成或安装应用。

## 生成说明

使用内置 imagegen。三个任务均以批准的方案 01 对照图为参考。

- macOS：保持左侧白色圆角底座、冰蓝与白色折页 A 的结构、色彩和材质，输出单独正方形透明背景素材，移除文字和展示板。
- Windows：保持右侧独立折页 A 的结构、色彩和材质，输出单独正方形透明背景素材，不添加底座。
- GitHub：使用同款折页 A，配合深蓝色 `AresPrism` 字标，生成浅色圆角横向品牌标签，外侧透明，无口号。

本包不包含其他候选方案，以避免误用。
