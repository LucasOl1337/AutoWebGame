# Swarm Ledger — Gameplay

## 2026-07-12 — bot-bomb-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente exclusivamente ao score de `bomb-up` para bots, preservando o primeiro score alto, saturação em 0 no máximo, capacidade real, limites, drops, coleta, rede, segurança e demais prioridades.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: mudanças preexistentes fora desses três arquivos permaneceram intocadas e fora do commit seletivo.
- Antes → depois: a fórmula linear produzia `[460,420,380,340,0]` para capacidades `[1..5]`; agora o bônus acima da base 300 cai pela metade após o primeiro nível, produzindo `[460,380,340,320,0]`.
- Evidência focal: `bombScores=[460,380,340,320,0]` e `hasDiminishingBombReturns=true`; primeiro score alto e saturação em 0 foram preservados, assim como as verificações existentes de speed, flame, short-fuse, shield e atributos saturados.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF.

## 2026-07-12 — bot-flame-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente exclusivamente ao score de `flame-up` para bots, preservando score inicial de 460, saturação em 0, alcance real, limites, drops, coleta, rede, segurança e demais prioridades.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Antes/evidência da lacuna: a fórmula linear `260 + (MAX_RANGE - flameRange) * 40` produzia scores 460, 420, 380, 340 e 300 antes da saturação, mantendo ganhos tardios quase tão valiosos quanto o primeiro.
- Antes → depois: scores por alcance `[1..5]` mudaram de `[460,420,380,340,0]` para `[460,420,340,300,0]`; o primeiro ganho e a saturação foram preservados, enquanto o bônus acima da base 260 passa a cair pela metade.
- Evidência focal: `flameScores=[460,420,340,300,0]` e `hasDiminishingFlameReturns=true`; prioridades de mobilidade inicial, primeiro shield, descarte de atributos saturados, speed e short-fuse permaneceram aprovadas.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF.
- Preservação/revisão de escopo: mudanças preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs`, `DocsDev/swarm-coordination.md` e arquivos não rastreados permaneceram intocadas e fora do commit seletivo.

## 2026-07-12 — bot-short-fuse-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente exclusivamente ao score de `short-fuse-up` para bots, preservando nível 0 em 260, reduzindo nível 1 para 150 e mantendo saturação no nível 2 em 0; sem alterar fuse real, níveis máximos, drops, coleta, rede ou demais prioridades.
- Arquivos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Preservação: toda sujeira e mudanças alheias permanecem intocadas; sem commit.
- Resultado focal: `shortFuseScores=[260,150,0]` e `hasDiminishingShortFuseReturns=true`; nível 0 preservado, nível 1 reduzido e nível 2 saturado em 0.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. Sem commit.

## 2026-07-12 — input-repeat-preserves-latest-direction

- Claim/escopo antes da intervenção: ajustar exclusivamente `InputManager` para que `keydown` repetido pelo sistema operacional não reordene a prioridade direcional; preservar fila de presses, atalhos reservados, prevenção de scroll, aliases, blur/visibilidade e controles em campos interativos.
- Arquivos previstos: `src/Engine/input.ts`, novo teste focal `tests/input-repeat-direction-priority-check.mjs` e `SwarmLedger-gameplay.md`.
- Antes/evidência da lacuna: todo `keydown`, inclusive repetição de uma tecla já segurada, remove e reinsere seu código ao fim de `keyOrder`; assim, após segurar uma direção e pressionar outra, o auto-repeat da primeira pode indevidamente retomar o movimento sem nova ação física.
- Preservação: `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e demais mudanças alheias permaneceram intocados e fora do commit seletivo.
- Antes → depois: um `keydown` repetido de uma tecla já segurada reordenava `keyOrder` e podia roubar prioridade da direção fisicamente pressionada por último; agora a repetição continua sendo capturada/prevenida normalmente, mas retorna após manter `keysDown`, sem enfileirar novo press nem reordenar a direção.
- Evidência focal: `latestPhysicalPress="right"`, `afterOlderKeyRepeat="right"`, `repeatDidNotQueuePress=true`, `fallbackToHeldDirection="up"`, `pass=true`.
- Validação: `npm run compile:esm`; `node tests/input-repeat-direction-priority-check.mjs`; `node tests/input-transition-check.mjs`; `node tests/local-input-alias-check.mjs`; `node tests/input-visibility-clear-check.mjs`; `node tests/input-page-scroll-check.mjs`; `npm run build`; `git diff --check -- src/Engine/input.ts tests/input-repeat-direction-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente aviso de conversão LF→CRLF no ledger.

## 2026-07-12 — align-bot-sudden-death-tick-900ms

- Claim/escopo antes da intervenção: alinhar exclusivamente `SUDDEN_DEATH_TICK_MS` do bot ao runtime autoritativo já configurado em 900 ms; adicionar teste focal mínimo; preservar demais timings, comportamento e mudanças existentes; sem commit.
- Arquivos: `src/Engine/bot-ai.ts`, `tests/bot-sudden-death-tick-alignment-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Antes → depois: a projeção de impacto do sudden death na IA usava passos de 800 ms, enquanto `src/Engine/game-app.ts` executava o fechamento em passos de 900 ms; o bot agora usa 900 ms, eliminando a divergência de 100 ms por passo sem alterar o runtime.
- Evidência focal: teste lê as declarações fonte, fixa o runtime em 900 ms e exige igualdade do bot com o runtime (`botTickMs=900`, `runtimeTickMs=900`, `aligned=true`).
- Validação: `node tests/bot-sudden-death-tick-alignment-check.mjs`; `npm run compile:esm`; `node tests/bot-sudden-death-direction-tiebreak-check.mjs`; `npm run build`; `git diff --check -- src/Engine/bot-ai.ts tests/bot-sudden-death-tick-alignment-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos de conversão LF→CRLF nos dois documentos. Sem commit.

## 2026-07-12 — sudden-death-bfs-committed-direction-tiebreak

- Claim/escopo antes da intervenção: ajustar somente o desempate da BFS de sudden death em `src/Engine/bot-ai.ts`, favorecendo `botCommittedDirection` apenas quando os alvos têm distância e mérito equivalentes; criar teste focal e preservar fuga, segurança, prioridades estratégicas, ordem determinística sem compromisso e demais chamadas da BFS.
- Arquivos previstos: `src/Engine/bot-ai.ts`, novo teste focal em `tests/` e `SwarmLedger-gameplay.md`.
- Coordenação: nenhuma edição em `DocsDev`; mudanças alheias preexistentes foram preservadas, sem commit.
- Antes → depois: a busca de pressão de sudden death entregava o primeiro alvo válido na ordem fixa da BFS; agora passa um score binário que favorece a primeira etapa igual a `botCommittedDirection`, mas a BFS só compara candidatos da mesma distância que já satisfazem exatamente o mesmo predicado de segurança/mérito. Alvos mais próximos ou não equivalentes continuam prevalecendo; sem compromisso, a ordem anterior permanece.
- Evidência focal: `passesCommittedDirectionTieBreaker=true`, `bfsRestrictsTieBreakToSameDistance=true`, `predicateRunsBeforeTieBreaker=true`.
- Validação: `npm run compile:esm`; `node tests/bot-sudden-death-direction-tiebreak-check.mjs`; `node tests/bot-pickup-direction-tiebreak-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build` — todos concluídos com código 0 após corrigir duas vezes a extração do corpo no teste focal; a implementação compilou desde a primeira execução.
- Resultado validado e registrado no commit `64e8f26` (`feat(gameplay): stabilize sudden death bot movement`).

## 2026-07-12 — ux-powerup-spawn-pop-120ms

- Claim/escopo antes da intervenção: adicionar somente um pop visual de surgimento de power-up por aproximadamente 120 ms; preservar coleta, hitbox, distribuição/drop, sincronização online, fallback sem sprite e estado autoritativo.
- Arquivos: `src/Engine/game-app.ts`, `tests/powerup-spawn-pop-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- CodeGraph: `codegraph status .` confirmou índice atualizado; `codegraph context "power-up spawn visual pop animation rendering collection hitbox drop sync fallback"` localizou `drawPowerUp` e os contratos; `codegraph impact drawPowerUp` limitou o impacto a 5 símbolos do pipeline de render (`drawPowerUp`, `renderArena`, `render`, `renderMenu`, `GameApp`).
- Antes → depois: o pickup aparecia imediatamente em escala final; agora a revelação local registra somente um timestamp visual e `drawPowerUp` aplica escala centralizada de `0.72` até cerca de `1.10`, assentando em `1` após 120 ms. Pickups vindos de snapshot/sync sem timestamp são renderizados diretamente em escala 1, evitando reanimar reconciliações.
- Preservação: não houve mudança em `PowerUpState`, tile, colisão, coleta, criação/drop ou payload de rede; sprite e fallback textual passam pela mesma transformação visual. `index.html` e alterações concorrentes/preexistentes permaneceram intocados e fora do commit seletivo.
- Evidência focal: `durationMs=120`, `tracksRevealOnlyOnTransition=true`, `renderOnlyTransform=true`, `preservesFallback=true`, `doesNotChangeGeometry=true`.
- Validação: `npm run compile:esm`; `node tests/powerup-spawn-pop-check.mjs`; `node tests/powerup-render-legibility-check.mjs`; `node tests/powerup-max-level-preservation-check.mjs`; `node tests/powerup-drop-rate-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/powerup-spawn-pop-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0.
- Commit de implementação seletivo: `c16193a43390d56ece95360f1630e7bf78328324` (`feat(gameplay): add power-up spawn pop`); atualização final de evidência do ledger registrada em commit documental subsequente.

## 2026-07-12 — bot-speed-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente somente ao score de `speed-up` do bot depois do primeiro nível; preservar a prioridade excepcional do primeiro ganho, saturação, demais power-ups, sobrevivência, seleção de alvo, drops, coleta, estado e rede.
- Arquivos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Preservação: `index.html` modificado e arquivos não rastreados alheios permaneceram intocados; sem commit.
- Antes → depois: os níveis intermediários usavam a fórmula linear `120 + (MAX_SPEED_LEVEL - speedLevel) * 25`, produzindo scores 195, 170 e 145; agora o bônus acima da base 120 cai pela metade a cada nível, produzindo 240, 180 e 150. O primeiro nível continua em 460 e o máximo continua em 0.
- Evidência focal: `speedScores=[460,240,180,150,0]`, `hasDiminishingSpeedReturns=true`; o bot no nível base ainda escolheu `speed-up` sobre `bomb-up`, shield sem carga manteve precedência e atributos saturados continuaram ignorados.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0.

## 2026-07-11 — bot-stable-pickup-direction-tiebreak

- Claim/escopo antes da intervenção: entre pickups revelados com a mesma utilidade, distância e janela de segurança, preferir somente como desempate a rota cuja primeira etapa mantém `botCommittedDirection`; preservar prioridades de utilidade, fuga, perigo, ataque, abertura, pathfinding e estabilização geral.
- Arquivos previstos: `src/Engine/bot-ai.ts`, `tests/bot-pickup-direction-tiebreak-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Evidência da lacuna: `findValuablePowerUpDirection` agrupa por score, mas chama BFS sem `tieBreakerScore`; a BFS retorna o primeiro alvo equivalente conforme ordem fixa `up/down/left/right`, apesar de `botCommittedDirection` já existir no contexto.
- Preservação: mudanças alheias já presentes em arena, drop-rate, landing e ledgers foram mantidas e não entram no commit seletivo.
- Resultado: o desempate da BFS pode receber a primeira direção da rota; somente a busca de pickups equivalentes atribui score `1` à rota que mantém `botCommittedDirection` e `0` às demais. Sem direção comprometida, a ordem determinística anterior permanece.
- Evidência: cenário focal com dois `bomb-up` igualmente úteis, adjacentes e seguros escolheu `down` quando comprometido em `down`, e voltou a `up` pela ordem fixa quando o compromisso foi removido. Passaram `compile:esm`, teste focal, prioridade de power-up, estabilidade direcional, fuga de explosão própria, seleção de alvo, `build` e `git diff --check`.

## 2026-07-11 — remote-up-rarer-deterministic-pool

- Claim/escopo antes da intervenção: tornar `remote-up` mais raro somente no pool determinístico em `src/Arenas/arena.ts` e atualizar a expectativa correspondente em `tests/powerup-drop-rate-check.mjs`; preservar taxa global de drops, pareamento espelhado, geração de caixas, demais tipos, gameplay, IA e rede.
- Arquivos previstos: `src/Arenas/arena.ts`, `tests/powerup-drop-rate-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Preservação: `index.html` modificado e documentos não rastreados alheios não serão tocados nem incluídos.
- Antes: `remote-up` ocupava 1 de 12 posições do pool determinístico (8,33%).
- Depois: o pool foi ampliado para 23 entradas sem repetir `remote-up`, reduzindo seu peso nominal para 1/23 (4,35%); a taxa global de 0,65 e a seleção/espelhamento determinísticos permanecem inalterados.
- Resultado determinístico na arena padrão: 22 drops em 36 caixas (0,611), com `speed-up=10`, `flame-up=2`, `shield-up=4`, `short-fuse-up=2`, `bomb-pass-up=4` e zero nos demais tipos para esta seed/configuração.
- Validação: `npm run compile:esm`; `node tests/powerup-drop-rate-check.mjs`; `node tests/arena-runtime-contract-check.mjs`; `node tests/demolition-combo-drop-check.mjs`; `npm run build`; `git diff --check -- src/Arenas/arena.ts tests/powerup-drop-rate-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0.

## 2026-07-11 — bot-base-speed-survival-priority

- Claim/escopo antes da intervenção: ajustar somente o score de `speed-up` para bots ainda no nível base, fazendo mobilidade inicial concorrer acima de upgrades ofensivos; preservar fuga, segurança de rota, drops, coleta, níveis máximos, estado e rede.
- Evidência de escolha: `getPowerUpPriorityScore` já centraliza a decisão estratégica de pickups, mas no nível base retorna 195 para velocidade, abaixo de `bomb-up` (420), `flame-up` (380) e `short-fuse-up` (260), apesar de mobilidade sustentar fuga no loop principal.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Preservação: `index.html` modificado e documentos não rastreados alheios não foram tocados nem incluídos.
- Antes → depois: com `speedLevel=0`, `speed-up` tinha score 195 e perdia para `bomb-up` 420; agora o primeiro `speed-up` vale 460, enquanto níveis intermediários, saturação e todos os demais tipos mantêm os scores existentes.
- Evidência: no cenário equidistante, `preferSpeedDecision={direction:"up",placeBomb:false}` e `prefersBaseMobility=true`; shield sem carga continuou priorizado, speed saturado foi ignorado e bomb saturada cedeu ao shield.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos com código 0. Diff revisado e limitado aos quatro arquivos reivindicados.

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
