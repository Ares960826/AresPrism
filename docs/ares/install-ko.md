# 설치 및 배포 가이드

[中文](./install-zh.md) · [English](./install-en.md) · 한국어

설치 파일: [Releases](https://github.com/Ares960826/AresPrism/releases/latest). AI 대행 설치: [agent-install.md](./agent-install.md).

처음부터: TeX를 설치하고, AresPrism을 설치한 뒤, 첫 파일을 컴파일합니다. 배포 패키지는 **macOS Apple Silicon** 전용입니다.

---

## 1. TeX 설치

간단한 영문 문서는 앱에 포함된 Tectonic만으로도 되며, 이 단계를 건너뛸 수 있습니다.  
IEEE, 학회 템플릿, 중문 XeLaTeX, 학교 클래스는 **MacTeX**(TeX Live)가 필요합니다.

터미널:

```bash
which pdflatex xelatex lualatex latexmk
```

`/Library/TeX/texbin/pdflatex` 같은 경로가 나오면 2단계로 갑니다.

**설치 프로그램:** <https://www.tug.org/mactex/> (약 4–5 GB). 설치 후 **새 터미널**을 열고 `which pdflatex`를 다시 실행합니다.

**Homebrew:**

```bash
brew install --cask mactex-no-gui
eval "$(/usr/libexec/path_helper)"
which pdflatex
```

앱이 `/Library/TeX/texbin`을 찾습니다. 보통 PATH를 고칠 필요는 없습니다.

## 2. AresPrism 설치

1. [Releases](https://github.com/Ares960826/AresPrism/releases/latest)를 엽니다
2. `AresPrism_*_aarch64.dmg`를 받습니다
3. **AresPrism**을 응용 프로그램 폴더로 드래그합니다
4. 첫 실행: Finder에서 **우클릭 → 열기**

이미 있는 `ClaudePrism.app`은 덮어쓰지 마세요. 기본 프로젝트 폴더: `~/Documents/AresPrism`.

이후 실행 시 GitHub에 새 버전이 있으면 앱 안에서 업데이트할 수 있습니다.

## 3. 프로젝트 열고 컴파일

1. AresPrism을 엽니다
2. **New**로 만들거나 **Import**로 기존 폴더를 엽니다
3. 왼쪽 파일, 가운데 `.tex`, 오른쪽 PDF
4. **⌘ Enter** 또는 미리보기 새로 고침으로 컴파일합니다

Home은 갤러리와 목록을 제공합니다. 갤러리 표지는 주 파일 PDF(`.prism/build/`)입니다.

## 4. 컴파일러 선택

**설정 → LaTeX**, 또는 미리보기 상단의 두 메뉴.

| 컴파일러 | 언제 |
|---|---|
| **Tectonic** | 간단한 영문, MacTeX 없음. LuaLaTeX 불가 |
| **TeX Live** | MacTeX 설치됨. IEEE / 학교 템플릿 / 중문 |
| **latexmk** | MacTeX 설치됨. 참고문헌, 다중 패스 |

엔진:

- `% !TEX program = xelatex` → **Auto**
- 매직 코멘트 없음 → **pdfLaTeX**
- `fontspec` / 많은 중문 설정 → **XeLaTeX**
- `\input{glyphtounicode}`가 있는 영문 CV는 자동으로 pdfLaTeX

주 파일이 여러 개면 **설정 → LaTeX → Documents**. 첫 줄이 프로젝트를 열 때 기본 컴파일 대상입니다. 인용 파일은 비워도 됩니다.

## 5. 미리보기

- 컴파일이 성공하면 오른쪽 PDF가 갱신됩니다
- PDF 텍스트를 클릭하면 편집기로 이동합니다 (SyncTeX)
- 미리보기는 플로팅, 채우기, 전체 화면이 됩니다

## 6. AI Agent 연결 (선택)

Agent 없이도 작성할 수 있습니다. 이 Mac에 이미 로그인한 CLI가 있으면 채팅 또는 **설정 → Provider**에서 고릅니다. 설치와 로그인은 각 CLI를 따릅니다.

| 도구 | 명령 |
|---|---|
| Claude Code | `claude` |
| Codex | `codex` |
| Grok Build | `grok` |
| Kimi Code | `kimi` |

로그인되지 않은 CLI는 채팅 선택기에 나오지 않습니다.

## 7. 업데이트와 버전

새 릴리스가 있으면 앱에서 **Download and install**을 고르거나 [Releases](https://github.com/Ares960826/AresPrism/releases)에서 dmg를 받습니다. 프로젝트 Git 스냅샷은 편집기의 Versions 패널에 있습니다.
