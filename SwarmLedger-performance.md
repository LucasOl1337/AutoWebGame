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
