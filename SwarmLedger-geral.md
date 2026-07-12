# Swarm Ledger - geral

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de burst de partida perfeita como `npm run test:perfect-start-burst`.
- Arquivos: `package.json`
- Validacao: `npm run test:perfect-start-burst` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de lazy load do sound manager como `npm run test:sound-manager-lazy-load`.
- Arquivos: `package.json`
- Validacao: `npm run test:sound-manager-lazy-load` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de storage resiliente da growth telemetry como `npm run test:growth-telemetry-storage`.
- Arquivos: `package.json`
- Validacao: `npm run test:growth-telemetry-storage` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Executor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de limite de feedback como `npm run test:feedback-length-guard`.
- Arquivos: `package.json`
- Validacao: `npm run test:feedback-length-guard` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Executor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente do contador live do feedback como `npm run test:feedback-live-counter`.
- Arquivos: `package.json`
- Validacao: `npm run test:feedback-live-counter` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de normalizacao de codigo de sala como `npm run test:room-code-entry-normalization`.
- Arquivos: `package.json`
- Validacao: `npm run test:room-code-entry-normalization` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de visibilidade de release como `npm run test:release-visibility`.
- Arquivos: `package.json`
- Validacao: `npm run test:release-visibility` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.


## 2026-07-11 - Bot prioriza o primeiro escudo

- Automacao: `autowebgame-enxame-geral`
- Escopo: pequena intervencao de gameplay isolada na prioridade de coleta dos bots; nenhum arquivo alheio foi revertido.
- Classificacao: gameplay / IA de sobrevivencia, baixo risco, comportamento compartilhado local e servidor por meio de `getPowerUpPriorityScore`.
- Mudanca: bot sem cargas de escudo agora atribui prioridade 500 ao primeiro `shield-up`, acima de upgrades ofensivos; cargas seguintes preservam a prioridade gradual anterior.
- Prova: `tests/bot-powerup-priority-check.mjs` cobre escudo versus bomba em distancia equivalente e manteve os cenarios anteriores.
- Validacao: `npm run test:bot-powerup` e `npm run build` passaram.

## 2026-07-09 00:55 BRT - Rodada bloqueada por branch/worktree de outro enxame

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md` e `SwarmLedger-ready-to-ship.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar arquivos, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git status --short --branch`, `git diff --name-status` e `git ls-files --others --exclude-standard` confirmaram o estado acima.

## 2026-07-09 - Rodada bloqueada por worktree sujo

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md` e `SwarmLedger-documentacao.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar arquivos, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git status --short --branch` retornou `## swarm/autowebgame/documentacao` com as alteracoes acima.
- Observacao final: uma nova checagem tambem mostrou `SwarmLedger-bugs.md` untracked; arquivo nao inspecionado nem alterado por esta rodada.

## 2026-07-09 00:35 BRT - Rodada bloqueada por branch/worktree de outro enxame

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md` e `SwarmLedger-ready-to-ship.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar `index.html` ou ledgers de outros enxames, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git -C C:\Projetos\AutoWebGame status --short --branch` retornou `## swarm/autowebgame/documentacao` com as alteracoes acima.
