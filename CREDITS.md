# Credits and lineage

AresPrism is an **independent** desktop LaTeX IDE. It is **not** the official ClaudePrism project, and it is **not** a GitHub fork. It is a parallel product that starts from the same open-source family.

## Lineage

The **first public source tree** this codebase comes from is [Open Prism](https://github.com/assistant-ui/open-prism) by [assistant-ui](https://github.com/assistant-ui) (MIT, 2026). Open Prism is a browser LaTeX workspace. It is **not** derived from OpenAI Prism’s source; OpenAI Prism is a separate cloud product that inspired the category.

[ClaudePrism](https://github.com/delibae/claude-prism) (delibae / Hanjin Bae, MIT) started from Open Prism (`git` init from that repository on 2026-02-20), then became a native desktop app with local compilation and Claude integration.

AresPrism takes the ClaudePrism **1.3.0** snapshot as a starting point, then goes its own way (app identity, latexmk / TeX Live, releases). ClaudePrism continues independently.

```
OpenAI Prism          cloud product — inspiration only, not source
        │
Open Prism            assistant-ui / MIT
        │             https://github.com/assistant-ui/open-prism
        │             first public source in this family
        ▼
ClaudePrism           delibae / MIT
        │             https://github.com/delibae/claude-prism
        │
        ├── ClaudePrism  (continues)
        └── AresPrism    (this repository — parallel product)
```

Copyright notices: [LICENSE](./LICENSE) (`assistant-ui`, `delibae`, `Ares`).

## AresPrism

| Name | Notes |
|---|---|
| [Ares](https://github.com/Ares960826) (`@Ares960826`) | AresPrism author |

## Inherited from ClaudePrism / Open Prism

Names below are taken from the ClaudePrism history at snapshot `674e7c7` (v1.3.0). Bots omitted. GitHub usernames are included when they match that history. These people built the code AresPrism started from; they are not listed as GitHub “contributors” of this repository because public git history starts at AresPrism 0.1.0.

| Name | Notes |
|---|---|
| [Hanjin Bae](https://github.com/delibae) (`delibae`) | ClaudePrism author and primary maintainer |
| Minsoo Kim ([@vv137](https://github.com/vv137)) | ClaudePrism contributor |
| Gunwoong Park ([@GunwoongP](https://github.com/GunwoongP)) | ClaudePrism contributor |
| Weilin Cai ([@WhiskyChoy](https://github.com/WhiskyChoy)) | ClaudePrism contributor |
| Timotheus Merlin Scherer ([@TimothyMerlin](https://github.com/TimothyMerlin)) | ClaudePrism contributor |
| Gerard Devlin ([@Gerard-Devlin](https://github.com/Gerard-Devlin)) | ClaudePrism contributor |
| [@L-N1988](https://github.com/L-N1988) | ClaudePrism contributor |
| aaronzhu ([@cityuaaronzhu](https://github.com/cityuaaronzhu)) | ClaudePrism contributor |
| [@opalsaints](https://github.com/opalsaints) | ClaudePrism contributor |

Open Prism itself is copyright [assistant-ui](https://github.com/assistant-ui).

If a name is missing or wrong, please open an issue.
