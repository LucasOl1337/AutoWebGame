# Swarm Ledger — Gameplay

## 2026-07-11 — ux-maxed-powerup-hud-feedback

- Claim/escopo antes da intervenção: alterar somente o feedback de toque em power-up já maximizado em `src/Engine/game-app.ts`, com teste focal novo; preservar item, níveis máximos, aplicação, drops, áudio, rede e demais regras.
- Antes → depois: o item saturado já permanecia no mapa, mas o toque não tinha resposta; agora o fluxo reutiliza `PowerUpPickupNotice` por 2200 ms e mostra `MAX` no HUD, sem marcar o item como coletado nem alterar o atributo do jogador.
- Arquivos: `src/Engine/game-app.ts`, `tests/powerup-max-hud-feedback-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Evidência: teste focal retornou `maxFeedback=true`, `itemPreserved=true`, `rulesPreserved=true`; teste de preservação confirmou item disponível e coleta posterior quando útil; regressão de slots/expiração do HUD passou.
- Validação: `codegraph status .`; `codegraph context "power-up pickup maximized HUD feedback"`; `npm run compile:esm`; `node tests/powerup-max-hud-feedback-check.mjs`; `node tests/powerup-max-level-preservation-check.mjs`; `node tests/powerup-hud-slots-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/powerup-max-hud-feedback-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos com código 0. Diff revisado; `index.html` e arquivos não rastreados alheios permaneceram intactos.

## 2026-07-11 — bot-skip-saturated-pickup

- Claim/escopo antes da intervenção: ajustar somente a seleção de pickups do bot em `src/Engine/bot-ai.ts`, reutilizando o teste existente `tests/bot-powerup-priority-check.mjs`, para ignorar como alvo prioritário o item cujo atributo correspondente já atingiu o limite; prioridades de fuga/sobrevivência, ataque, drops, coleta e estado permanecem inalteradas.
- Preservação: `index.html` modificado e arquivos não rastreados alheios não foram tocados; sem commit.
- Antes → depois: a busca estratégica dependia apenas do score de prioridade para descartar upgrades no limite; agora exclui explicitamente, antes de agrupar/rotear, qualquer pickup cujo atributo correspondente esteja saturado via contrato compartilhado `isPowerUpMaxed`, enquanto pickups úteis continuam concorrendo por prioridade e segurança.
- Evidência: o cenário existente ampliado produziu `saturatedAttributeDecision={direction:"down",placeBomb:false}`, ignorando `bomb-up` ao norte com `maxBombs=MAX_BOMBS` e preferindo o primeiro `shield-up` ao sul (`shieldCharges=0`). `codegraph status .` confirmou índice atualizado; `codegraph context "bot powerup priority saturated max level survival"`, `codegraph impact bot-ai.ts` e `codegraph impact isPowerUpMaxed` limitaram a mudança à seleção do bot e ao helper compartilhado já existente.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Engine/bot-ai.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0. Diff revisado; apenas os quatro arquivos reivindicados foram alterados por esta intervenção.

## 2026-07-11 — ux-powerup-render-legibility

- Claim/escopo antes da intervenção: melhorar exclusivamente a legibilidade visual dos power-ups em `drawPowerUp`; sem alterar balanceamento, estado, drops, coleta, tipos ou rede.
- Arquivos: `src/Engine/game-app.ts`, `tests/powerup-render-legibility-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Antes: quando havia sprite, `drawPowerUp` desenhava a imagem em todo o tile, sem uma camada de contraste própria para separá-la visualmente dos pisos e temas da arena.
- Depois: o ramo de sprite desenha uma silhueta circular escura com contorno claro e aplica inset de 2 px ao sprite; o fallback existente, definições, estado e regras permanecem inalterados.
- Evidência comprovada: `codegraph status .` indicou índice atualizado; `codegraph context "drawPowerUp power-up rendering visual direction"` localizou o método; `codegraph impact drawPowerUp` limitou o impacto estrutural a 5 símbolos de render. `node tests/powerup-render-legibility-check.mjs`, `npm run compile:esm`, `node tests/powerup-hud-slots-check.mjs`, `node tests/powerup-drop-rate-check.mjs`, `npm run build` e `git diff --check -- src/Engine/game-app.ts tests/powerup-render-legibility-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` passaram.
- Avaliação: comprovado por inspeção/teste que há fundo escuro, contorno claro, margem e nenhuma atribuição a estado dentro de `drawPowerUp`; ganho perceptual em jogo é experimental, pois não foi feita inspeção visual humana/browser nesta intervenção.
- Preservação: `index.html` modificado e arquivos não rastreados alheios permaneceram intactos; sem commit.

## 2026-07-11 — breakable-powerup-drop-rate-065

- Escopo antes da intervenção: reduzir experimentalmente `BREAKABLE_POWERUP_DROP_RATE` de `0.75` para `0.65`, atualizar somente as expectativas determinísticas afetadas pelo resultado real e validar regressões focadas; sem alterar pesos por tipo, geração de caixas, IA, combos ou código de rede.
- Arquivos previstos: `src/Arenas/arena.ts`, `tests/powerup-drop-rate-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: mudanças alheias preexistentes em `index.html` e arquivos não rastreados fora deste escopo não serão alteradas.
- Resultado: a taxa `0.65` gerou deterministicamente 22 drops em 36 caixas (`0.611`), contra 26/36 (`0.722`) na expectativa anterior; contagens por tipo: `bomb-up=0`, `flame-up=8`, `speed-up=4`, `remote-up=0`, `shield-up=0`, `short-fuse-up=2`, `bomb-pass-up=6`, `kick-up=2`.
- Evidências: `npm run test:powerup-drop-rate`, `npm run test:bot-powerup`, `npm run test:demolition-combo` e `npm run build` passaram sequencialmente; o teste de drop confirmou `hasExpectedDeterministicDistribution=true`, `hasTacticalDrops=true`, `specialDropCount=10` e `pass=true`.

## 2026-07-11 — immutable-powerup-definitions

- Classificação: robustez de gameplay, baixo risco, alteração isolada de contrato.
- Evidência: `getPowerUpDefinition` expõe objetos usados para limites de coleta, prioridade de bot, HUD e render; o CodeGraph apontou 8 símbolos afetados. Como o retorno era mutável, qualquer consumidor podia alterar em runtime `maxLevel`, `tint` ou identidade e desalinhar regras compartilhadas.
- Escopo: tornar propriedades de `PowerUpDefinition` e o registro de definições somente leitura em TypeScript; sem alterar valores, drops, aplicação, balanceamento, rede, UI ou render.
- Arquivos: `src/Gameplay/powerups.ts`, `SwarmLedger-gameplay.md`.
- Validação: `npm run compile:esm`, testes focados de preservação/prioridade/HUD de power-ups, `npm run build` e `git diff --check` passaram; `npm test` não existe no `package.json`.
- Estado preexistente preservado: `index.html` modificado e documentos/ledgers não rastreados não foram alterados nem incluídos.

## 2026-07-11 — preserve-maxed-powerup

- Escopo: impedir que um jogador no nível máximo consuma um power-up que não produz efeito, preservando-o para outro jogador; sem alterar drops, níveis máximos, rede ou renderização.
- Antes: `collectPowerUps` marcava todo item tocado como coletado antes de aplicar o limite, então um `bomb-up` sumia mesmo com `maxBombs` já no máximo.
- Depois: itens cujo tipo já está maximizado são deixados no mapa; assim que o jogador pode se beneficiar, a coleta e o incremento normais continuam.
- Arquivos: `src/Engine/game-app.ts`, `tests/powerup-max-level-preservation-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.

## 2026-07-11 — bot-safe-crate-powerup-tiebreak

- Antes: entre posições seguras e equidistantes para abrir caixas, a BFS mantinha apenas a ordem fixa de vizinhos; no cenário dedicado, escolhia `right` embora a caixa à esquerda contivesse um power-up precomputado.
- Depois: somente no estágio de busca por caixa, candidatos seguros na mesma distância recebem desempate binário pela presença de power-up oculto/precomputado na caixa adjacente; sobrevivência, detonação remota e posicionamento de ataque continuam executados antes e sem novo score.
- Evidência determinística: `crateTieDecision={direction:"left",placeBomb:false}` e `vulnerableTargetDecision={direction:"down",placeBomb:false}`.
- Arquivos: `src/Engine/bot-ai.ts`, `tests/bot-breakable-safe-tiebreak-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
