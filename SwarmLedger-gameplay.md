# Swarm Ledger — Gameplay

## 2026-07-11 — bot-safe-crate-powerup-tiebreak

- Antes: entre posições seguras e equidistantes para abrir caixas, a BFS mantinha apenas a ordem fixa de vizinhos; no cenário dedicado, escolhia `right` embora a caixa à esquerda contivesse um power-up precomputado.
- Depois: somente no estágio de busca por caixa, candidatos seguros na mesma distância recebem desempate binário pela presença de power-up oculto/precomputado na caixa adjacente; sobrevivência, detonação remota e posicionamento de ataque continuam executados antes e sem novo score.
- Evidência determinística: `crateTieDecision={direction:"left",placeBomb:false}` e `vulnerableTargetDecision={direction:"down",placeBomb:false}`.
- Arquivos: `src/Engine/bot-ai.ts`, `tests/bot-breakable-safe-tiebreak-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
