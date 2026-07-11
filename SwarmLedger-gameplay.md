# Swarm Ledger — Gameplay

## Claims ativos

- Nenhum.

## Resultados

- 2026-07-11 — SOLO — **Concluída / parcialmente comprovada**. Escopo: `src/Engine/bot-ai.ts`, `tests/bot-breakable-safe-tiebreak-check.mjs` e este ledger. Antes: sem alvo vulnerável, o bot podia patrulhar sem favorecer uma oportunidade próxima de abrir caixa. Depois: após preservar fuga, perigo, power-up e posição de ataque contra alvo vulnerável, o bot busca uma posição segura adjacente a caixa destrutível. Evidência: `src/Engine/bot-ai.ts:258-284`; teste dedicado escolheu `right` rumo à caixa com inimigo protegido e `down` rumo ao inimigo vulnerável. Validação: `npm run compile:esm`; `node tests/bot-breakable-safe-tiebreak-check.mjs`; `npm run test:bot`; `npm run test:bot-target`; `npm run test:bot-survival`; `npm run test:bot-opening`; `npm run build`; `git diff --check`. Limitação: comportamento validado deterministicamente, sem sessão manual longa para medir impacto percebido. Commit: pendente no momento deste registro.
