<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  논문, 연구 노트, 이력서를 위한 로컬 LaTeX IDE.<br/>
  <a href="https://github.com/delibae/claude-prism">ClaudePrism</a>(MIT)을 기반으로 한 독립 제품입니다.
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

공식 ClaudePrism 저장소가 아닙니다. AresPrism은 같은 오픈소스 계보의 **병렬 제품**입니다. 공개 소스의 출발점은 [Open Prism](https://github.com/assistant-ui/open-prism)(assistant-ui, MIT)입니다. ClaudePrism이 그 위에서 데스크톱 앱을 만들었고, AresPrism은 ClaudePrism 1.3.0에서 갈라져 따로 발전합니다. 계보와 기여자 목록은 [CREDITS.md](./CREDITS.md)를 보세요.

## 설치 (macOS Apple Silicon)

1. [Releases](https://github.com/Ares960826/AresPrism/releases)에서 `.dmg`를 받습니다.
2. **AresPrism**을 `/Applications`로 드래그합니다.
3. 공식 `ClaudePrism.app`과 함께 설치할 수 있습니다 (`dev.ares.prism` vs `com.claude-prism.desktop`).

로컬 ad-hoc 서명입니다. 첫 실행이 막히면 Finder에서 **우클릭 → 열기**.

## ClaudePrism 대비 변경점

- 앱 이름 **AresPrism**, 청록 아이콘
- 컴파일러: **Tectonic**, **TeX Live**, **latexmk**
- 엔진: `% !TEX program`이 없으면 기본 **pdfLaTeX**, LuaLaTeX / XeLaTeX도 선택 가능
- MacTeX `/Library/TeX/texbin` 및 TeX Live 2024–2026 경로 탐색
- 공식 자동 업데이트 **비활성**
- 기본 프로젝트 폴더: `~/Documents/AresPrism`

ClaudePrism에서 이어받은 기능: CodeMirror, MuPDF, SyncTeX, Git 스냅샷, Zotero, 선택적 Claude 채팅, 템플릿.

## 개발

```bash
pnpm install
pnpm dev:desktop
pnpm build:desktop
```

버전 규칙: [docs/VERSIONING.md](./docs/VERSIONING.md). 변경 기록: [docs/ares/CHANGELOG.md](./docs/ares/CHANGELOG.md).

## 계보

```
OpenAI Prism       클라우드 제품 (영감만, 이 저장소의 소스는 아님)
      │
Open Prism         assistant-ui / MIT
      │            https://github.com/assistant-ui/open-prism
      ▼
ClaudePrism        delibae / MIT
      │            https://github.com/delibae/claude-prism
      ├── ClaudePrism으로 계속
      └── AresPrism   이 저장소
```

AresPrism 작성자와 Open Prism / ClaudePrism에서 상속한 코드를 작성한 사람은 [CREDITS.md](./CREDITS.md)에 있습니다. GitHub Contributors 페이지가 전체 감사 목록이 아닙니다.

## 라이선스

[MIT](./LICENSE). Copyright (c) 2025 assistant-ui, 2026 delibae, 2026 Ares.
