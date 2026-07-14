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

# Swarm Ledger - landing

## 2026-07-09T08:17:56.1716580Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: adiciona skip link focado por teclado e landmark `<main id="main-content">` envolvendo o conteudo principal da landing publica.
- Validacao:
  - `npm run test:commercial-release-flow`
  - PowerShell contract check para `skip-link`, `main-content`, CSS de foco e ordem antes do footer.
- Risco: baixo; link fica oculto fora de foco e nao altera o fluxo visual normal.
- Proxima sugestao: criar um teste dedicado de contrato estatico para acessibilidade basica da landing.

## 2026-07-09T09:05:29.2139688Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: reforca `tests/how-to-play-page-check.mjs` para validar que a landing publica mantem skip link, destino `main-content` e ordem correta antes do footer.
- Validacao:
  - `npm run test:how-to-play-page`
- Risco: baixo; altera apenas contrato estatico de HTML publico e nao muda runtime.
- Proxima sugestao: expor esse gate no checklist ready-to-ship quando a landing publica for alterada.

## 2026-07-09T11:09:32.1828003Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: adiciona nome acessivel para a navegacao principal e para CTAs publicos que entram no jogo.
- Validacao:
  - `npm run test:how-to-play-page`
  - PowerShell contract check para `aria-label="Navegacao principal"` e CTAs `/game` com `aria-label="Jogar BOMBA PvP agora"`.
- Risco: baixo; altera apenas atributos semanticos no HTML da landing, sem mudar layout ou runtime.
- Proxima sugestao: promover o contrato de CTAs da landing para um teste dedicado quando houver novo gate de acessibilidade.

## 2026-07-09T13:34:10.0000000Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: adiciona `test:landing-page` com contrato estatico para titulo, skip link, landmark, navegacao principal, CTAs `/game`, secoes e links de confianca da landing publica.
- Validacao:
  - `npm run test:landing-page`
- Risco: baixo; altera apenas gate estatico e script npm, sem runtime de produto.
- Proxima sugestao: incluir `npm run test:landing-page` no checklist ready-to-ship da landing publica.
