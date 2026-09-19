<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="AresPrism" />
</p>

<h1 align="center">AresPrism</h1>

<p align="center">
  로컬 LaTeX 편집·컴파일 도구.<br/>
  단순한 화면 · 로컬 Zotero · 선택적 AI Agent · 버전 관리.
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

AresPrism은 컴퓨터에서 직접 편집하고 컴파일하고 미리보는 **로컬** LaTeX 도구입니다. 방해를 줄이고 원고를 끝내는 데 맞춰져 있습니다. 논문이 우선이고, 노트와 이력서도 됩니다.

**잘 하는 일**

- Tectonic, TeX Live, latexmk를 한곳에서, 실시간 PDF와 SyncTeX
- 이 컴퓨터의 Zotero 라이브러리(`zotero.sqlite`)를 읽음: 컬렉션, `\cite` 삽입, `.bib` 가져오기
- 이 Mac에 Claude Code / Codex / Grok / Kimi가 있으면 편집기에 연결
- 작은 인터페이스, SyncTeX, jj/Git 버전 관리

**설치 및 배포**

- [中文](docs/ares/install-zh.md) · [English](docs/ares/install-en.md) · [한국어](docs/ares/install-ko.md)

**AI에게 설치를 맡기려면** 이 문장을 이 Mac을 다룰 수 있는 도우미에게 보냅니다:

> Read https://github.com/Ares960826/AresPrism/blob/main/docs/ares/agent-install.md and install TeX (if needed) and AresPrism on this Mac, then open the app.

소스에서 빌드: [CONTRIBUTING.md](CONTRIBUTING.md).

## Windows 기여자를 찾습니다

배포본은 지금 **macOS Apple Silicon**만 있습니다. **Windows** 패키징, TeX Live 경로, 설치 프로그램, 테스트를 맡아 줄 협력자를 구합니다. [Issue](https://github.com/Ares960826/AresPrism/issues) 또는 PR을 열어 주세요. 환경은 [CONTRIBUTING.md](CONTRIBUTING.md)입니다.

## 라이선스

**0.8.0**부터 [Business Source License 1.1](./LICENSE). 논문과 노트 작성은 허용됩니다. 이 저장소로 경쟁 데스크톱 LaTeX IDE를 배포하는 것은 상업 라이선스 없이 할 수 없습니다.

업스트림은 [MIT](./LICENSES/MIT.txt). **v0.1.0–v0.7.1** 태그는 MIT입니다.

[Credits](./CREDITS.md) · [Changelog](./docs/ares/CHANGELOG.md)
