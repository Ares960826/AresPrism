<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  논문, 연구 노트, 이력서를 위한 로컬 LaTeX IDE.<br/>
  Tectonic, TeX Live, latexmk — 실시간 PDF 미리보기와 SyncTeX.
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

AresPrism은 논문, 연구 노트, 이력서를 위한 **로컬** 데스크톱 LaTeX IDE입니다. **Tectonic**, **TeX Live**, **latexmk**로 컴파일하고, SyncTeX과 함께 실시간 PDF를 보여줍니다.

기여자와 계보: [CREDITS.md](./CREDITS.md).

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

AresPrism **0.8.0 and later** is under the [Business Source License 1.1](./LICENSE). Personal and research use of the app is allowed. Offering a competing desktop LaTeX IDE requires a commercial license from Ares. On **2029-09-19** (or four years after a given version is published, whichever is first), that version becomes Apache-2.0.

Portions from Open Prism (assistant-ui) and ClaudePrism (delibae) remain under [MIT](./LICENSES/MIT.txt).

Git tags **v0.1.0–v0.7.1** remain MIT.
