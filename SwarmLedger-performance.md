# SwarmLedger - Performance

## 2026-07-09 00:56:03 -03:00 - bloqueado por estado sujo

- Automation ID: `autowebgame-enxame-performance`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado do git antes de editar:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: encerrado sem medir, otimizar, commitar, trocar de branch ou iniciar servidor porque o repo ja continha trabalho de outro enxame/execucao.
- Observacao: o primeiro `git status` executado fora do subdiretorio real retornou que `C:\Projetos` nao e repositorio; a checagem corrigida em `C:\Projetos\AutoWebGame` confirmou o bloqueio acima.
- Proximo passo sugerido: concluir, commitar ou guardar o trabalho atual e reexecutar a automacao para medir um gargalo real na branch `swarm/autowebgame/performance`.

## 2026-07-09 00:34:00 -03:00 - bloqueado por estado sujo

- Automation ID: `autowebgame-enxame-performance`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado do git antes de editar:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-performance.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: encerrado sem medir, otimizar, commitar, trocar de branch ou iniciar servidor porque o repo ja continha trabalho de outro enxame/execucao.
- Evidencia adicional: `codegraph status .` esta saudavel e sincronizado para `C:\Projetos\AutoWebGame`, mas a regra fixa de workspace limpo bloqueou a execucao de performance.
- Proximo passo sugerido: concluir, commitar ou guardar o trabalho atual e reexecutar a automacao para medir um gargalo real na branch `swarm/autowebgame/performance`.

## 2026-07-09 00:17:26 -03:00 - bloqueado por estado sujo

- Automation ID: `autowebgame-enxame-performance`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado do git antes de editar:
  - `M index.html`
  - `?? DocsDev/qa-browser-loop.md`
  - `?? SwarmLedger-bugs.md`
  - `?? SwarmLedger-documentacao.md`
  - `?? SwarmLedger-geral.md`
  - `?? SwarmLedger-landing.md`
  - `?? SwarmLedger-migracao-visual.md`
  - `?? SwarmLedger-ready-to-ship.md`
- Decisao: encerrado sem medir, otimizar, commitar ou trocar de branch porque o repo ja continha trabalho de outro enxame/execucao.
- Proximo passo sugerido: concluir, commitar ou guardar o trabalho atual e reexecutar a automacao para medir um gargalo real na branch `swarm/autowebgame/performance`.

# Swarm Ledger - performance

## 2026-07-09T05:59:43-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/performance`
- Entrega: `GrowthTelemetryClient.normalizeRecord` agora percorre as chaves do contexto/payload sem alocar `Object.entries()` por evento, reduzindo trabalho no caminho quente de tracking.
- Validacao: `npm run test:growth-telemetry-retry`
- Risco: baixo; mantem a filtragem de `undefined`, truncamento de strings e somente chaves proprias do objeto de entrada.

## 2026-07-09T04:55:00-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/performance`
- Entrega: `loadStaticDirectionalSprites` agora dispara sprites base e ciclos opcionais de animacao em um unico `Promise.all`, removendo espera sequencial entre idle/walk/run/cast/attack/death no carregamento de personagens.
- Validacao: `npm run test:character-sprite-fallback`
- Risco: baixo; mantem o contrato de fallback e altera apenas a concorrencia do carregamento de assets de personagem.

## 2026-07-09T03:33:37-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/performance`
- Entrega: `SpriteTrimCache` agora reaproveita o tamanho do canvas interno quando sprites consecutivas têm as mesmas dimensões, evitando resets desnecessários de canvas durante cálculo de bounds.
- Validação: `npm run test:sprite-trim`
- Risco: baixo; alteração restrita a cache de trim de sprite e teste dedicado.
