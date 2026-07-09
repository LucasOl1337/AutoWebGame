# Swarm Ledger - performance

## 2026-07-09T03:33:37-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/performance`
- Entrega: `SpriteTrimCache` agora reaproveita o tamanho do canvas interno quando sprites consecutivas têm as mesmas dimensões, evitando resets desnecessários de canvas durante cálculo de bounds.
- Validação: `npm run test:sprite-trim`
- Risco: baixo; alteração restrita a cache de trim de sprite e teste dedicado.
