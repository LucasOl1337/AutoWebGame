## 2026-07-15 — match-win-priority-over-round-end
- Escopo: correção mínima em `src/Engine/sound-manager.ts`, novo teste focal e acréscimos isolados nos dois ledgers; preservar diffs concorrentes; commit local seletivo; sem push/deploy.
- RED → GREEN: antes, chamadas consecutivas de `roundEnd` e `matchWin` no mesmo turno tocavam os dois cues (`1/1`, exit 1); agora `roundEnd` aguarda uma microtask e é invalidado por `matchWin`, resultando em `roundEnd=0`, `matchWin=1` e `pass=true`.
- Implementação: token monotônico privado adia apenas `roundEnd`; qualquer `matchWin` imediato invalida o pedido pendente, sem alterar call sites nem os demais sons.

## 2026-07-14 — crate-break-deterministic-timbre-variation
- Claim/escopo: investigar se `crateBreak` repete timbre idêntico e, somente com RED comprobatório, adicionar variação determinística mínima reutilizando áudio existente; alterar apenas `src/Engine/sound-manager.ts`, `tests/sound-manager-variation-check.mjs` e os dois ledgers; sem dependência, push ou deploy; preservar diffs alheios.
- RED → GREEN: RED comprovou `crateBreakVariationPass: false` com taxas `[1, 1]`; GREEN comprovou `crateBreakVariationPass: true` com taxas `[0.98, 1.02]`.
- Antes → depois: o mesmo `shield_block_deflect.mp3` permanece reutilizado, mas `crateBreak` agora alterna deterministicamente playback rate `0.98/1.02`, sem asset ou dependência nova.
- Validações reais: `node tests/sound-manager-variation-check.mjs`, `npm run compile:esm`, `npm run test:sound-manager-lifecycle`, `npm run test:sound-playback-retry`, `npm run test:sound-unlock`, `npm run build` (59 módulos) e `git diff --check -- 'src/Engine/sound-manager.ts' 'tests/sound-manager-variation-check.mjs' 'DocsDev/swarm-coordination.md' 'SwarmLedger-gameplay.md'` passaram. `npm run test:sound-manager-lazy-load` continua falhando pela condição alheia preexistente (`manifestEntries: 13` versus expectativa 12); seu arquivo não foi alterado.

## 2026-07-14 — player-death-shadow-alpha
- Claim/escopo: sessão `player-death-shadow-alpha`; alterar somente `src/Engine/game-app.ts`, criar `tests/player-death-shadow-feedback-check.mjs` e atualizar os dois ledgers; não tocar em outros hunks/diffs; commit local seletivo; sem push/deploy.
- Status: concluído.
- Classificação: Comprovada.
- Antes → depois: a sombra do jogador ignorava o alpha visual `0.35` aplicado após a morte; agora recebe o mesmo alpha em um bloco `save`/`restore`, mantendo `alpha = 1` e a aparência original da sombra enquanto o jogador está vivo.
- Evidências: o teste focal observou `deadFallbackAlpha: 0.35`, `liveAlpha: 1`, `shadowUsesVisualAlpha: true` e `shadowStateIsolated: true`.
- Validações: `node tests/player-death-shadow-feedback-check.mjs`, `npm run compile:esm`, `npm run build` com 58 módulos transformados e `git diff --check` aprovados.

## 2026-07-14 — solo-short-fuse-over-residual-flame
- Claim/escopo: avaliar, sem tocar em outros diffs, se o primeiro Short Fuse deveria superar por um ponto um suposto Flame Up residual de valor 260; arquivos funcionais inicialmente previstos: `src/Gameplay/powerups.ts` e `tests/bot-powerup-priority-check.mjs`.
- Resultado: intervenção encerrada sem mudança funcional e sem commit. O teste RED mostrou `firstShortFuseScore: 260`, mas `flameRange: 8` já está saturado e retorna `residualFlameScore: 0`; a curva jogável validada é `[460, 340, 300, 280, 0]`, portanto `MAX_RANGE` impede o empate usado como premissa.
- Classificação final: Inadequada — a evidência refutou a oportunidade antes da implementação. O teste focal foi restaurado integralmente; nenhum balanceamento foi alterado.
- Validação: `npm run test:bot-powerup` produziu exit 1 esperado no RED da hipótese; depois da restauração, validações finais registradas abaixo. Diffs alheios preservados; sem push/deploy.

## 2026-07-14 — power-collect-three-variant-cycle
- Claim/escopo: alterar somente `src/Engine/sound-manager.ts`, `tests/sound-manager-variation-check.mjs` e os dois ledgers; preservar diffs alheios; commit seletivo pendente; sem push/deploy.
- Antes → depois: `powerCollect` alternava deterministicamente apenas 2 variants; agora percorre 3 variants deterministicamente antes de repetir, na sequência `0,1,2,0`.
- Classificação: comprovada técnica; impacto perceptivo experimental.
- Evidências/validações: RED alternava somente 2 variants; GREEN observou a sequência `0,1,2,0`; validações focal, lifecycle, retry, build e diff-check aprovadas.

## 2026-07-14 — pickup-chain-duplicate-no-refresh
- Claim/escopo: alterar somente `src/Gameplay/pickup-chain.ts`, fortalecer `tests/pickup-chain-guard-check.mjs` e acrescentar registros aos dois documentos de coordenação; preservar toda sujeira alheia; sem commit, push ou deploy.
- Antes → depois: um pickup do mesmo tipo durante uma janela ativa reatribuía `PICKUP_CHAIN_WINDOW_MS` e renovava 3700 ms para 4200 ms; agora retorna `false` sem alterar `previousType` nem renovar `remainingMs`, que segue decaindo normalmente (3700 ms antes da coleta e 3683 ms após o tick de 17 ms).
- Evidência RED → GREEN: com a nova expectativa, a implementação anterior produziu `pass: false`, `duplicateWindowBeforePickup: 3700` e `remainingMs: 4200` (exit 1); após o guard mínimo, produziu `pass: true` e `remainingMs: 3683` (exit 0), mantendo `flameGuardMs: 0`.
- Validações: `npm run compile:esm` passou; `node tests/pickup-chain-guard-check.mjs` passou; `npm run build` passou com 57 módulos transformados; `git diff --check -- 'src/Gameplay/pickup-chain.ts' 'tests/pickup-chain-guard-check.mjs' 'DocsDev/swarm-coordination.md' 'SwarmLedger-gameplay.md'` passou (somente avisos de normalização LF→CRLF).
- Fechamento: commit local seletivo `cfcc9a1`, somente runtime/teste; sem push/deploy.

## 2026-07-14 — ux-how-to-play-chain-guard-duration
- Claim/escopo antes da intervenção: alterar somente a frase existente sobre cadeia de powerups em `how-to-play.html`, fortalecer `tests/how-to-play-page-check.mjs` e atualizar os dois registros; explicitar que a proteção dura 1,4 s e aparece como `GUARD 1.4s`, sem mudar runtime, timers, balanceamento ou assets; preservar todos os diffs alheios; commit local seletivo; sem push/deploy.
- Evidência antes: o guia ensina a janela de 4,2 s, mas chama a proteção apenas de “curta”; `src/Gameplay/pickup-chain.ts:3-5` define janela de 4200 ms e guarda de 1400 ms, e o contrato já validado do HUD observa `GUARD 1.4s`.
- Classificação: Comprovada para a lacuna objetiva de onboarding; impacto de aprendizagem em jogadores permanece experimental.

## 2026-07-14 — hud-flame-guard-remaining-duration
- Commit funcional: `793f5a4` (`feat(hud): show flame guard duration`).
- Claim/escopo antes da intervenção: alterar somente a apresentação do estado protegido no HUD em `src/Engine/game-app.ts`, fortalecer `tests/hud-critical-state-feedback-check.mjs` e atualizar os dois registros; exibir `flameGuardMs` restante como `GUARD 1.2s` com uma casa decimal, sem alterar gameplay, timers ou sincronização; preservar diffs alheios e integralmente o claim anterior `onboarding-powerup-variety-flame-protection`; commit local seletivo se todas as validações passarem; sem push/deploy.
- Antes → depois: `getPlayerHudStatus` retornava `GUARD` sem duração; agora deriva somente o label visual de `flameGuardMs`, usando segundos com uma casa decimal (`1249 ms` → `GUARD 1.2s`), preservando tom, criticidade, timer e regras.
- Evidências/validações: teste focal observou `LIVE`, `DANGER 1.1s` e `GUARD 1.2s`; regressão pickup-chain observou `1400 ms` como `GUARD 1.4s`. `npm run compile:esm`, `node tests/hud-critical-state-feedback-check.mjs`, `node tests/pickup-chain-guard-check.mjs`, `npm run build` (57 módulos) e `git diff --check` seletivo passaram; a primeira regressão identificou somente as expectativas literais antigas de `GUARD`, atualizadas ao novo contrato; diffs alheios preservados; sem push/deploy.

## 2026-07-14 — round-start-cue-score-footer
- Claim/escopo: alterar somente o footer do cue de início de rodada em `src/Engine/game-app.ts`, fortalecer `tests/round-start-cue-check.mjs` e registrar esta intervenção nos dois documentos; preservar diffs alheios; commit local seletivo; sem push/deploy.
- Antes → depois: o cue retornava `footer: null`; agora retorna `copy.scoreSummary(this.formatActiveScore())`, exibindo o placar atual sem duplicar formatação.
- Evidência/resultado: o teste focal observa `Placar: P1 0 - P2 0` no cue da rodada 1 e `Placar: P1 1 - P2 0` no cue da rodada 2.
- Validações: `npm run test:round-start-cue`, `npm run compile:esm`, `npm run build` e `git diff --check` seletivo concluídos com código 0; diffs alheios preservados; commit local seletivo; sem push/deploy.

## 2026-07-14 — powerup-reveal-two-stage-settle
- Claim/escopo: alterar somente o cálculo visual existente de `drawPowerUp`, criar `tests/powerup-spawn-settle-check.mjs` e acrescentar registros aos dois documentos concorrentes; pico aproximado de `1.08` seguido por assentamento contínuo em `1.00` dentro dos `120 ms` existentes, sem gameplay ou timing novo; `launcher-shell.css` e teste farol intocados; sem commit, push ou deploy.
- Resultado: a curva única `0.72→~1.10`, que saltava para `1.00` no fim, foi dividida em subida `0.72→1.08` até progresso `0.58` e assentamento cossenoidal contínuo `1.08→1.00`; relógio, duração, hitbox, coleta, sync e estado permanecem inalterados.
- Validações: `node tests/powerup-spawn-settle-check.mjs`, `node tests/powerup-spawn-pop-check.mjs`, `npm run compile:esm`, `npm run build` (57 módulos) e `git diff --check -- src/Engine/game-app.ts tests/powerup-spawn-settle-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` passaram; conteúdo concorrente preservado; sem commit, push ou deploy.

## 2026-07-14 — kicked-bomb-active-flame-same-cycle
- Claim/escopo: alterar somente `src/Engine/game-app.ts`, fortalecer `tests/bomb-push-check.mjs` e anexar registros aos dois documentos permitidos; bomba chutada que termina sobre flame ativa deve armar/explodir no mesmo ciclo; executar RED/GREEN e preservar tudo alheio; sem commit, push ou deploy.
- RED: após deslizar de `(3,1)` a `(6,1)` sobre flame ativa, a bomba manteve pavio (`kickedOntoFlameArmedSameCycle=false`).
- Implementação/GREEN: após definir o tile final e aplicar a penalidade do chute, `tryPushBombAtTile` detecta flame ativa nesse tile e zera o pavio; `updateBombs(0)` consome a fila normal e remove/explode a bomba no mesmo ciclo (`armed=true`, `explodes=true`).
- Validações: `npm run compile:esm`, `npm run test:bomb-push`, `npm run test:bomb-chain`, `npm run test:bomb-hit-window`, `npm run build` (57 módulos) e `git diff --check` seletivo passaram; sem commit, push ou deploy.

## 2026-07-14 — bot-kick-before-bomb-pass
- Claim/escopo antes da intervenção: ajustar somente a prioridade existente de `kick-up` em `src/Gameplay/powerups.ts` para torná-lo ligeiramente mais atraente ao bot apenas enquanto `bombPassLevel` é zero; criar teste focal isolado, registrar resultado neste ledger, preservar arquivos já sujos e fazer commit local seletivo se compile/test/build/diff-check passarem; sem push/deploy.
- Resultado: Bomb Kick reutiliza o score situacional `180` e recebe somente `+1` enquanto o bot não tem Bomb Pass (`181`); após adquirir passagem volta a `180`, e Kick saturado permanece `0`.
- Validações: `npm run compile:esm`, teste focal, `npm run test:bot-powerup`, `npm run build` (57 módulos) e `git diff --check` seletivo passaram; arquivos alheios já sujos permaneceram intocados; sem push/deploy.

## 2026-07-14 — pickup-chain-rolling-window
- Claim/escopo: alterar somente `src/Gameplay/pickup-chain.ts`, fortalecer `tests/pickup-chain-guard-check.mjs` e anexar registros aos dois ledgers existentes; após A→B bem-sucedido manter B armado por janela reduzida explícita para A→B→C produzir duas guards, preservando repetição e expiração; sem commit, push ou deploy.
- RED: A→B deixava `previousType=null`/`remainingMs=0`; C apenas rearmava a janela normal e registrava `chainGuard=false`.
- Implementação/resultado: `PICKUP_CHAIN_ROLLING_WINDOW_MS=1400` é explícita; uma cadeia bem-sucedida mantém o tipo recém-coletado armado nessa janela. A→B→C produziu `chainGuard=true` em B e C, ambos com janela rolante de 1400ms; repetição e expiração permaneceram sem guard.
- Validações: `npm run compile:esm`, teste focal, `npm run build` (57 módulos) e `git diff --check` seletivo passaram; conteúdo concorrente preservado; sem commit/push/deploy.

## 2026-07-14 — bot-initial-speed-over-bomb
- Resultado: Speed Up inicial passou de `460` para `461`, exatamente `+1` sobre Bomb Up inicial `460`; `tests/bot-powerup-priority-check.mjs` exige tanto o valor `461` quanto `speedScores[0] === bombScores[0] + 1`. `compile:esm`, teste focal e diff-check seletivo passaram; conteúdo concorrente preservado; sem commit, push ou deploy.

## 2026-07-14 — bomb-place-deterministic-playback-rate
- Claim/resultado: `bombPlace` alterna deterministicamente `playbackRate` entre `0.98` e `1.02` apenas em reproduções aceitas; chamadas barradas não avançam a sequência e o fallback mantém a taxa escolhida. Teste focal observou `bombPlaceRates=[0.98,1.02]`, uma reprodução no mesmo frame e recuperação para duas; `compile:esm`, lifecycle, retry, unlock, build (56 módulos) e diff-check seletivo passaram; conteúdo concorrente preservado; sem commit/push/deploy.

## 2026-07-14 — ranni-invalidated-projected-destination-full-cooldown
- Claim/escopo: alterar somente `src/Characters/CustomMechanics/ranni-skill.ts`, fortalecer `tests/ranni-ult-ice-blink-check.mjs` e anexar claim/resultado aos dois ledgers existentes; preservar diffs alheios; commit local seletivo apenas se validado; sem push/deploy.
- RED: após projetar deslocamento até o tile `(7,4)` e tornar esse destino sólido antes da conclusão, o blink foi corretamente rejeitado, mas recebeu cooldown curto de `300 ms` (`invalidatedDestinationFullCooldown=false`).
- Implementação: a decisão de cooldown agora distingue intenção/projeção deslocada de deslocamento efetivamente aplicado; projeção deslocada recebe `8000 ms` mesmo se invalidada ao concluir, enquanto projeção estacionária continua recebendo `300 ms`.
- Resultado/validação: `npm run test:ranni-ult`, `npm run test:skill-contract`, `npm run test:online-skill-reconcile`, `npm run test:server-character-skill` e `npm run build` passaram. GREEN observou destino rejeitado com `8000 ms` e blink estacionário com `283.33 ms` restantes após o tick; diff-check e revisão seletiva concluídos no fechamento; commit local seletivo somente de runtime/teste, ledgers preservados no working tree por conterem diffs concorrentes; sem push/deploy.

## 2026-07-14 — skyfoundry-bastion-procedural-render
- Resultado: `skyfoundry-bastion` mudou exclusivamente de `renderMode: "sprite"` para `"procedural"`; o teste da biblioteca agora exige o modo na definição TypeScript compilada. `compile:esm`, testes `arena-theme-library`/`selection`/`runtime`, build e diff-check seletivo passaram; conteúdo concorrente preservado; sem commit, push ou deploy.

## 2026-07-14 — solo-remote-chain-self-safety
- Claim/escopo: alterar somente `src/Engine/bot-ai.ts`, fortalecer `tests/bot-remote-detonation-check.mjs` e atualizar apenas esta entrada nos dois registros concorrentes; preservar todos os diffs alheios; commit local seletivo; sem push/deploy/branch/worktree.
- Evidência antes: `getRemoteDetonationBomb` rejeitava apenas quando o blast direto da bomba selecionada alcançava o bot; não percorria bombas atingidas por esse blast, embora a explosão real faça reação em cadeia.
- Antes → depois: a seleção remota agora percorre iterativamente toda a cadeia acionada e rejeita a detonação se qualquer blast encadeado atingir o tile atual do bot; escolha segura, proteção do inimigo e demais prioridades permanecem preservadas.
- Evidência focal: bomba remota em `(5,5)` atinge o inimigo e aciona bomba em `(5,3)` cujo blast alcança o bot em `(3,3)`; o bot agora retorna movimento sem `detonate`, enquanto os cenários seguros continuam detonando.
- Resultado/validações: `npm run test:bot-remote`, `npm run test:bot`, `npm run test:bomb-chain`, `npm run build` e diff-check seletivo concluíram com código 0; revisão confirmou o diff funcional limitado ao runtime e teste focal, com mudanças concorrentes preservadas.
- Fechamento: commit local seletivo somente dos nossos arquivos/hunks; sem push, deploy, branch ou worktree.

## 2026-07-14 — ux-channeled-ultimate-release-cancel
- Claim/escopo antes da intervenção: alterar somente a orientação da ultimate em `how-to-play.html`, fortalecer `tests/how-to-play-page-check.mjs` e acrescentar registros nos dois arquivos de coordenação; preservar runtime, balanceamento, assets e todos os diffs alheios.
- Evidência antes: o guia diz apenas `Ativar ou sustentar`, enquanto `src/Engine/game-app.ts:1376-1377` entrega separadamente press e hold ao sistema de skill e as habilidades canalizadas existentes cancelam ao soltar antes do disparo.
- Critério de sucesso: o guia informa que soltar cancela habilidades canalizadas antes do disparo; teste focal, teste completo do guia, build e diff-check seletivo aprovados.
- Antes → depois: a linha da ultimate apenas dizia `Ativar ou sustentar`; agora avisa que soltar antes do disparo cancela habilidades canalizadas, preservando teclas, identidade textual e toda a mecânica.
- Resultado/validação: `node tests/how-to-play-page-check.mjs`, `npm run build` (56 módulos) e `git diff --check` seletivo passaram com código 0. O contrato lê o HTML real; inspeção visual adicional não foi necessária porque não houve mudança estrutural ou de estilo.
- Commit: local seletivo somente de `how-to-play.html` e `tests/how-to-play-page-check.mjs`; os dois registros permaneceram fora do stage por conterem mudanças concorrentes; sem push, deploy, branch, worktree, merge ou rebase.

## 2026-07-14 — bomb-fuse-accelerating-pulse
- Claim/escopo antes da intervenção: alterar exclusivamente o cálculo visual do pulso em `drawBomb`, criar teste focal e acrescentar registros nos dois ledgers concorrentes; preservar amplitude, escala, anel, timing, gameplay e todos os demais arquivos sujos; sem commit/push.
- RED: o teste focal exigiu progressão suavizada do intervalo de pulso e falhou contra o divisor fixo de 80 ms.
- Implementação: progresso normalizado nos 3000 ms finais usa smoothstep e reduz somente o intervalo de 80 ms para 48 ms ao chegar a zero; a fórmula de amplitude `0.6 + 0.4 * sin`, `armedScale`, janela/anel final de 450 ms e estado de jogo permanecem intocados.
- Resultado: teste focal novo e regressões focais de escala/anel aprovados; `npm run build` transformou 55 módulos e concluiu com código 0; `git diff --check` seletivo não encontrou erros (somente avisos LF→CRLF). Arquivos sujos alheios permaneceram intocados; sem commit/push.

## 2026-07-14 — killer-bee-final-destination-revalidation
- Claim/escopo antes da intervenção: revalidar exclusivamente o destino final do dash Killer Bee contra ocupação surgida durante os 240 ms; alterar runtime, fortalecer o teste focal existente e atualizar os dois registros; preservar todos os diffs alheios; commit local seletivo somente se todas as validações passarem; sem push/deploy/branch/worktree.
- Evidência antes: `finishKillerBeeDash` copiava incondicionalmente `projectedPosition`, calculada no início do dash, sem consultar novamente `canOccupyPosition` ao concluir.
- Critério de sucesso: ocupação adicionada ao destino durante o channel impede a finalização naquele ponto; `test:killer-bee-ult`, `skill-contract`, `online-skill-reconcile`, `server-character-skill`, `build` e diff-check aprovados.
- RED → GREEN: o cenário determinístico adicionou solid no tile final após o primeiro frame; antes terminou em `x=300`, tile `7,4`, atravessando a nova ocupação; depois terminou na última posição válida (`x=255`, tile `6,4`) com `newlyOccupiedDestinationRejected=true`.
- Implementação: `updateKillerBeeDash` revalida cada próximo passo e encerra ao detectar bloqueio; `finishKillerBeeDash` revalida também o destino projetado antes de aplicá-lo e usa a posição válida de fallback, preservando cooldown integral e limpeza da projeção.
- Validação/resultado: `npm run test:killer-bee-ult`, `npm run test:skill-contract`, `npm run test:online-skill-reconcile`, `npm run test:server-character-skill`, `npm run build` e `git diff --check` seletivo concluíram com código 0; diff funcional revisado e limitado ao runtime/teste focal; diffs alheios preservados; commit local seletivo somente de runtime/teste; sem push/deploy/branch/worktree.

## 2026-07-14 — solo-flame-up-priority-curve
- Claim/escopo antes da intervenção: ajustar exclusivamente `getPowerUpPriorityScore` em `src/Gameplay/powerups.ts` para a curva Flame Up `[460,340,300,...,0]`, alinhando o teste existente `tests/bot-powerup-priority-check.mjs`; atualizar somente os dois registros de coordenação, preservando conteúdo concorrente; sem alterar testes e sem push.
- Critério de sucesso: `compile:esm`, `test:bot-powerup`, `test:bot-survival`, `test:bot-target`, `build` e diff-check seletivo aprovados.
- Antes → depois: a curva Flame Up `[460,300,280,...,0]` passou a `[460,340,300,280,0]`; `getPowerUpPriorityScore` mantém `460` no primeiro upgrade, explicita `340` no segundo e usa `260 + 40 / 2 ** (flameRange - 3)` nos níveis seguintes.
- Resultado: commit local seletivo `e58f31d42abb69a446e966475bc80fa46ff53ef9` (`feat(bot): rebalance flame upgrade priority`) criado somente para `src/Gameplay/powerups.ts`, com 4 inserções e 1 remoção; teste existente permaneceu intocado.
- Validações: `compile:esm`, `test:bot-powerup`, `test:bot-survival`, `test:bot-target`, `build` e diff-check seletivo concluíram com código 0; sobrevivência e seleção de alvo retornaram `pass=true`; build Vite transformou 55 módulos; diff-check emitiu somente avisos LF→CRLF. Conteúdo concorrente preservado; sem push.

## 2026-07-14 — crocodilo-voluntary-cancel-short-cooldown
- Claim/escopo: alterar somente `src/Characters/CustomMechanics/crocodilo-skill.ts`, fortalecer `tests/crocodilo-ult-emerald-surge-check.mjs` e registrar coordenação/ledger; preservar todos os diffs alheios; somente commit local seletivo, sem push/deploy/branch/worktree/rebase/merge.
- Evidência antes: `cancelCrocodiloEmeraldSurge` retornava a habilidade para `idle` com cooldown `0`, e o teste focal fixava explicitamente esse reinício imediato após aproximadamente 600 ms de channel.
- Antes → depois: o cancelamento voluntário agora entra em `cooldown` por `CROCODILO_VOLUNTARY_CANCEL_COOLDOWN_MS = 600`; channel/cast/projeção são zerados, nenhuma flame é criada e o inimigo permanece vivo; o cast completo continua encerrando no cooldown integral de 6000 ms.
- Validação: `npm run test:crocodilo-ult`, `npm run test:skill-contract`, `npm run build` e `git diff --check` seletivo passaram com código 0. A execução focal determinística do servidor observou `canceledBeforeFire=true`, `finishedIntoCooldown=true` e `pass=true`; inspeção visual manual não se aplica a esta transição de estado sem mudança de UI.
- Fechamento: revisão seletiva confirmou apenas dois hunks funcionais no runtime/teste; registros mantidos no working tree por já conterem mudanças concorrentes; commit local seletivo somente de runtime e teste.

## 2026-07-14 — ux-victory-point-secured-overlay
- Claim/escopo antes da intervenção: alterar somente `src/UiLayouts/i18n.ts`, fortalecer `tests/round-outcome-localization-check.mjs` e atualizar os dois registros; o overlay de vitória deve explicitar o ponto garantido em PT/EN reutilizando `arenaRebooting`; preservar mudanças alheias; sem commit/push.
- Antes → depois: a legenda de vitória dizia apenas que a arena reiniciaria; agora diz `Ponto garantido. Arena reiniciando...` e `Point secured. Arena rebooting...`, sem alterar os textos de Double KO ou timeout; o overlay alterado apareceu corretamente.
- Critério de sucesso: teste focal observa as cópias exatas no overlay real para PT/EN; build aprovado.
- Validação/status: localização focal e `npm run build` passaram. `npm run test:round-outcome` falhou por expectativa preexistente desatualizada de `roundStartSubtitle`: o teste ainda espera `Seja o ultimo...`, enquanto a copy atual é `Objetivo... primeiro a 2`. Status parcial/bloqueado-sem-commit; runtime e testes não foram alterados neste fechamento; sem commit.

## 2026-07-14 — bot-remote-over-second-shield
- Claim/escopo antes da intervenção: alterar somente `src/Gameplay/powerups.ts`, fortalecer `tests/bot-powerup-priority-check.mjs` com cenário determinístico equidistante e atualizar os dois registros; `remote-up` deve superar minimamente a segunda carga de shield (`250`), preservando a primeira carga em `500`; finalização seletiva concluída, sem push ou deploy.
- Evidência antes: `remote-up` e a segunda `shield-up` valem ambos `250`, portanto o desempate equidistante depende da ordem de descoberta em vez de expressar a preferência solicitada.
- Critério de sucesso: primeira shield permanece `500`, segunda shield permanece `250`, remote passa ao menor inteiro superior (`251`) e vence o cenário equidistante; teste focal, bot-survival, bot-target, shield, build e diff-check aprovados.
- Resultado: `remote-up` passou de `250` para `251`; comentário explicita a margem mínima. O cenário equidistante colocou shield acima e remote abaixo do bot: vermelho escolheu `up` com empate em `250`; verde escolheu `down` com remote em `251`. As asserções fixam `[500,250,0]` para shield, `[251,0]` para remote e margem exata de um ponto.
- Validações: `npm run test:bot-powerup`, `npm run test:bot-survival`, `npm run test:bot-target`, `npm run test:shield`, `npm run build` e `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` concluídos com código 0; diff-check emitiu somente avisos LF→CRLF. `git diff --cached --check` também passou antes do commit funcional; sem push ou deploy.
- Commit funcional: `0cdfdb2dde182f4804ee864ec471146bb7ca6c94` (`fix(gameplay): prioritize remote over second shield`), contendo seletivamente os quatro arquivos claimed, com 34 inserções e 4 remoções. `auto-improvements/live_agent.py` e `tests/lab-agent-control-loop-check.mjs` permaneceram fora do stage e do commit.

## 2026-07-14 — lab-agent-outcome-learning
- Antes: o modelo recebia apenas vizinhanca imediata, nao ligava decisoes aos resultados e podia repetir uma direcao que ja falhara no mesmo tile por 13–20 segundos.
- Depois: memoria curta registra `SUCCEEDED`/`FAILED`, o prompt recebe mapa local 7x7 e power-ups, repeticoes falhas sao rejeitadas e uma recuperacao tatica publica uma alternativa em menos de um segundo enquanto o modelo pensa.
- Evidencia: `npm run test:lab-agent-control-loop` falhou antes por ausencia de `ActionOutcomeMemory` e passou depois exercitando a publicacao real da recuperacao; bateria ampla e dry-run aprovados.

## 2026-07-14 — chain-pickup-notice-expanded-item
- Claim/escopo antes da intervenção: alterar exclusivamente `formatPowerUpPickupNotice` em `src/Engine/game-app.ts`, criar `tests/powerup-chain-pickup-notice-check.mjs` e atualizar os dois registros; preservar `tests/lab-agent-control-loop-check.mjs`, demais diffs alheios e não fazer commit/push.
- Antes → depois: o aviso de chain guard mostrava `CHAIN!` no HUD compacto e `CHAIN GUARD` no amplo, ocultando qual pickup gerou o encadeamento; agora o compacto permanece `CHAIN!` e o amplo usa `CHAIN <shortLabel> <valueLabel>`.
- Critério de sucesso: teste focal comprova os dois formatos, disponibilidade da definição antes do branch e remoção do literal legado.
- Validações: `node tests/powerup-chain-pickup-notice-check.mjs`, `npm run compile:esm`, `npm run test:pickup-chain`, `node tests/powerup-max-hud-feedback-check.mjs`, `node tests/short-fuse-pickup-feedback-check.mjs`, `node tests/powerup-hud-slots-check.mjs`, `npm run build` e `git diff --check` concluídos com código 0; o diff-check emitiu somente avisos LF→CRLF. `tests/lab-agent-control-loop-check.mjs` não foi alterado por esta intervenção.

## 2026-07-14 — bot-second-flame-up-340
- Claim/escopo antes da intervenção: alterar somente `src/Gameplay/powerups.ts`, fortalecer `tests/bot-powerup-priority-check.mjs` e atualizar estes dois registros; segundo Flame Up do bot deve passar de 420 para 340, formando a curva `460, 340, 300...` até `0`; preservar todas as demais prioridades, comportamento e sujeira alheia; commit seletivo apenas se todas as validações passarem; sem push.
- Evidência antes: a fórmula vigente retorna `460` no primeiro Flame Up, `420` no segundo (`260 + 160`) e `340` no terceiro (`260 + 80`).
- Critério de sucesso: curva focal `460,340,300...` até `0`; `compile:esm`, `test:bot-powerup`, `test:bot-survival`, `test:bot-target`, `build` e diff-check seletivo aprovados.
- Resultado: fórmula e contrato focal implementados. `npm run compile:esm` passou isoladamente; `npm run build` passou com 55 módulos transformados; `git diff --check` seletivo passou apenas com avisos LF→CRLF. Os três testes solicitados recompilaram com sucesso, mas seus harnesses não iniciaram por import CSS alheio de `lab-live-hud.css` em `output/esm/Engine/auto-improvement-bridge.js`: primeiro `ERR_MODULE_NOT_FOUND`; após espelhar temporariamente o asset já existente no workspace para confirmar o diagnóstico, Node retornou `ERR_UNKNOWN_FILE_EXTENSION` para `.css`.
- Fechamento: nenhum commit foi criado porque nem tudo passou; sem push; sujeira alheia preservada.

## 2026-07-14 — default-arena-bomb-up-presence
- Claim/escopo: finalizar a intervenção mínima já implementada em `src/Arenas/arena.ts` e `tests/powerup-drop-rate-check.mjs`, além dos dois registros; commit local seletivo somente desses quatro arquivos, sem push e sem incluir mudanças alheias.
- Antes → depois: a distribuição determinística da arena padrão gerava zero `bomb-up` entre 22 drops; agora um único slot antes ocupado por `speed-up` passa a `bomb-up`, resultando em 4 `bomb-up` e 4 `speed-up`, com total de 22 drops, taxa, algoritmo, simetria, rede, UI e demais sistemas preservados.
- Classificação: Comprovada para o contrato determinístico de presença da progressão central de capacidade de bombas na arena padrão.
- Evidência focal: `bombDropCount=4`, `hasCoreCapacityDrops=true`, distribuição `remote=2`/`speed=4` e contagem esperada por tipo atualizada, sem alterar a quantidade total de drops.
- Validações: `npm run test:powerup-drop-rate`, `npm run test:arena-runtime`, `npm run test:bot-powerup` e `npm run build` já aprovados; `git diff --check` seletivo e revisão de diff/status concluídos no fechamento.

## 2026-07-14 — bot-avoid-remote-detonation-flame-guard
- Claim/escopo: registrar a correção mínima já presente em `src/Engine/bot-ai.ts` e `tests/bot-remote-detonation-check.mjs`, além destes dois registros; preservar `package.json` e todos os diffs alheios; sem commit.
- Antes → depois: o bot tratava como vulnerável qualquer inimigo sem proteção de spawn e podia gastar detonação remota contra `flameGuard` ativo; agora `enemyVulnerable` também exige `flameGuardMs <= 0`, evitando a detonação enquanto a guarda está ativa e retomando-a assim que expira.
- Classificação: Comprovada para o contrato determinístico de decisão remota protegida/desprotegida.
- Evidências: o teste focal cria a mesma linha de explosão com `flameGuardMs=500` e depois `0`; observa `avoidsProtectedDetonationPass=true` e `detonatesAfterProtectionExpiresPass=true`, além de preservar detonação segura, explosão real, recusa quando insegura e seleção de bomba própria mais nova.
- Validação: `npm run test:bot-remote`, `npm run test:bot`, `npm run build` e `git diff --check`; diff/status revisados ao fechamento. Arquivos runtime/teste: `src/Engine/bot-ai.ts` e `tests/bot-remote-detonation-check.mjs`. Sem commit.

## 2026-07-14 — bot-ignore-saturated-hidden-drop-tiebreak
- Claim/escopo antes da intervenção: ajustar exclusivamente o desempate entre caixas seguras e equidistantes para bonificar apenas drops ocultos ainda úteis ao bot; alterar `src/Engine/bot-ai.ts`, fortalecer `tests/bot-breakable-safe-tiebreak-check.mjs` e atualizar os dois registros; preservar segurança, pathfinding, prioridade ofensiva, balanceamento e todos os diffs alheios.
- Evidência antes: `src/Engine/bot-ai.ts:284-290` bonifica qualquer drop pré-computado, enquanto `src/Engine/bot-ai.ts:736-744` já descarta pickups revelados saturados pela regra central de prioridade.
- Critério de sucesso: em caminhos seguros/equidistantes, manter preferência por drop útil, ignorar o bônus de drop saturado e preservar a prioridade sobre inimigo vulnerável; passar teste focal, regressões de bot, build e diff-check seletivo.
- Antes → depois: qualquer drop oculto conhecido recebia bônus binário; agora o bônus exige `getPowerUpPriorityScore(player, type) > 0`, alinhando caixas ocultas à avaliação central já usada nos pickups revelados.
- Evidência focal: `usefulHiddenDropDecision.direction="left"`, `saturatedHiddenDropDecision.direction="right"` ao comparar speed saturado com shield útil, e `vulnerableTargetDecision.direction="down"`; os três passes foram `true`.
- Validação: `npm run compile:esm`; teste focal; `bot-powerup-priority`, `bot-own-blast-escape`, `bot-survival-10s`, `bot-target-selection`; `npm run build`; `git diff --check` seletivo — todos com código 0. A execução é uma simulação determinística do fluxo real de decisão; inspeção visual não se aplica à heurística sem UI. Diffs alheios permaneceram intocados.

## 2026-07-14 — flame-dissipate-scale-tail
- Claim/escopo antes da intervenção: adicionar exclusivamente uma contração centralizada sutil durante a cauda final de dissipação já existente em `drawFlame`, compartilhada por sprite e fallbacks normal/tóxico; alterar somente `src/Engine/game-app.ts`, criar `tests/flame-dissipate-scale-tail-check.mjs` e atualizar os dois registros; preservar timing, gameplay, dano, tiles, hitbox, sincronização, opacidade existente e todos os diffs alheios; sem commit.
- Antes → depois: a cauda final existente reduzia apenas a opacidade; agora também contrai visualmente de 1,00× a 0,90× em torno do centro do tile, sem deslocamento, tanto no sprite quanto nos fallbacks normal e tóxico.
- Evidência focal: `scaleRange=[0.9,1]`, `centeredScaleUses=2`, `spriteUsesScale=true`, `fallbackUsesScale=true`, `preservesTiming=true` e `pass=true`.
- Validação: `node tests/flame-dissipate-scale-tail-check.mjs`; `node tests/flame-dissipate-tail-check.mjs`; `npm run compile:esm`; `npm run test:bomb-hit-window`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/flame-dissipate-scale-tail-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0; diff-check emitiu somente avisos LF→CRLF. Diffs alheios permaneceram intocados; sem commit.

## 2026-07-14 — crate-break-dedicated-sfx
- Claim/escopo antes da intervenção: adicionar exclusivamente um SFX dedicado quando uma explosao quebra ao menos uma crate; alterar somente `src/Engine/sound-manager.ts`, `src/NetCode/online-sync.ts`, `src/Engine/game-app.ts`, criar `tests/crate-break-sfx-check.mjs` e atualizar os dois registros; reutilizar o asset e o `SoundManager` existentes, cobrir fluxo local e bridge online, preservar `package.json` e todos os diffs alheios.
- Antes → depois: a quebra de crate nao emitia um evento sonoro proprio; agora uma explosao local que remove uma ou mais crates dispara `crateBreak` exatamente uma vez, enquanto o cliente online dispara o mesmo evento quando detecta remocao no diff de `breakableTiles`, sem disparo quando o conjunto permanece igual.
- Classificação: Comprovada para o contrato objetivo de áudio local e online; a adequação perceptiva do asset reutilizado não foi medida com jogadores.
- Evidências: `SfxKey`, `SFX_MANIFEST` e a política de playback incluem `crateBreak` com o asset existente `shield_block_deflect.mp3`, volume positivo e throttle próprio de 90 ms; o teste focal retornou `manifestPass=true`, `localOncePerExplosionPass=true`, `removedCalls=["crateBreak"]`, `unchangedCalls=[]`, `guestDiffPass=true` e `pass=true`.
- Validações: `npm run compile:esm` e `node tests/crate-break-sfx-check.mjs` concluíram com código 0; revisão integral do diff seletivo confirmou somente os seis arquivos claimed e nenhum hunk de `package.json`; `git diff --check -- src/Engine/sound-manager.ts src/NetCode/online-sync.ts src/Engine/game-app.ts tests/crate-break-sfx-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` concluiu com código 0, emitindo apenas avisos LF→CRLF. Commit local seletivo dos seis arquivos; sem push.

## 2026-07-14 — max-powerup-notice-no-tick-restart
- Claim/escopo antes da intervenção: impedir exclusivamente que o aviso transitorio `MAX` do mesmo jogador/tipo seja recriado a cada tick em `collectPowerUps`; alterar somente `src/Engine/game-app.ts`, criar `tests/powerup-max-notice-no-restart-check.mjs` e atualizar os dois registros; preservar pickup, niveis, regras e todos os diffs alheios; sem commit.
- Antes → depois: permanecer sobre um power-up saturado preservado recriava o notice `MAX` com 2200 ms em toda simulacao; agora um notice `MAX` ativo do mesmo jogador/tipo e reutilizado ate expirar, sem mudar a regra que deixa o item disponivel para outro jogador.
- Evidencia focal: o teste cria o notice, avanca 250 ms e repete `collectPowerUps`; exige a mesma referencia de notice com 1950 ms, item nao coletado e `maxBombs` inalterado.
- Validacao: `npm run compile:esm`; `node tests/powerup-max-notice-no-restart-check.mjs`; `node tests/powerup-max-hud-feedback-check.mjs`; `node tests/powerup-max-level-preservation-check.mjs`; `node tests/powerup-hud-slots-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/powerup-max-notice-no-restart-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluidos com codigo 0; diff-check emitiu somente avisos LF→CRLF. Sem commit.

## 2026-07-14 — demolition-combo-drop-reveal-timestamp
- Claim/escopo antes da intervenção: fazer exclusivamente o drop criado por `ensureDemolitionComboDrop` iniciar `powerUpRevealStartedAtMs` com o relógio de animação atual; fortalecer `tests/demolition-combo-drop-check.mjs` com timestamp observável; alterar somente `src/Engine/game-app.ts`, o teste focal e os dois registros de coordenação; preservar todos os arquivos já sujos; commit seletivo dos quatro arquivos somente após `compile:esm`, testes pop/combo/drop-rate, build, diff-check e revisão do diff.
- Antes → depois: o drop garantido por combo já nascia revelado, mas não iniciava o timestamp usado pela animação de reveal; agora o objeto recém-criado é inserido no mapa `powerUpRevealStartedAtMs` com `animationClockMs`, igual ao fluxo normal de reveal.
- Evidência focal: o teste fixa `animationClockMs=1234` antes da explosão e observa `comboDropRevealTimestamp=1234` e `comboDropStartsRevealAnimation=true`, preservando criação, tipo, tile e regra normal de crate única.
- Validação: `npm run compile:esm`; `node tests/powerup-spawn-pop-check.mjs`; `node tests/demolition-combo-drop-check.mjs`; `node tests/powerup-drop-rate-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/demolition-combo-drop-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0. A primeira compilação expôs erro TS6133 em `src/UiLayouts/launcher-shell.ts`, arquivo sujo alheio; esses diffs foram isolados temporariamente para validar o escopo e restaurados integralmente antes do commit seletivo dos quatro arquivos.
- Resultado: diff seletivo revisado e commit seletivo realizado somente com os quatro arquivos reivindicados.

## 2026-07-14 — onboarding-powerup-variety-flame-protection
- Claim/escopo antes da intervenção: ensinar somente no card `Powerups escalam` que coletar tipos diferentes em até 4,2 s ativa proteção curta contra flames; alterar exclusivamente `how-to-play.html`, `tests/how-to-play-page-check.mjs` e este ledger; preservar todo conteúdo alheio e não realizar commit.

## 2026-07-13 — nico-voluntary-cancel-short-cooldown
- Claim/escopo: alterar somente `src/Characters/CustomMechanics/nico-skill.ts`, `tests/nico-ult-arcane-beam-check.mjs` e os dois registros de coordenação; preservar `src/UiLayouts/launcher-shell.ts` e todos os diffs alheios; sem commit.
- Antes → depois: soltar voluntariamente a habilidade de Nico durante o channel retornava a `idle` com cooldown zero; agora entra em `cooldown` por 600 ms por meio de `NICO_VOLUNTARY_CANCEL_COOLDOWN_MS`, mantendo o disparo completo com cooldown integral de 8000 ms.
- Evidência focal: `canceledBeforeFire=true` exige fase `cooldown`, cooldown de 600 ms no tick do cancelamento, channel/cast zerados, nenhum beam criado e inimigo intacto; o restante do contrato do Arcane Beam continuou aprovado.
- Resultado/validação: `npm run test:nico-ult`, `npm run test:skill-contract`, `npm run build` e `git diff --check -- src/Characters/CustomMechanics/nico-skill.ts tests/nico-ult-arcane-beam-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` concluíram com código 0. Revisão seletiva confirmou somente os quatro arquivos reivindicados; `launcher-shell.ts` permaneceu intocado; sem commit.

## 2026-07-13 — short-fuse-effective-pickup-feedback
- Claim/escopo antes da intervenção: alterar somente a apresentação do feedback de coleta de `short-fuse-up` em `src/Engine/game-app.ts`, adicionar `tests/short-fuse-pickup-feedback-check.mjs` e registrar coordenação/resultado; preservar balanceamento, aplicação, HUD persistente, demais feedbacks, scripts e diffs alheios.
- Antes → depois: a coleta já capturava o fuse efetivo de `formatBombFuseSeconds` (`1.60s`/`1.20s`), mas o formatter genérico produzia `+SF 1...` no HUD compacto e `+Short Fuse ...` no expandido; agora ambos exibem diretamente `SF 1.60s` e `SF 1.20s`.
- RED → GREEN: após `compile:esm`, o teste focal falhou com `compact="+SF 1..."` e `expanded="+Short Fuse 1.60s"`; depois do caso mínimo de apresentação, os dois níveis e os dois tamanhos passaram, conferindo também o valor pela função pública de `powerups.ts`.
- Validação: `npm run compile:esm`; `node tests/short-fuse-pickup-feedback-check.mjs`; `node tests/powerup-max-hud-feedback-check.mjs`; `node tests/short-fuse-timing-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/short-fuse-pickup-feedback-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0. O build emitiu apenas avisos preexistentes de chaves duplicadas em `package.json`, que ficou intocado.
- Revisão de escopo: diff próprio limitado a três linhas no formatter, ao teste novo e aos registros de coordenação/ledger; mudanças staged e unstaged alheias permaneceram intocadas. Implementação, teste, CLAIM e ledger foram integrados anteriormente pelo merge `cf518be`; a correção documental sobre o commit será registrada no retorno final.

## 2026-07-13 — ux-disabled-button-cursor
- Claim/escopo antes da intervenção: tornar exclusivamente o cursor dos `.experience-button:disabled` inequivocamente indisponível (`not-allowed`) em vez de neutro (`default`); alterar somente `src/UiLayouts/main.css`, criar `tests/disabled-button-cursor-check.mjs` e anexar claim/resultado neste ledger, preservando todos os diffs alheios.
- Evidência antes: `src/UiLayouts/main.css:257-260` já reduz opacidade e impede hover/active por `:not(:disabled)`, porém usa `cursor: default`, que não comunica indisponibilidade com a mesma clareza do estado visual.
- Critério de sucesso: teste focal RED → GREEN deve comprovar `cursor: not-allowed`, opacidade preservada e ausência de hover/active em desabilitados; `npm run build` e `git diff --check` seletivo devem passar antes de commit seletivo.
- Antes → depois: o botão desabilitado mantinha cursor neutro `default`; agora usa `not-allowed`, enquanto a opacidade `0.52` e os gates `:not(:disabled)` de hover/active permanecem intactos.
- RED → GREEN: antes da implementação, `communicatesUnavailableCursor=false` e `pass=false`; após a troca mínima de uma declaração CSS, todas as cinco verificações passaram.
- Resultado/validação: `node tests/disabled-button-cursor-check.mjs`, `npm run build` (42 módulos) e `git diff --check -- src/UiLayouts/main.css tests/disabled-button-cursor-check.mjs SwarmLedger-gameplay.md` concluíram com código 0; o diff-check emitiu somente avisos LF→CRLF. Validação visual manual não foi realizada e o ganho perceptivo em usuários reais não foi medido.
- Commit seletivo da implementação e teste: `646c92b` (`fix(ux): clarify disabled button state`). O ledger permaneceu fora do commit porque já continha diffs alheios, mas claim e resultado foram preservados no working tree.

## 2026-07-13 — ux-bomb-armed-scale-pulse
- Claim/escopo antes da intervenção: melhorar exclusivamente o feedback visual contínuo da ação central de plantar bomba com um pulso sutil de escala no sprite e no fallback existentes; alterar somente `src/Engine/game-app.ts`, `tests/bomb-armed-scale-pulse-check.mjs` e este ledger; preservar fuse, hitbox, tile, áudio, rede, gameplay e todas as mudanças alheias.
- Evidência antes: `docs/VisualDesignRules.md` prioriza um `Bomb armed pulse` sutil, mas `drawBomb` aplica o pulso existente apenas à opacidade; a silhueta não respira e o fallback pulsa somente o pavio.
- Critério de sucesso: teste focal RED → GREEN deve comprovar escala pequena, centrada e compartilhada por sprite/fallback sem alterar timing; `compile:esm`, regressões de bomba, `build` e diff-check seletivo devem passar antes de qualquer commit.
- Antes → depois: o pulso de fuse alterava apenas a opacidade do sprite e apenas o pavio no fallback; agora a silhueta inteira respira de 1,00× a 1,04× em torno do centro do tile, mantendo o anel final, fuse e regras intactos.
- RED → GREEN: antes da implementação, o teste focal retornou `hasSubtleScale=false`, `centersTransform=false`, `spriteUsesTransform=false` e `fallbackUsesTransform=false`; depois, todas essas flags e `preservesFuseThreshold` passaram.
- Validação: `node tests/bomb-armed-scale-pulse-check.mjs`, `npm run compile:esm`, `node tests/bomb-hit-window-check.mjs`, `node tests/bomb-chain-reaction-check.mjs` e `npm run build` passaram; revisão/diff-check seletivo e commit serão registrados ao fechamento.

## 2026-07-13 — ranni-no-displacement-short-cooldown
- Claim/escopo: alterar somente `src/Characters/CustomMechanics/ranni-skill.ts`, `tests/ranni-ult-ice-blink-check.mjs` e este ledger; preservar mudanças concorrentes, sem commit e sem alterar `package.json`.
- Antes → depois: Ice Blink concluído sem deslocamento efetivo aplicava o cooldown integral de 8000 ms; agora aplica cooldown curto positivo de 300 ms, seguindo o precedente `KILLER_BEE_DASH_BLOCKED_COOLDOWN_MS`, enquanto blinks com deslocamento mantêm 8000 ms.
- RED → GREEN: o teste focal estacionário falhou com `stationaryBlinkCooldownRemainingMs=7983.33` e passou após a intervenção com `283.33` restantes depois do tick seguinte, `stationaryBlinkShortCooldown=true` e `pass=true`.
- Validação: `npm run compile:esm` e `node tests/ranni-ult-ice-blink-check.mjs` passaram; diff-check seletivo e revisão final registrados no reporte da intervenção.

## 2026-07-13 — nico-voluntary-cancel-short-cooldown
- Claim/escopo antes da intervenção: cancelamento voluntário do channel de Nico deve entrar em cooldown curto de 600 ms, em vez de retornar a `idle` com cooldown zero; alterar somente `src/Characters/CustomMechanics/nico-skill.ts`, `tests/nico-ult-arcane-beam-check.mjs` e este ledger; preservar integralmente conteúdo e mudanças alheias; sem commit.
- Critério de sucesso: exportar constante explícita para os 600 ms, fortalecer o teste focal pelo comportamento observável e passar `test:nico-ult`, `test:skill-contract`, `build` e diff-check seletivo.
- RED → GREEN: o teste focal atualizado falhou inicialmente apenas com `canceledBeforeFire=false`; após exportar `NICO_VOLUNTARY_CANCEL_COOLDOWN_MS = 600` e aplicar fase `cooldown` no cancelamento, passou com `canceledBeforeFire=true` e `pass=true`.
- Resultado/bloqueio: após a validação RED → GREEN, a implementação e o teste de Nico foram sobrescritos por uma alteração concorrente; o estado final voltou a `idle` com cooldown `0`. Experimento não entregue e sem commit.

# Swarm Ledger — Gameplay

## 2026-07-13 — ux-audio-range-keyboard-focus
- Antes → depois: o controle `.experience-audio__range` não participava do estilo compartilhado de `:focus-visible`; agora recebe o mesmo outline de `2px solid rgba(var(--accent-rgb), 0.82)` e `outline-offset: 2px` dos demais controles ao navegar por teclado.
- Classificação: Comprovada para o contrato objetivo de indicação de foco por teclado.
- Resultado/validação: `node tests/audio-range-focus-check.mjs` passou, confirmando seletor, outline e offset; `npm run build` passou com 42 módulos transformados; `git diff --check -- src/UiLayouts/main.css tests/audio-range-focus-check.mjs SwarmLedger-gameplay.md` passou com código 0 e apenas avisos LF→CRLF.
- Limitação de validação visual: não foi realizada inspeção manual em navegador; a evidência é estática/automatizada sobre o CSS efetivamente aplicado ao seletor.

## 2026-07-13 — ux-bomb-kick-hud-label-bk
- Claim/escopo antes da intervenção: alterar exclusivamente `shortLabel` de Bomb Kick de `K` para `BK` em `src/Gameplay/powerups.ts`, criar `tests/bomb-kick-hud-label-check.mjs` e preservar todos os diffs alheios; sem commit.
- RED → GREEN: após `compile:esm`, o teste focal falhou com `'K' !== 'BK'`; depois da mudança mínima, passou expondo `type=kick-up`, `label=Bomb Kick` e `shortLabel=BK` pela interface pública `getPowerUpDefinition`.
- Validação final: teste focal passou; `npm run build` passou (42 módulos); `git diff --check -- src/Gameplay/powerups.ts tests/bomb-kick-hud-label-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` passou com apenas avisos LF→CRLF. `npm run test:powerup-hud` compilou e observou corretamente `kick-up: "BK"`, mas falhou porque o teste preexistente ainda exige `"K"` e também `1.65s`, enquanto o runtime concorrente já produz `1.60s`; esse arquivo ficou intocado conforme o escopo solicitado.
- Fechamento documental mínimo: `npm run test:powerup-hud` passou no estado atual, confirmando `kick-up: "BK"` e short fuse `1.60s`; claim atualizado para `feito`. Build e diff-check seletivo dos dois documentos passaram antes do commit documental, sem alteração de runtime ou testes.

## 2026-07-13 — bot-remote-over-bomb-pass-priority
- Claim/escopo antes da intervenção: alterar exclusivamente `getPowerUpPriorityScore` para `remote-up` 220→250 e fortalecer `tests/bot-powerup-priority-check.mjs`; preservar demais scores, comportamento de bot e toda sujeira alheia; sem commit.
- Antes → depois: `remote-up` valia 220 e ficava abaixo de `bomb-pass-up` 240; agora vale 250, supera bomb-pass 240 e permanece abaixo de `short-fuse-up` 260. `remoteLevel >= 1` continua saturando em 0.
- Contrato focal fortalecido: valida explicitamente `remoteScore === 250`, `saturatedRemoteScore === 0`, `short-fuse 260 > remote 250 > bomb-pass 240`, prioridades universais superiores e `kick-up` situacional abaixo.
- Evidências: `npm run test:bot-powerup` passou com todas as flags true; `npm run test:bot-survival` passou (`pass: true`, `deadAtFrame: -1`); `npm run test:bot-target` passou (`pass: true`); `npm run build` passou (42 módulos transformados); `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` passou com código 0 e apenas avisos LF→CRLF.
- Resultado: intervenção mínima concluída, sem commit; alterações concorrentes fora do escopo permaneceram intocadas.

## 2026-07-13 — short-fuse-step-400ms
- Claim/escopo: alterar somente `SHORT_FUSE_STEP_MS` de 350 para 400 em `src/Gameplay/powerups.ts` e criar o teste focal `tests/short-fuse-timing-check.mjs`; preservar `package.json`, coordenação e mudanças alheias.
- Resultado: níveis 0/1/2 agora produzem pavios de 2000/1600/1200 ms; RED confirmou 2000/1650/1300 ms antes da intervenção e GREEN confirmou o novo contrato. Validações finais registradas no retorno da tarefa; sem commit.

## 2026-07-13 — ux-round-start-objective-cue (concluída)
- Claim/escopo antes da intervenção: alterar somente a legenda PT/EN do aviso existente de início da rodada e adicionar contrato focal; preservar título, timing, render, gameplay, guia sob claim concorrente e mudanças alheias.
- Arquivos previstos: `src/UiLayouts/i18n.ts`, `tests/round-start-objective-cue-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Evidência antes: `roundStartSubtitle` dizia apenas `Acao liberada.`/`Action is live.`, enquanto `localControlsHint` já define o objetivo como ser o último bomber vivo.
- Antes → depois: o aviso genérico de ação agora diz `Seja o ultimo bomber vivo.`/`Be the last bomber alive.`, reutilizando o overlay e o objetivo existentes sem mudar duração ou gameplay.
- Resultado/validação: `node tests/round-start-objective-cue-check.mjs`, `npm run build` e `git diff --check` seletivo passaram; diff completo do escopo revisado. Validação visual manual não foi realizada, mas o texto exato usado pelo overlay foi demonstrado no contrato focal.
- Classificação final: Comprovada para a lacuna objetiva de clareza; impacto comportamental em jogadores permanece não medido.
- Commit seletivo: `efb97e4` (`feat(ux): clarify round objective cue`), contendo somente i18n e teste focal.

## 2026-07-13 - Risco de pavio no guia de chute (parcial)
- Escopo: somente `how-to-play.html`, contrato focal e arquivos de coordenacao; runtime e balanceamento preservados.
- Evidencia antes: o guia dizia apenas que chutar reposicionava a ameaca (`how-to-play.html`, card Powerups escalam), enquanto o comportamento validado do jogo reduz 250ms de fuse por tile chutado, com piso de 450ms (`DocsDev/swarm-coordination.md`, registro `creative-hot-kick-fuse`).
- Depois: o mesmo card informa `250 ms ... por tile percorrido` e orienta fuga imediata em chutes longos; o teste focal fixa ambas as mensagens.
- Validacao: `npm run test:how-to-play-page`, `npm run compile:esm`, `npm run build` e `git diff --check` focal passaram. `npm run test:bomb-push` ficou bloqueado por fixture alheia sem `window.removeEventListener`, erro ja registrado nesta coordenacao.
- Resultado: melhoria demonstravel de onboarding, classificada como comprovada, mas validacao global parcial; sem commit.

## 2026-07-13 — ux-how-to-play-round-scoring

- Claim/escopo antes da intervenção: alterar exclusivamente o card existente `Jogue a rodada` para declarar que vence o último bomber vivo e que Double KO não concede ponto; preservar runtime, pontuação, demais textos e mudanças alheias.
- Arquivos previstos: `how-to-play.html`, `tests/how-to-play-page-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Coerência de gameplay: `evaluateRoundState` chama `finishRound(null, "double-ko", ...)` quando não há sobreviventes; `finishRound` incrementa o placar somente quando `winner` existe.
- Critério de sucesso: teste focal protege as duas regras no card; teste do guia, build e diff-check seletivo devem passar antes de commit seletivo.
- Antes → depois: o card falava apenas da vantagem acumulada por powerups; agora informa diretamente que o último bomber vivo vence a rodada e que uma eliminação simultânea é Double KO sem ponto.
- Resultado/validação: `npm run test:how-to-play-page`; `npm run build`; `git diff --check -- how-to-play.html tests/how-to-play-page-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0. Diff seletivo revisado e limitado às linhas da intervenção dentro dos quatro arquivos reivindicados; mudanças alheias permaneceram intocadas.

## 2026-07-13 — crate-break-fallback-fragments

- Claim/escopo antes da intervenção: acrescentar exclusivamente 3–4 fragmentos pixelados ao fallback de `drawCrateBreakAnimation`, reutilizando o mesmo `progress`/duração; preservar estado, timing, sprites, gameplay e mudanças alheias.
- Arquivos previstos: `src/Engine/game-app.ts`, `tests/crate-break-fallback-check.mjs`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: teste focal comprova 3–4 fragmentos pixelados no fallback, derivados do mesmo progresso e sem alterar duração, estado ou caminho de sprites; `compile:esm`, regressões relevantes e `build` devem passar.
- Antes → depois: o fallback exibia somente um pulso circular de poeira; agora também desenha quatro fragmentos quadrados que se afastam e dissipam usando o mesmo `progress` calculado de `effect.elapsedMs / CRATE_BREAK_DURATION_MS`.
- Resultado/validação: `npm run compile:esm`; `node tests/crate-break-fallback-check.mjs`; `node tests/demolition-combo-drop-check.mjs`; `node tests/ranni-ult-animation-hold-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/crate-break-fallback-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; diff-check emitiu apenas avisos LF→CRLF. Commit seletivo realizado após validação; mudanças alheias permaneceram intocadas no working tree.

## 2026-07-13 — ux-round-winner-avatar-halo

- Claim/escopo antes da intervenção: adicionar exclusivamente um halo pixel-art ao avatar vencedor enquanto `roundOutcome` existe; preservar gameplay, estado, sincronização, sprites, paleta e mudanças alheias.
- Arquivos previstos: `src/Engine/game-app.ts`, `tests/round-winner-halo-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: teste focal comprova gate pelo vencedor do outcome, composição atrás do avatar, uso da paleta existente e ausência de mutação de gameplay; `test:round-outcome`, build e diff-check devem passar.
- Antes → depois: o resultado aparecia apenas no overlay; agora o avatar cujo `id` coincide com `roundOutcome.winner` recebe moldura/halo em blocos de pixel com `CANVAS_UI_GOLD` e `CANVAS_UI_GOLD_BRIGHT`, removido automaticamente quando o outcome volta a `null`.
- Resultado/validação: `node tests/round-winner-halo-check.mjs` passou com gate, paleta, pixel-art, ordem atrás do avatar e ausência de mutação confirmados; `npm run build` passou. `npm run test:round-outcome` compilou, mas ficou bloqueado no fixture preexistente porque `window.removeEventListener` não existe e a versão concorrente de `SoundManager.unbindUnlock()` agora o exige; nenhuma correção fora do escopo foi feita.

## 2026-07-13 — onboarding-bomb-final-telegraph

- Claim/escopo antes da intervenção: explicar exclusivamente no guia existente que o anel vermelho da bomba sinaliza os instantes finais do pavio; preservar runtime, janela de 450 ms, timing, renderização, balanceamento, assets, controles e mudanças alheias.
- Classificação inicial: Comprovada — `src/Engine/game-app.ts` desenha o anel vermelho quando `bomb.fuseMs <= 450`, mas `how-to-play.html` apenas orienta sair antes do fuse terminar sem ensinar esse sinal visual.
- Arquivos previstos: `how-to-play.html`, `tests/how-to-play-page-check.mjs`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: o guia deve associar de forma observável o anel vermelho à explosão iminente; contratos do guia e do telegraph, build e diff-check seletivo devem passar sem alterar código de produção.
- Antes → depois: o controle de plantar bomba orientava apenas sair antes do fuse terminar; agora ensina que o anel vermelho significa explosão a instantes e pede saída imediata da linha reta.
- Evidência: `src/Engine/game-app.ts:4729-4743` fixa a janela visual final em 450 ms; `how-to-play.html:578-580` comunica o sinal e a resposta; `tests/how-to-play-page-check.mjs:20-23` protege o texto.
- Resultado/validação: `npm run test:how-to-play-page`; `node tests/bomb-final-telegraph-check.mjs`; `npm run build`; `git diff --check -- how-to-play.html tests/how-to-play-page-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0. Diff completo revisado e limitado aos três arquivos reivindicados; mudanças alheias permaneceram intocadas.
- Classificação final: Comprovada para a lacuna de onboarding e coerência com o telegraph real; impacto na reação de jogadores reais não foi medido.

## 2026-07-13 — verdant-ruins-procedural-render-mode

- Claim/escopo antes da intervenção: mudar exclusivamente o modo de renderização de `Verdant Ruins` de sprite para procedural; preservar o modo default, `Skyfoundry`, demais temas, gameplay, assets e mudanças alheias.
- Arquivos previstos: `src/Arenas/arena-theme-library.ts`, `tests/verdant-ruins-render-mode-check.mjs`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: teste focal deve comprovar `Verdant Ruins` procedural e preservar explicitamente default e `Skyfoundry`; commit seletivo previsto após validação e sem tocar outros arquivos.
- Antes → depois: `Verdant Ruins` usava renderização por sprite; agora usa renderização procedural, enquanto o default `Tournament Clean` permanece procedural e `Skyfoundry Bastion` permanece sprite.
- Resultado/validação: `compile:esm`, teste focal, `arena-theme-library`, `build` e `git diff --check` passaram. Validação visual manual não realizada; o impacto perceptivo segue experimental. Commit seletivo previsto após validação.
- Classificação final: Parcialmente comprovada.

## 2026-07-13 — compact-hud-utility-priority

- Claim/escopo antes da intervenção: manter exatamente 4 slots no HUD compacto, preservando a ordem original e todos os power-ups básicos adquiridos, mas priorizando utilitários adquiridos sobre básicos ainda não adquiridos; preservar HUD expandido, níveis, coleta, gameplay, rede e mudanças alheias.
- Arquivos previstos: `src/Engine/game-app.ts`, `tests/powerup-hud-slots-check.mjs`, `docs/VisualDesignRules.md`, `SwarmLedger-gameplay.md`.
- Seam/teste público: tornar a seleção compacta observável em `render_game_to_text` e validar deterministicamente quantidade, ordem, preservação de básicos adquiridos e preferência por utilitários adquiridos.
- Critério de sucesso: `compile:esm`, teste focal, `build` e diff-check seletivo devem passar; sem commit e sem tocar arquivos sujos alheios.
- Antes → depois: o HUD compacto fixava `bomb-up`, `flame-up`, `speed-up` e `remote-up`, ocultando utilitários adquiridos; agora mantém 4 slots, preserva básicos adquiridos e promove utilitários adquiridos no lugar de básicos não adquiridos, sempre na ordem global original.
- Evidência focal observável: `render_game_to_text` expõe `compactSkillSlots`; no cenário com `bomb-up` e `flame-up` básicos adquiridos e múltiplos utilitários adquiridos, a seleção foi `bomb-up`, `flame-up`, `remote-up`, `shield-up`, com 4 slots adquiridos em ordem global.
- Resultado/validação: `npm run compile:esm`; `node tests/powerup-hud-slots-check.mjs`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/powerup-hud-slots-check.mjs docs/VisualDesignRules.md SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. Arquivos sujos alheios permaneceram intocados.
- Commit seletivo da intervenção: `c9a0a8c` (`feat(hud): prioritize acquired compact powerups`).

## 2026-07-13 — flame-dissipate-tail

- Claim/escopo antes da intervenção: adicionar exclusivamente uma cauda visual curta de dissipação às flames normais e tóxicas, reduzindo sua opacidade no fim da duração; preservar duração, dano, tiles, colisão, sincronização, sprites, paletas e mudanças alheias.
- Classificação inicial: Comprovada — `docs/VisualDesignRules.md` prioriza uma cauda de dissipação opcional, enquanto `drawFlame` mantém opacidade mínima de 0,35 até o desaparecimento abrupto.
- Arquivos previstos: `src/Engine/game-app.ts`, `tests/flame-dissipate-tail-check.mjs`, `SwarmLedger-gameplay.md`.
- Seam/teste público: renderização observável via contrato fonte de `drawFlame`; exigir opacidade integral fora da janela final, fade limitado aos últimos 120 ms e uso compartilhado por sprite e fallback, sem alterar `FLAME_DURATION_MS`.
- Critério de sucesso: teste focal deve falhar antes e passar depois; `compile:esm`, regressão de hit window, `build` e `git diff --check` devem passar.
- Antes → depois: a flame mantinha opacidade mínima de 0,35 e desaparecia abruptamente; agora permanece totalmente legível e dissipa apenas nos 120 ms finais, tanto no sprite normal quanto nos fallbacks normal e tóxico.
- Evidência focal: RED válido por ausência de `FLAME_DISSIPATE_TAIL_MS`; GREEN com `tailMs=120`, `spriteUsesTail=true`, `fallbackUsesTail=true` e `preservesTiming=true`.
- Resultado/validação: `node tests/flame-dissipate-tail-check.mjs`; `npm run compile:esm`; `npm run test:bomb-hit-window`; `npm run build`; `git diff --check -- src/Engine/game-app.ts tests/flame-dissipate-tail-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. A validação visual manual ficou limitada, mas o comportamento de opacidade e a preservação do timing foram demonstrados deterministicamente.
- Classificação final: Comprovada para a lacuna visual e preservação do contrato de gameplay; impacto subjetivo na sensação de acabamento permanece parcialmente experimental.

## 2026-07-13 — online-audio-bomb-id

- Claim/escopo antes da intervenção: usar exclusivamente `BombState.id` como identidade das bombas nas transições de áudio online, evitando `bombPlace`/`bombExplode` quando a mesma bomba muda de tile; preservar demais eventos de áudio, sincronização online, gameplay e mudanças alheias.
- Arquivos previstos: `src/NetCode/online-sync.ts`, `tests/online-audio-bridge-check.mjs`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: mesma `id` movida deve permanecer em silêncio; troca de `id` deve produzir `bombPlace` e `bombExplode`; `compile:esm`, `test:online-audio`, `test:bomb-push`, `build` e diff-check devem passar.
- Antes → depois: a transição identificava bombas por proprietário+tile e interpretava um chute/deslocamento como remoção seguida de adição; agora compara somente `BombState.id`, mantendo silêncio quando a mesma bomba muda de tile e emitindo `bombPlace`+`bombExplode` quando a identidade realmente troca.
- Evidência focal: `placementCalls=["bombPlace"]`, `movedBombCalls=[]`, `idSwapCalls=["bombPlace","bombExplode"]` e `pendingRollbackCalls=[]`.
- Resultado/validação: `npm run compile:esm`; `npm run test:online-audio`; `npm run test:bomb-push`; `npm run build`; `git diff --check -- src/NetCode/online-sync.ts tests/online-audio-bridge-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. Sem commit e sem tocar mudanças alheias.

## 2026-07-13 — bot-value-safe-kick-up

- Claim/escopo antes da intervenção: restaurar exclusivamente um valor estratégico conservador para `kick-up`, agora que a IA executa chutes adjacentes deliberados e seguros; preservar efeito real, drops, coleta, pathfinding, combate, rede, demais prioridades e mudanças alheias.
- Classificação inicial: Comprovada — `src/Gameplay/powerups.ts` ainda retorna 0 sob a premissa de que a IA não planeja chutes, enquanto `src/Engine/bot-ai.ts` já consulta uma direção segura de chute e `tests/bot-safe-adjacent-kick-check.mjs` cobre seus guardrails.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: `kick-up` deve ter score positivo antes do upgrade, retornar 0 no máximo e permanecer abaixo de prioridades estratégicas já estabelecidas; teste focal, chute seguro, regressões de IA, build e diff-check devem passar.
- Antes → depois: `kick-up` retornava sempre 0 por uma premissa obsoleta; agora vale 180 enquanto útil e 0 no nível máximo, abaixo de `bomb-pass-up` (240), `remote-up` (220) e primeiro `short-fuse-up` (260).
- Evidência: `kickScores=[180,0]`, `hasExpectedKickPriority=true`, `preservesKickAsSituational=true`; o teste de chute adjacente confirmou `safeDecision={direction:"right",placeBomb:false}` e guardrails sem upgrade, sem direção comprometida, destino bloqueado e fuse urgente.
- Resultado/validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-safe-adjacent-kick-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `node tests/bomb-push-check.mjs`; `npm run build` — todos concluídos com código 0. Validação manual visual ficou limitada porque a coleta depende de drop/rota; o comportamento foi demonstrado deterministicamente sem alterar o runtime de chute.
- Classificação final: Comprovada para coerência do fluxo estratégico; frequência e impacto perceptível em partidas reais permanecem experimentais.
- Commit seletivo da intervenção: `c2dc5e6df8ca37d718a2fb59862dd9bdb0ec58cc` (`feat(gameplay): value safe kick upgrade for bots`).

## 2026-07-13 — ux-how-to-play-remote-keys

- Claim/escopo antes da intervenção: associar explicitamente no guia existente a detonação remota às teclas reais P1=R e P2=U, preservando estilo, runtime, balanceamento, demais controles e mudanças alheias.
- Arquivos previstos: `how-to-play.html`, `tests/how-to-play-page-check.mjs`, `SwarmLedger-gameplay.md`.
- Antes → depois: o guia atribuía a detonação remota genericamente à tecla E; agora exibe R e U no mesmo padrão visual de teclas e informa diretamente que P1 usa R e P2 usa U.
- Evidência focal: o contrato exige a sequência visual `<kbd>R</kbd><kbd>U</kbd>`, a associação textual P1/R e P2/U e a ausência da associação antiga E/detonação remota.
- Preservação: arquivos preexistentes sujos fora dos três caminhos reivindicados permaneceram intocados; sem commit.
- Resultado/validação: `npm run test:how-to-play-page`; `npm run build`; `git diff --check -- how-to-play.html tests/how-to-play-page-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. Diff revisado e limitado aos três arquivos reivindicados; sem commit.

## 2026-07-13 — bot-bomb-pass-priority-240

- Claim/escopo antes da intervenção: elevar exclusivamente o score bot de `bomb-pass-up` de 190 para 240, fazendo-o prevalecer sobre `remote-up` (220), preservando saturação em 0 no nível máximo, prioridades maiores, efeitos reais, limites, drops, coleta, rede e mudanças alheias.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: arquivos preexistentes sujos e não rastreados fora desses três caminhos permaneceram intocados.
- Antes → depois: `bomb-pass-up` útil valia 190 e perdia para `remote-up`; agora vale 240 e o supera por 20 pontos, enquanto continua abaixo de bomb inicial (460), speed inicial (460), flame inicial (460), shield inicial (500) e short-fuse inicial (260), retornando 0 no nível máximo.
- Evidência focal: `bombPassScores=[240,0]`, `remoteScore=220`, `hasExpectedBombPassPriority=true`, `prefersBombPassOverRemote=true` e `preservesHigherPriorities=true`.
- Resultado/validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; apenas avisos LF→CRLF. Intervenção limitada aos três arquivos reivindicados.
- Classificação final: Parcialmente comprovada — utilidade e preferência testadas; impacto em partida real não medido.

## 2026-07-13 — ux-how-to-play-sudden-death

- Claim/escopo antes da intervenção: explicar somente no guia existente que a morte súbita fecha as bordas da arena e muda a decisão de posicionamento; preservar runtime, balanceamento, assets, estrutura do guia e mudanças alheias.
- Classificação inicial: Comprovada — `tests/sudden-death-check.mjs` cobre aviso e início do fechamento, enquanto a seção de leitura da arena em `how-to-play.html` explica paredes, crates, flames, ultimates, powerups e sinais, mas não esse risco decisivo.
- Arquivos previstos: `how-to-play.html`, `tests/how-to-play-page-check.mjs`, `DocsDev/swarm-coordination.md`, `SwarmLedger-gameplay.md`.
- Critério de sucesso: o guia deve informar de forma observável que as bordas fecham e orientar o jogador a migrar cedo ao centro; o contrato da página, o teste de sudden death, o build e o diff-check devem passar.
- Preservação: alterações preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e arquivos não rastreados permaneceram intocadas e fora do commit seletivo.
- Antes → depois: o guia ensinava obstáculos e sinais gerais, mas omitira o fechamento de arena; agora um card coerente com a grade visual existente associa o aviso `SD` à decisão prática de abandonar cedo as bordas.
- Evidência: `how-to-play.html:622-625`; contrato em `tests/how-to-play-page-check.mjs:24-26`; `tests/sudden-death-check.mjs` confirmou `warningLabel="SD 20s"`, fechamento do primeiro tile e eliminação na borda.
- Validação: `npm run test:how-to-play-page`; `npm run compile:esm`; `node tests/sudden-death-check.mjs`; `npm run build`; `git diff --check -- how-to-play.html tests/how-to-play-page-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0.
- Resultado/classificação final: intervenção concluída e Comprovada para clareza do onboarding. A melhora de decisão em jogadores reais permanece uma hipótese não medida; não houve alteração de gameplay.

## 2026-07-13 — bot-ignore-unusable-kick-up

- Claim/escopo antes da intervenção: impedir somente que bots atribuam valor estratégico a `kick-up` enquanto a IA não possui comportamento deliberado de chute; preservar coleta e chute dos jogadores, drops, demais prioridades, pathfinding, combate, rede e mudanças alheias.
- Classificação inicial: Parcialmente comprovada — o score atual torna o item elegível para perseguição, enquanto o fluxo da IA não consulta `kickLevel`; o impacto em uma partida ainda será avaliado por teste focal e regressões.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: alterações preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e arquivos não rastreados permaneceram intocadas e fora do commit seletivo.
- Antes → depois: `kick-up` valia 180 para um bot sem o upgrade e podia desviar sua rota; agora vale 0 enquanto a IA não planeja nem executa chutes deliberadamente. Coleta, efeito para jogadores e todos os outros scores permanecem inalterados.
- Evidência focal: `unusedKickScore=0` e `ignoresUnusableKickUpgrade=true`; as decisões e curvas existentes de speed, shield, bomb, flame e short-fuse continuaram aprovadas.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0. Validação jogável direta ficou limitada: o efeito depende de um drop/rota de bot, portanto foi demonstrado deterministicamente no teste focal e nas regressões de IA.
- Resultado/classificação final: intervenção concluída; oportunidade Comprovada no fluxo de seleção estratégica por código e teste, com impacto perceptual em partidas ainda experimental.

## 2026-07-12 — bot-shield-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente exclusivamente ao score bot de `shield-up` após a primeira carga, preservando score 500 com zero cargas e saturação em 0 no máximo; sem alterar cargas reais, limites, drops, coleta, rede ou demais prioridades.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: toda sujeira e mudanças alheias permaneceram intocadas; sem commit.
- Antes → depois: a fórmula linear após a primeira carga retornava 245 em `shieldCharges=1`; agora o score usa `210 / 2 ** (shieldCharges - 1)`, produzindo `[500,210,0]` para cargas `[0..MAX_SHIELD_CHARGES]`, com 500 em zero e 0 no máximo preservados.
- Evidência focal: `shieldScores=[500,210,0]` e `hasDiminishingShieldReturns=true`; as verificações existentes de mobilidade inicial, primeiro shield, atributos saturados, bomb, speed, flame e short-fuse permaneceram aprovadas.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF. Diff revisado e limitado à intervenção nos três arquivos reivindicados; sem commit.

## 2026-07-12 — input-ignore-orphan-key-repeat

- Claim/escopo antes da intervenção: ignorar exclusivamente `keydown` marcado como repetição quando a tecla não consta como segurada, evitando que eventos órfãos após `keyup`, blur ou mudança de visibilidade recriem movimento/press; preservar repetição legítima de tecla segurada, prioridade direcional, prevenção de scroll, aliases e campos interativos.
- Arquivos previstos: `src/Engine/input.ts`, `tests/input-repeat-direction-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Evidência da lacuna: em `src/Engine/input.ts:57-69`, `event.repeat` não participava da decisão; um repeat recebido com `keysDown` vazio era tratado como pressão física nova, entrando em `pressCounts`, `keysDown` e `keyOrder`.
- Preservação: mudanças preexistentes em `DocsDev/swarm-coordination.md`, `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e arquivos não rastreados permanecem intocadas e fora do escopo seletivo.
- Antes → depois: um repeat órfão era aceito como nova pressão e podia manter movimento sem tecla fisicamente segurada; agora ele retorna antes de alterar filas/estado. Repeats de teclas realmente seguradas continuam prevenidos e não reordenam prioridade.
- Evidência focal: `latestPhysicalPress="right"`, `afterOlderKeyRepeat="right"`, `fallbackToHeldDirection="up"`, `orphanRepeatDirection=null`, `orphanRepeatDidNotQueuePress=true`, `pass=true`.
- Validação: `npm run compile:esm`; teste focal; transição, aliases, visibilidade e prevenção de scroll; `npm run build`; `git diff --check -- src/Engine/input.ts tests/input-repeat-direction-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF.
- Revisão de escopo: diff de implementação limitado aos dois arquivos reivindicados; mudanças alheias permaneceram fora do commit.
- Commit seletivo da implementação: `65140f8b8e4075d28ff3b22101b5ef7d312e0948` (`fix(input): ignore orphan key repeats`).

## 2026-07-12 — avaliação de invariantes de prioridade de power-ups de bots

- Claim/escopo: avaliar os invariantes de prioridade de power-ups de bots.
- Classificação: Inconclusiva.
- Arquivos pretendidos: teste + ledger.
- Encerramento: sem mudança em produção ou teste, pois o teste existente já prova monotonicidade e saturação, e não haveria melhoria jogável.

## 2026-07-12 — bot-bomb-diminishing-returns

- Claim/escopo antes da intervenção: aplicar retorno decrescente exclusivamente ao score de `bomb-up` para bots, preservando o primeiro score alto, saturação em 0 no máximo, capacidade real, limites, drops, coleta, rede, segurança e demais prioridades.
- Arquivos previstos: `src/Gameplay/powerups.ts`, `tests/bot-powerup-priority-check.mjs`, `SwarmLedger-gameplay.md`.
- Preservação: mudanças preexistentes fora desses três arquivos permaneceram intocadas e fora do commit seletivo.
- Antes → depois: a fórmula linear produzia `[460,420,380,340,0]` para capacidades `[1..5]`; agora o bônus acima da base 300 cai pela metade após o primeiro nível, produzindo `[460,380,340,320,0]`.
- Evidência focal: `bombScores=[460,380,340,320,0]` e `hasDiminishingBombReturns=true`; primeiro score alto e saturação em 0 foram preservados, assim como as verificações existentes de speed, flame, short-fuse, shield e atributos saturados.
- Validação: `npm run compile:esm`; `node tests/bot-powerup-priority-check.mjs`; `node tests/bot-own-blast-escape-check.mjs`; `node tests/bot-survival-10s-check.mjs`; `node tests/bot-target-selection-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/bot-powerup-priority-check.mjs SwarmLedger-gameplay.md` — todos concluídos com código 0; somente avisos LF→CRLF.
- Commit seletivo dos três arquivos: `3bd27a2` (`feat(gameplay): diminish bot bomb upgrade priority`).

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

## 2026-07-13 — ux-canvas-double-ko-simultaneous-elimination

- Claim/escopo antes da intervenção: esclarecer exclusivamente no canvas PT/EN que `doubleKo` representa eliminação simultânea, preservando integralmente `noPoints`, runtime, pontuação, timing, renderização e mudanças alheias; sem commit.
- Arquivos previstos: `src/UiLayouts/i18n.ts`, novo teste focal `tests/canvas-double-ko-copy-check.mjs` e `SwarmLedger-gameplay.md`.
- Critério de sucesso: teste focal simples deve comprovar a explicação PT/EN de eliminação simultânea e a preservação literal de `noPoints` nos dois idiomas.
- Antes → depois: o canvas descrevia apenas a ficção de dois núcleos explodindo/sobrecarregando; agora nomeia primeiro a eliminação simultânea e mantém a confirmação separada de que nenhum ponto foi marcado.
- Resultado/classificação: intervenção Comprovada para clareza semântica do desfecho; impacto na compreensão de jogadores reais permanece não medido. `npm run compile:esm`, teste focal, `npm run build` e `git diff --check` seletivo passaram; validação manual visual não foi realizada por ausência de caminho determinístico curto para forçar Double KO sem alterar estado.
- Commit seletivo: `9bfd97a` (`src/UiLayouts/i18n.ts` e `tests/canvas-double-ko-copy-check.mjs`); ledger atualizado depois do commit para preservar alterações concorrentes já existentes.

## 2026-07-13 — ux-short-fuse-effective-time

- Oportunidade parcialmente comprovada: pretendia alterar `src/Engine/game-app.ts` e criar/ajustar teste focal para exibir `SF 1.60s` e `SF 1.20s` no feedback de coleta de Short Fuse.
- Evidência de gameplay em `src/Gameplay/powerups.ts`: `MAX_SHORT_FUSE_LEVEL = 2`, `SHORT_FUSE_STEP_MS = 400` e `MIN_SHORT_FUSE_MS = 1_200`; `getBombFuseMsForPlayer` aplica `BOMB_FUSE_MS - shortFuseLevel * 400` com piso de 1200ms, e `formatBombFuseSeconds` formata o resultado com duas casas. Com fuse base de 2000ms, os níveis 1 e 2 correspondem a `1.60s` e `1.20s`.
- Bloqueio/preservação: `git diff -- src/Engine/game-app.ts` já mostrou diff alheio/claim do halo do vencedor, incluindo a chamada e o novo helper `drawRoundWinnerHalo`; para não sobrepor trabalho concorrente no mesmo arquivo, a intervenção foi encerrada.
- Resultado: bloqueada sem código, sem teste e sem commit; somente os dois registros de coordenação foram acrescentados.

## 2026-07-13 — ux-canvas-double-ko-no-points-copy

- Claim/escopo antes da intervenção: alterar somente `canvas.doubleKo` PT/EN em `src/UiLayouts/i18n.ts` para dizer explicitamente que ninguém pontua, criar `tests/double-ko-no-points-copy-check.mjs` e registrar este antes → depois; preservar estilo, `noPoints`, gameplay, `src/Engine/game-app.ts`, `package.json` e todas as mudanças concorrentes.
- Antes → depois: `Eliminacao simultanea: os dois nucleos explodiram.` / `Simultaneous elimination: both cores overloaded.` → as mesmas frases, agora concluídas por `e ninguem pontua.` / `and no one scores.`.
- Resultado/validação final: teste focal, `npm run build` e `git diff --check` seletivo passaram; validação manual visual não foi realizada.
- Commit seletivo: `1dd817c`.

## 2026-07-13 — killer-bee-zero-distance-short-cooldown
- Claim/escopo antes da intervenção: quando o dash de Killer Bee computar distância menor que 1 px, aplicar cooldown curto de 300 ms, limpar `projectedPosition` e `projectedLastMoveDirection` e manter posição; alterar somente `src/Characters/CustomMechanics/killer-bee-skill.ts` e `tests/killer-bee-ult-dash-check.mjs`, além deste registro obrigatório; preservar conteúdo e mudanças alheias; sem commit.
- Resultado: o ramo de distância `< 1` agora entra em `cooldown` por 300 ms, zera canal/cast/velocidade, limpa ambos os campos projetados e não altera posição ou tile; o fluxo normal mantém cooldown de 4000 ms.
- Validação: `npm run compile:esm` e `node tests/killer-bee-ult-dash-check.mjs` passaram; cenário cercado confirmou `cooldownRemainingMs=300`, posição `(180,180)` preservada e projeções nulas. Diff seletivo revisado; sem commit.

# Swarm Ledger — Gameplay

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
## 2026-07-14 — lab-agent-self-preservation
- Sintoma reproduzido: a recuperação tática plantava bomba quando todas as direções haviam falhado, mesmo sem provar uma rota para fora da cruz de chamas; o teste focal falhou com `a trapped agent must not plant a bomb without a proven escape route`.
- Causa confirmada: fallback de bomba incondicional e ausência de uma trava determinística sobre respostas do modelo. A direção publicada também persistia durante o pavio sem recalcular a curva da fuga.
- Correção: projeção local de explosões respeitando paredes/caixas, busca de rota segura, rejeição de bomba/detonação suicida, controle de sobrevivência de alta prioridade a cada 120 ms e comando de parada ao concluir a fuga. Warmup não pode mais publicar bomba sem estado espacial.
- Regressão: cobre agente cercado, bomba insegura pedida pelo modelo, bomba segura com primeiro passo obrigatório, mudança de direção no meio da fuga e `escape-complete` fora da explosão.
- Validação real: GPT-5.6 SOL publicou bomba com `Survival guard: bomb allowed with escape down`, recebeu múltiplas correções `survival-control`, publicou `escape-complete`, sobreviveu à detonação e retomou a coleta de power-ups.

## 2026-07-14 — lab-agent-self-preservation
- Sintoma reproduzido: a recuperação tática plantava bomba quando todas as direções haviam falhado, mesmo sem provar uma rota para fora da cruz de chamas; o teste focal falhou com `a trapped agent must not plant a bomb without a proven escape route`.
- Causa confirmada: fallback de bomba incondicional e ausência de uma trava determinística sobre respostas do modelo. A direção publicada também persistia durante o pavio sem recalcular a curva da fuga.
- Correção: projeção local de explosões respeitando paredes/caixas, busca de rota segura, rejeição de bomba/detonação suicida, controle de sobrevivência de alta prioridade a cada 120 ms e comando de parada ao concluir a fuga. Warmup não pode mais publicar bomba sem estado espacial.
- Regressão: cobre agente cercado, bomba insegura pedida pelo modelo, bomba segura com primeiro passo obrigatório, mudança de direção no meio da fuga e `escape-complete` fora da explosão.
- Validação real: GPT-5.6 SOL publicou bomba com `Survival guard: bomb allowed with escape down`, recebeu múltiplas correções `survival-control`, publicou `escape-complete`, sobreviveu à detonação e retomou a coleta de power-ups.

## 2026-07-14 — revalidação da oportunidade de restaurar gate remoto

- Oportunidade: restaurar o gate remoto.
- Classificação: Inadequada após `npm run test:remote` passar com `pass=true`; backlog obsoleto.
- Mudanças runtime/teste: nenhuma.
- Antes → depois: sem alteração.
- Arquivos pretendidos: somente `SwarmLedger-gameplay.md` e `DocsDev/swarm-coordination.md` (ledgers).
- Fechamento: sem commit/push.

## 2026-07-14 — ux-remote-detonation-hud-label-rd

- Claim/escopo antes da intervenção: avaliar e, se sustentado, trocar exclusivamente o `shortLabel` de `remote-up` de `R` para `RD` em `src/Gameplay/powerups.ts`, criar `tests/remote-detonation-hud-label-check.mjs` e atualizar os dois registros; preservar toda sujeira alheia; sem commit, push ou deploy.
- Hipótese: `R` é ambíguo como abreviação isolada, enquanto `RD` identifica diretamente Remote Detonation e segue o padrão de duas letras já usado por `SH`, `BP`, `BK` e `SF`.
- Critério de sucesso: `compile:esm`, teste focal novo, HUD relacionado, build e diff-check seletivo aprovados, sem tocar outros arquivos.
- Antes → depois: o `shortLabel` de Remote Detonation passou de `R` para `RD`; a tecla de detonação permanece `R`, portanto o rótulo do power-up ficou mais específico sem alterar controles ou gameplay.
- Evidência focal: `type="remote-up"`, `label="Remote Detonation"`, `shortLabel="RD"` e `pass=true`.
- Validação: `npm run compile:esm`; `node tests/remote-detonation-hud-label-check.mjs`; `node tests/powerup-hud-slots-check.mjs`; `npm run build`; `git diff --check -- src/Gameplay/powerups.ts tests/remote-detonation-hud-label-check.mjs DocsDev/swarm-coordination.md SwarmLedger-gameplay.md` — todos concluídos com código 0; build transformou 57 módulos e o diff-check emitiu somente avisos LF→CRLF.
- Fechamento: diff próprio limitado aos quatro arquivos reivindicados; `tmp/` e todo estado alheio preservados; sem commit, push ou deploy.
## 2026-07-15 — short-fuse-label-standardization
- Antes → depois: o power-up `short-fuse-up` usava o label `Faster Fuse`; agora usa `Short Fuse`, alinhado ao nome canônico, preservando `shortLabel: SF` e o efeito de reduzir o pavio em 400 ms.
- Classificação: Comprovada — mudança focal de copy/contrato, sem alteração de balanceamento ou comportamento.
- Evidências: `src/Gameplay/powerups.ts` contém `label: "Short Fuse"`; `tests/short-fuse-label-effect-check.mjs` exige o novo label e confirma tipo, abreviação, fusível base e redução de 400 ms (`pass=true`).
- Validações já aprovadas: `compile:esm`, teste focal `short-fuse-label-effect-check.mjs` e build. Commit local seletivo somente de runtime/teste; este ledger e o de coordenação ficam fora do commit por conterem alterações concorrentes; sem push/deploy.

## 2026-07-15 — online-input-sequence-deduplication
- Claim/escopo: impedir retransmissões online com o mesmo `inputSeq` de rearmarem bomba, detonação ou ultimate já consumidas; alterar somente `src/NetCode/input-latch.ts`, `tests/online-input-latching-check.mjs` e este registro append-only; preservar todos os diffs concorrentes; commit local seletivo somente runtime/teste; sem push/deploy/branch/worktree.
- Classificação final: Comprovada. RED: após consumir os pulsos de `inputSeq: 10`, retransmitir a mesma sequência rearmou `bombPressed`, `detonatePressed` e `skillPressed` (`pass=false`, exit 1). GREEN: sequências iguais ou menores retornam o estado atual; sequência maior mantém o latch existente (`duplicateIgnored` preservou os três pulsos em `false`, `pass=true`).
- Antes → depois: pacote duplicado podia executar novamente uma ação discreta online; agora cada sequência é aceita no máximo uma vez, sem mudar o fluxo local, o visual ou os assets. Evidência focal em `src/NetCode/input-latch.ts:22-25` e `tests/online-input-latching-check.mjs:23-38,70-88`.
- Validações: `test:online-input-latch`, `test:online-4p`, `test:server-tick`, `test:online-skill-reconcile`, `test:remote`, `npm run build` (98 módulos), `git diff --check` e revisão seletiva aprovados. Preview visual/manual não se aplica à invariância de protocolo; o harness reproduz consumo e retransmissão deterministicamente. Ledger mantido fora do commit por conter mudanças concorrentes; sem push/deploy.

## 2026-07-15 — killer-bee-nonfinite-delta-noop
- Claim/escopo: fazer `updateKillerBeeDash` ignorar `deltaMs` não finito, alterando somente `src/Characters/CustomMechanics/killer-bee-skill.ts`, `tests/killer-bee-ult-dash-check.mjs` e este registro; preservar toda mudança concorrente; commit local seletivo somente runtime/teste; sem push/deploy.
- RED → GREEN: antes, `NaN`, `Infinity` e `-Infinity` corrompiam posição/timers do dash (`nonFiniteDeltaNoop=false`, exit 1); depois, os três valores preservam posição, timers e fase, zeram velocidade e retornam tratados (`nonFiniteDeltaNoop=true`, `pass=true`).
- Validações: `test:killer-bee-ult`, `test:skill-contract`, `test:online-skill-reconcile`, `test:server-character-skill`, typecheck/build Vite (97 módulos) e diff-check seletivo aprovados. Harness server-authoritative exerceu o gameplay; lint não existe em `package.json`. Diffs alheios preservados; sem push/deploy.

## 2026-07-15 — nico-invalid-delta-preserve-velocity
- Resultado/antes → depois: `updateNicoArcaneBeamChannel` zerava a velocidade ao receber `deltaMs` zero, negativo ou não finito, embora não avançasse a skill; agora a entrada inválida é um no-op integral tratado, preservando velocidade, fase e timers sem criar feixe.
- Evidências: guarda focal em `src/Characters/CustomMechanics/nico-skill.ts:61-63`; cenários de `channeling` e `releasing` para `0`, `-17`, `NaN`, `Infinity` e `-Infinity` em `tests/nico-ult-arcane-beam-check.mjs:346-382`, todos com `scenarioPass=true`, `invalidDeltaNoop=true` e `pass=true`.
- Validações: teste focal via `node tests/nico-ult-arcane-beam-check.mjs`, `npm run build` (98 módulos), `git diff --check` seletivo, `git show --check` e revisão integral do diff aprovados. Commit local seletivo `262bedf`, contendo somente runtime/teste; ledgers mantidos fora por conteúdo concorrente; sem push/deploy.

## 2026-07-15 — crocodilo-invalid-delta-preserve-velocity
- Claim/escopo: tornar `updateCrocodiloEmeraldSurgeChannel` um no-op integral para `deltaMs` zero, negativo ou não finito, alterando somente `src/Characters/CustomMechanics/crocodilo-skill.ts`, `tests/crocodilo-ult-emerald-surge-check.mjs` e este append; evitar todos os arquivos sujos e orquestradores.
- Classificação final: Comprovada. RED: os 10 cenários de `channeling`/`releasing` para `0`, `-17`, `NaN`, `Infinity` e `-Infinity` preservavam fase/timers, mas zeravam a velocidade (`nonPositiveDeltaNoop=false`, exit 1). GREEN: a guarda retorna tratada sem mutar velocidade, fase ou timers (`nonPositiveDeltaNoop=true`, `pass=true`).
- Antes → depois: um tick temporal inválido podia introduzir uma parada espúria durante o Emerald Surge; agora não altera estado de gameplay. Validações: `npm run test:crocodilo-ult`, `npm run build` (98 módulos), `git diff --check` e revisão seletiva aprovados; sem commit/push/deploy.
