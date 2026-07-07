![v0.2.3](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.2.3/v0.2.3-card.png)

# v0.2.3 - Danger, powerups e lobby mais solidos (07/07/2026)

Patch oficial do AutoWebGame/BOMBA consolidando o trabalho local feito depois do release `v0.2.2`, com foco em gameplay tatico, feedback de perigo, resiliencia de lobby/storage/roster, audio e controles de sala.

## Novidades

- **Adrenalina de perigo:** jogadores sem protecao ganham um pequeno passo extra quando estao em uma explosao iminente.
- **Short fuse power-up:** novo upgrade reduz o tempo de fuse das bombas e aparece no HUD/drop pool.
- **Perfect start burst:** movimento imediato no inicio da rodada recebe um burst curto e testado.
- **Arena theme picker:** a landing permite escolher tema de arena por links com query string.
- **Entrada manual por codigo:** lobby aceita codigo digitado ou URL de convite colada.

## Melhorias

- **Chute de bomba mais expressivo:** `kick-up` agora aplica fuse quente, pode quebrar crate no impacto e revela drop existente.
- **Combos de demolicao recompensam melhor:** explosoes que quebram varias crates garantem um drop quando nenhuma crate ja tinha recompensa.
- **Escudo mais vivo:** bloqueio toca SFX de deflexao e concede burst de fuga curto apos gastar carga.
- **Feedback dialog mais claro:** contador vivo, botao de envio desabilitado quando vazio/fora do limite e Escape fecha o dialog.
- **Audio de pickup mais rico:** power-up collect ganhou variantes e anti-stack junto com shield block.

## Correcoes

- **Roster publico invalido:** manifesto publico duplicado/truncado cai para o roster aprovado e nao esconde personagens.
- **Storage bloqueado:** preferencias de UI, idioma, personagem, bot fill e retorno de sessao toleram storage bloqueado/parcial.
- **Telemetry UUID fallback:** browsers com `crypto` sem `randomUUID` nao quebram a landing.
- **Input online sanitizado:** direcoes invalidas em pacotes de guest viram neutro antes do estado autoritativo.
- **Pausa ao ocultar aba:** partidas locais pausam em blur/hidden e nao avancam perigo enquanto o jogador esta fora.
- **Sprite trim late-load:** sprites que ainda nao tinham dimensoes nao ficam presos em cache `null`.
- **Username guidance:** validacao de username usa copy localizada e constraints nativas.

## Sessoes verificadas desde o ultimo release

| Sessao / agente | Evidencia encontrada | Resultado para o patch |
|---|---|---|
| CODEX / codex-swarm | Branch `codex-swarm` em `eac1a60`, branches `swarm/*`, worktree `C:/Projetos/AutoWebGame-swarm`, `DocsDev/swarm-coordination.md`, diff `v0.2.2..codex-swarm` | Mudancas versionadas de gameplay, UX, audio, roster, storage, input e testes foram auditadas, resolvidas e integradas. |
| CODEX / i18n-storage-guard | Worktree `C:/Users/user/.codex/worktrees/ad82/AutoWebGame`, branch `swarm/i18n-storage-guard-20260707-1600` em `1813b99` | Codigo ja estava coberto pelo helper `browser-storage`; teste dedicado foi integrado para evidenciar o caso. |
| Claude | Busca textual em docs/codigo, branches, worktrees e historico local | Nenhum commit ou arquivo versionado novo atribuivel a Claude depois de `v0.2.2`. |
| ZCode | Busca textual em docs/codigo, branches, worktrees e historico local | Nenhum commit ou arquivo versionado novo atribuivel a ZCode depois de `v0.2.2`. |
| Wispr Flow | Busca textual em docs/codigo, branches, worktrees e historico local | Nenhum commit ou arquivo versionado novo atribuivel a Wispr Flow depois de `v0.2.2`. |

Observacao: se Claude, ZCode ou Wispr Flow executaram trabalho fora do Git ou fora das worktrees inspecionadas, esse trabalho nao deixou rastro versionado local no repo auditado.

## Local vs nuvem

- Nuvem verificada com `git fetch --all --tags --prune` e `gh release list`.
- Ultimo release oficial na nuvem antes deste patch: `v0.2.2`, publicado em 2026-07-07T02:29:41Z.
- `origin/main` antes deste patch estava em `602b5d7e989a6c0238263b40252bee2853903694`.
- Tag local `v0.2.2` aponta para `210d0c189ce4cd20048d6d5cef4605673d6cb9d8`; `origin/main` inclui tambem o commit posterior de patch notes visivel.
- Trabalho local novo estava em branches/worktrees, nao na nuvem: `codex-swarm` em `eac1a60` e `swarm/i18n-storage-guard-20260707-1600` em `1813b99`.
- Conflitos resolvidos nesta preparacao: `session-client`, `i18n`, `main.css`, `game-app`, `sound-manager`, `growth-telemetry`, `package.json` e testes de audio/HUD/touch.
- Nenhum conflito Git remanescente apos a integracao; `npm run build` e a bateria de regressao passaram.

## Mudancas por sessao

| Sessao | Mudancas |
|---|---|
| `fix-lobby-actions-disconnected` | Bloqueia acoes de lobby quando socket nao esta aberto e mostra reconnect. |
| `fix-bot-invite-start-readiness` | Permite readiness/start com seats de bot sem exigir client humano em todos os assentos. |
| `ux-arena-theme-picker` | Adiciona seletor de tema na landing e resolver de query `arenaTheme`. |
| `room-code-enter-submit` / `lobby-join-trimmed-code` | Entrada manual por codigo ou URL colada, com submit sem navegacao. |
| `audio-variant-powerup-pickup` | Adiciona variantes de SFX para coleta de power-up e valida decode. |
| `creative-short-fuse-powerup` | Novo `short-fuse-up`, drop pool, HUD e teste de fuse reduzido. |
| `creative-sliding-bomb-kick` / `creative-hot-kick-fuse` | Chute desliza bomba e reduz fuse conforme distancia. |
| `creative-kick-crate-crack` | Bomba chutada contra crate quebra a crate e revela o drop existente. |
| `creative-demolition-combo` | Quebrar 2+ crates em uma explosao garante um power-up se nenhuma tinha drop. |
| `creative-perfect-start-burst` | Movimento imediato no inicio da rodada ativa burst curto. |
| `creative-danger-adrenaline-step` | Explosao iminente concede pequeno boost de movimento para jogador vulneravel. |
| `audio-shield-block-deflect-rerun` | Integra `shield_block_deflect.mp3` local/online e atualiza mapa de audio. |
| `creative-shield-breakaway-burst` | Shield block concede burst de fuga e exporta o estado em snapshot. |
| `fix-tab-hidden-recovery-pause` | Partida local auto-pausa em blur/hidden sem afetar online autoritativo. |
| `ux-feedback-dialog-live-counter` / `fix-feedback-length-guard` | Feedback tem contador, limite local, Escape e botao desabilitado quando invalido. |
| `fix-account-username-guidance-i18n` | Mensagens/constraints de username localizadas e testadas. |
| `fix-storage-blocked-ui-preferences` / `i18n-storage-guard` | Helper compartilhado para localStorage bloqueado e teste de idioma. |
| `fix-telemetry-uuid-fallback` | Fallback de UUID quando `crypto.randomUUID` nao existe. |
| `fix-online-input-direction-sanitize` | Direcao online invalida vira neutra antes de entrar no latch. |
| `fix-bot-remote-newer-bomb-target` | Bot remoto pode detonar qualquer bomba propria segura que acerte inimigo vulneravel. |
| `fix-sprite-trim-late-load` | Cache de trim recupera quando imagem ganha dimensoes depois. |
| `fix-roster-manifest-duplicate-ids` | Manifesto publico duplicado/truncado cai para roster aprovado. |

## Validacao

Principais checks executados e aprovados:

- `npm run build`
- `npm run compile:esm`
- `git diff --check`
- `node tests/release-visibility-check.mjs`
- `node tests/sound-manager-variation-check.mjs`
- `node tests/audio-asset-decode-check.mjs`
- `node tests/shield-block-sfx-check.mjs`
- `node tests/online-audio-bridge-check.mjs`
- `node tests/feedback-dialog-live-counter-check.mjs`
- `node tests/feedback-length-guard-check.mjs`
- `node tests/ui-storage-fallback-check.mjs`
- `node tests/i18n-storage-guard-check.mjs`
- `node tests/growth-telemetry-uuid-fallback-check.mjs`
- `node tests/online-input-latching-check.mjs`
- `node tests/game-visibility-auto-pause-check.mjs`
- `node tests/room-code-enter-submit-check.mjs`
- `node tests/account-username-validation-check.mjs`
- `node tests/arena-theme-selection-check.mjs`
- `node tests/character-roster-invalid-public-manifest-check.mjs`
- `node tests/character-roster-manifest-sync-check.mjs`
- `node tests/player-sprite-render-check.mjs`
- `node tests/danger-adrenaline-step-check.mjs`
- `node tests/danger-overlay-check.mjs`
- `node tests/round-outcome-pause-check.mjs`
- `node tests/round-start-cue-check.mjs`
- `node tests/match-result-shortcuts-check.mjs`
- `node tests/bomb-push-check.mjs`
- `node tests/bomb-chain-reaction-check.mjs`
- `node tests/bomb-hit-window-check.mjs`
- `node tests/demolition-combo-drop-check.mjs`
- `node tests/short-fuse-powerup-check.mjs`
- `node tests/perfect-start-burst-check.mjs`
- `node tests/shield-breakaway-burst-check.mjs`
- `node tests/shield-powerup-check.mjs`
- `node tests/powerup-drop-rate-check.mjs`
- `node tests/powerup-hud-slots-check.mjs`
- `node tests/lobby-rules-check.mjs`
- `node tests/matchmaking-session-state-check.mjs`
- `node tests/online-four-player-check.mjs`
- `node tests/online-character-selection-index-check.mjs`
- `node tests/server-character-skill-mapping-check.mjs`
- `node tests/character-skill-contract-check.mjs`
- `node tests/online-skill-reconcile-check.mjs`
- `node tests/server-tick-catchup-check.mjs`
- `node tests/bot-target-selection-check.mjs`
- `node tests/bot-intel-check.mjs`
- `node tests/bot-remote-detonation-check.mjs`
- `node tests/bot-survival-10s-check.mjs`
- `node tests/bot-opening-discipline-check.mjs`
- `node tests/bot-powerup-priority-check.mjs`
- `node tests/bot-spawn-protection-check.mjs`

## Arte

- `release-assets/v0.2.3-card.png`
- `release-assets/v0.2.3-card-bg.png`

---

Notas completas geradas para o GitHub Release oficial `v0.2.3`.
