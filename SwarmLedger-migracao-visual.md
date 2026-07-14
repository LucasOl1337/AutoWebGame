# SwarmLedger - migracao visual

## 2026-07-09T00:16:11.4084708-03:00

- Automacao: `autowebgame-enxame-migra-o-visual`.
- Rodada bloqueada antes de edicoes visuais.
- Motivo: repositorio ja estava em `swarm/autowebgame/documentacao`, nao na branch do enxame visual, com alteracoes nao relacionadas detectadas por `git status --short --branch`.
- Estado observado:
  - `M index.html`
  - `?? AutoWebGame/`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-documentacao.md`
- Acao tomada: nenhuma migracao visual implementada; este ledger foi criado apenas para registrar o bloqueio, conforme regra fixa da automacao.
- Observacao CodeGraph: `codegraph status .` encontrou indice, mas com mudancas pendentes (`Added: 125 files`, `Modified: 25 files`, `Removed: 1 files`); nao houve uso para mudanca estrutural nesta rodada.

## 2026-07-09T00:35:58.2243320-03:00

- Automacao: `autowebgame-enxame-migra-o-visual`.
- Rodada bloqueada antes de edicoes visuais.
- Motivo: repositorio continua fora da branch do enxame visual, em `swarm/autowebgame/documentacao`, com alteracoes nao relacionadas detectadas por `git status --short --branch`.
- Estado observado:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Acao tomada: nenhuma migracao visual implementada; nenhuma troca de branch realizada; bloqueio registrado conforme regra fixa da automacao.
- Observacao CodeGraph: `codegraph status .` respondeu para `C:\projetos` com indice existente, mas pendente (`Added: 125 files`, `Modified: 25 files`, `Removed: 1 files`); nao houve mudanca estrutural.

## 2026-07-09T00:55:43.1350347-03:00

- Automacao: `autowebgame-enxame-migra-o-visual`.
- Rodada bloqueada antes de edicoes visuais.
- Motivo: repositorio permanece fora da branch do enxame visual, em `swarm/autowebgame/documentacao`, com alteracoes nao relacionadas detectadas por `git status --short --branch`.
- Estado observado:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Acao tomada: nenhuma migracao visual implementada; nenhuma troca de branch realizada; bloqueio registrado conforme regra fixa da automacao.
- Observacao CodeGraph: `codegraph status .` respondeu para `C:\projetos` com indice existente, mas pendente (`Added: 121 files`, `Modified: 24 files`, `Removed: 1 files`); nao houve mudanca estrutural.

# Swarm Ledger - migracao-visual

## 2026-07-09T08:33:40-03:00

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: exposto `test:landing-visual-token` no `package.json` para rodar o contrato visual da landing via npm.
- Validacao: `npm run test:landing-visual-token` passou.
- Risco: baixo; altera apenas script npm e ledger.

## 2026-07-09T06:10:21-03:00 - Governor

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: normalizou `letter-spacing` negativo em titulos e nomes do shell visual para `0`, preservando tamanhos, layout e tokens existentes.
- Validacao: `npm run test:touch-focus-css` passou; varredura `rg "letter-spacing:\s*-" src\UiLayouts\main.css` sem ocorrencias.
- Risco: baixo; alteracao CSS pontual sem tocar fluxo de jogo, online ou worker.

## 2026-07-09 - governor

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: adicionado gate `tests/landing-visual-token-check.mjs` para proteger tokens visuais semanticos da landing e impedir retorno das cores gold legadas.
- Validacao: `node tests/landing-visual-token-check.mjs`
- Risco: baixo; teste textual novo, sem alteracao de runtime.
- Proxima sugestao: adicionar script npm dedicado quando houver outro gate de migracao visual relacionado.
