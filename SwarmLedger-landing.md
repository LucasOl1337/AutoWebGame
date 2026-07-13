# SwarmLedger - Landing

## 2026-07-12 - Referência de detonação remota na landing

- Sessão: `ux-landing-remote-control-reference`.
- Antes: a referência local mostrava movimento, bomba (`Q`) e ultimate, mas não a detonação remota.
- Depois: a landing mostra `R` como tecla real do jogador 1 para detonar bomba remota, com copy PT/EN e indicação de que requer controle remoto.
- Arquivos de implementação: `src/UiLayouts/i18n.ts`, `src/NetCode/session-client.ts`.
- Teste focal novo: `tests/landing-remote-control-reference-check.mjs`.
- Evidências: `npm run compile:esm` passou; `node tests/landing-remote-control-reference-check.mjs` retornou `{"pt":true,"en":true,"player1Key":"R","pass":true}`; `npm run build` passou (42 módulos, 2.54s); `git diff --check -- src/UiLayouts/i18n.ts src/NetCode/session-client.ts tests/landing-remote-control-reference-check.mjs DocsDev/swarm-coordination.md SwarmLedger-landing.md` passou, apenas com avisos LF/CRLF.
- Preservação: `src/Engine/game-app.ts`, `index.html`, `tests/remote-detonation-check.mjs` e demais mudanças alheias não foram editados nesta intervenção.
- Commit: não realizado.

## 2026-07-09T00:16:25-03:00 - Bloqueio por worktree sujo

- Automacao: `autowebgame-enxame-landing-page`
- Objetivo da rodada: melhorar a entrada comercial/landing page do AutoWebGame.
- Estado encontrado antes de editar: branch atual `swarm/autowebgame/documentacao`, nao `main` e nao `swarm/autowebgame/landing`.
- `git status -sb` indicou trabalho pendente de outro fluxo:
  - `M index.html`
  - `?? AutoWebGame/`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
- Decisao: encerrar sem alterar landing, sem trocar branch e sem commit, conforme regra fixa do enxame para repo sujo/conflito.
- Rechecagem apos registrar este ledger confirmou que o worktree ainda estava sujo em `swarm/autowebgame/documentacao`, incluindo `M index.html` e ledgers nao rastreados de outros enxames (`SwarmLedger-bugs.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-ready-to-ship.md`, entre outros).

## 2026-07-09T00:50:00-03:00 - Rebloqueio por branch/worktree sujo

- Automacao: `autowebgame-enxame-landing-page`
- Objetivo da rodada: implementar uma melhoria concreta na entrada comercial/landing page.
- Estado encontrado antes de editar: branch atual `swarm/autowebgame/documentacao`, nao `main` e nao `swarm/autowebgame/landing`.
- `git status --short --branch` indicou trabalho pendente existente:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: encerrar sem trocar branch, sem editar landing e sem commit, conforme regra fixa do enxame para repo sujo/conflito.

## 2026-07-09T00:55:41-03:00 - Bloqueio mantido por branch/worktree sujo

- Automacao: `autowebgame-enxame-landing-page`
- Objetivo da rodada: melhorar a pagina/entrada comercial do produto com uma mudanca visual, de copy, responsiva ou de conversao.
- Estado encontrado antes de editar: branch atual `swarm/autowebgame/documentacao`, nao `main` e nao `swarm/autowebgame/landing`.
- `git -C C:\Projetos\AutoWebGame status --short --branch` indicou trabalho pendente existente:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: encerrar sem trocar branch, sem editar landing e sem commit, conforme regra fixa do enxame para repo sujo/conflito.
