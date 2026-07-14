# SwarmLedger - Bugs

## 2026-07-11 - Microintervencao de gameplay: cadencia do Sudden Death

- Classificacao: tuning de gameplay, baixo risco, alteracao isolada.
- Evidencia: `docs/progress.md` registra como proximo ajuste reduzir a agressividade do Sudden Death alterando `SUDDEN_DEATH_TICK_MS` (entao 800 ms); o teste deterministico existente cobre ativacao, fechamento, bloco, power-up, esmagamento e alarme.
- Escopo: somente `src/Engine/game-app.ts`, alterando a cadencia de fechamento de 800 ms para 900 ms; sem mudanca de duracao do round, ordem da espiral, dano, input, rede, assets ou UI.
- Resultado: implementado e validado por `npm run compile:esm`, `node tests/sudden-death-check.mjs`, `npm run build` e `git diff --check`.
- Validacao manual: nao executada; a mudanca e temporal e o repositorio proibe Playwright. O harness deterministico confirmou `tickMs: 900` e todos os comportamentos cobertos.
- Estado preexistente preservado: `index.html` modificado e demais ledgers/documento QA nao rastreados nao foram alterados nem incluidos no escopo.

## 2026-07-09 00:15 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-documentacao.md`
- Decisao: nenhuma correcao/teste de bug foi iniciado para evitar misturar trabalho do enxame de bugs com alteracoes existentes.

## 2026-07-09 00:35 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho e nao estava na branch `swarm/autowebgame/bugs`.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: nenhuma investigacao, correcao ou teste de bug foi iniciado para nao misturar trabalho do enxame de bugs com alteracoes existentes.

## 2026-07-09 00:54 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho e nao estava na branch `swarm/autowebgame/bugs`.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: nenhuma investigacao, correcao ou teste de bug foi iniciado para evitar misturar trabalho do enxame de bugs com alteracoes existentes.

# Swarm Ledger - bugs

## 2026-07-09T09:54:58-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:short-fuse-powerup` em `package.json` para tornar executavel o guard de regressao do powerup de fuse reduzido.
- Validacao: `npm run test:short-fuse-powerup` passou.
- Risco: baixo; mudanca limitada a script de teste existente e ledger do assunto.

## 2026-07-09T06:28:00-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:server-player-removal` em `package.json` para tornar executavel o guard de regressao da remocao de jogador em partida server-authoritative.
- Validacao: `npm run test:server-player-removal` passou.
- Risco: baixo; mudanca limitada a script de teste existente e ledger do assunto.

## 2026-07-09T05:55:03-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:growth-telemetry-uuid-fallback` em `package.json` para tornar executavel o guard de fallback de UUID da telemetria quando `crypto.randomUUID` nao existe.
- Validacao: `npm run test:growth-telemetry-uuid-fallback` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.

## 2026-07-09T03:14:20-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:roster-invalid-public-manifest` em `package.json` para tornar executavel o guard contra manifesto publico de personagens invalido.
- Validacao: `npm run test:roster-invalid-public-manifest` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.

## 2026-07-09T04:32:00-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:room-code-entry-normalization` em `package.json` para tornar executavel o guard de normalizacao de codigo de sala e links de convite colados.
- Validacao: `npm run test:room-code-entry-normalization` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.

## 2026-07-11 - Microintervencao de gameplay: cadencia do Sudden Death

- Classificacao: tuning de gameplay, baixo risco, alteracao isolada.
- Evidencia: `docs/progress.md` registra como proximo ajuste reduzir a agressividade do Sudden Death alterando `SUDDEN_DEATH_TICK_MS` (entao 800 ms); o teste deterministico existente cobre ativacao, fechamento, bloco, power-up, esmagamento e alarme.
- Escopo: somente `src/Engine/game-app.ts`, alterando a cadencia de fechamento de 800 ms para 900 ms; sem mudanca de duracao do round, ordem da espiral, dano, input, rede, assets ou UI.
- Resultado: implementado e validado por `npm run compile:esm`, `node tests/sudden-death-check.mjs`, `npm run build` e `git diff --check`.
- Validacao manual: nao executada; a mudanca e temporal e o repositorio proibe Playwright. O harness deterministico confirmou `tickMs: 900` e todos os comportamentos cobertos.
- Estado preexistente preservado: `index.html` modificado e demais ledgers/documento QA nao rastreados nao foram alterados nem incluidos no escopo.

## 2026-07-09 00:15 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-documentacao.md`
- Decisao: nenhuma correcao/teste de bug foi iniciado para evitar misturar trabalho do enxame de bugs com alteracoes existentes.

## 2026-07-09 00:35 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho e nao estava na branch `swarm/autowebgame/bugs`.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: nenhuma investigacao, correcao ou teste de bug foi iniciado para nao misturar trabalho do enxame de bugs com alteracoes existentes.

## 2026-07-09 00:54 -03:00

- Automation: AutoWebGame - Enxame Bugs Praticos
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado: bloqueado antes de investigar fluxo de usuario.
- Motivo: repositorio ja estava sujo por outro trabalho e nao estava na branch `swarm/autowebgame/bugs`.
- Evidencia objetiva:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: nenhuma investigacao, correcao ou teste de bug foi iniciado para evitar misturar trabalho do enxame de bugs com alteracoes existentes.
