# SwarmLedger - Ready To Ship

## 2026-07-09 00:57 -03:00

- Automacao: `autowebgame-enxame-ready-to-ship`
- Resultado: bloqueada antes de alterar produto.
- Motivo: repositorio esta em `swarm/autowebgame/documentacao`, nao em `swarm/autowebgame/ready-to-ship`, com alteracoes locais ja presentes.
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
- Decisao: nenhuma mudanca de produto, build, teste, commit, merge, push, PR ou deploy executado nesta rodada.
- Validacao: `codegraph status .` retornou indice atualizado e `git status --short --branch` confirmou a branch/sujeira antes de alteracoes de produto.
- Proximo passo: concluir, commitar ou isolar a rodada de documentacao antes de retomar ready-to-ship.

## 2026-07-09 00:36 -03:00

- Automacao: `autowebgame-enxame-ready-to-ship`
- Resultado: bloqueada antes de alterar produto.
- Motivo: repositorio ainda estava em `swarm/autowebgame/documentacao`, nao na branch `swarm/autowebgame/ready-to-ship`, com alteracoes nao commitadas e ledgers nao rastreados.
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
- Decisao: nenhuma mudanca de produto, build, teste, commit, merge, push, PR ou deploy executado nesta rodada.
- Validacao: `git status --short --branch` confirmou a branch e a sujeira antes de qualquer alteracao de produto.
- Proximo passo: concluir/commitar/stashar a rodada de documentacao antes de retomar ready-to-ship.

## 2026-07-09 00:16 -03:00

- Automacao: `autowebgame-enxame-ready-to-ship`
- Resultado: bloqueada antes de alterar produto.
- Motivo: repositório já estava em `swarm/autowebgame/documentacao`, não na branch `swarm/autowebgame/ready-to-ship`, com alterações não commitadas.
- Estado observado:
  - `M index.html`
  - `?? AutoWebGame/`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-documentacao.md`
- Decisao: nenhuma mudança de produto, build, teste, commit, merge, push, PR ou deploy executado nesta rodada.
- Proximo passo: limpar/concluir a rodada de documentacao ou mover esse trabalho antes de retomar ready-to-ship.

# Swarm Ledger - ready-to-ship

## 2026-07-09 - Runnable release visibility gate

- Branch: `swarm-gov/autowebgame/ready-to-ship`
- Change: exposed the existing release badge/notes visibility check as `npm run test:release-visibility` for ready-to-ship verification.
- Validation: `npm run test:release-visibility` passed.
- Risk: low; package script only, no runtime behavior change.

## 2026-07-09 - Runnable README release gate

- Branch: `swarm-gov/autowebgame/ready-to-ship`
- Change: exposed the existing README release gate as `npm run test:readme-release-gates` so release hygiene can be run through the normal script surface.
- Validation: `npm --prefix C:\Projetos\AutoWebGame-swarm-governor run test:readme-release-gates` passed.
- Risk: low; package script only, no runtime behavior change.

## 2026-07-09 - README release gate

- Branch: `swarm-gov/autowebgame/ready-to-ship`
- Change: added `tests/readme-release-gates-check.mjs` to verify that README release-oriented `npm run` commands still exist in `package.json`, include the build gate, and do not include deploy/publish/seed/migration commands.
- Validation: `node tests/readme-release-gates-check.mjs` passed.
- Risk: low; test-only release hygiene gate.
