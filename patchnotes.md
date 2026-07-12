# Patch Notes — 2026-07-12 v0.4.0

**Projeto:** AutoWebGame / BOMBA PvP
**Baseline:** `v0.3.0` (`15b3721`)
**Estado:** publicado e validado em `bombapvp.com` e `bombpvp.com`

## Para quem joga

- Bombas avisam melhor os 450 ms finais e pickups se destacam do piso.
- Powerup já maximizado permanece na arena e mostra `MAX` no HUD.
- Drops ficaram menos densos, remote-up mais raro e Sudden Death um pouco menos agressivo.
- Bots priorizam mobilidade/sobrevivência, ignoram upgrades saturados e evitam bombas ofensivas redundantes.
- Convites aceitam códigos dentro de mensagens; quando copiar falha, o código aparece para compartilhamento manual.
- Mobile respeita notch/safe areas e a landing informa corretamente 9 arenas e até 4 jogadores online.

## Invisível, mas importante

- Input é limpo em `pagehide`; áudio se recupera de falha e remove listeners órfãos.
- Worker não guarda 404 de chunks como immutable, reutiliza arena ativa em memória e reduz leituras do admin.
- Deltas de blast são reutilizados em vez de alocados a cada explosão/projeção.
- Robots/sitemap cobrem as páginas públicas e os dois domínios.

## Qualidade e decisões

- Build aprovado, 136/136 checks, audit com 0 vulnerabilidades e Wrangler dry-run aprovado.
- QA Chrome desktop/mobile sem overflow ou erro de console.
- Agent-First, suporte/SLA, billing live, telemetria ampliada e novos assets genéricos ficaram fora até atenderem os gates do PRD.
- Sem breaking change ou migração de Durable Object.

Relatórios: `DocsDev/releases/release-v0.4.0.md`, `PRD-v0.4.0.md` e `before-after-v0.4.0.md`.

---

# Patch Notes - 2026-07-10 v0.3.0 Official Minor Release

**Project:** AutoWebGame / BOMBA PvP
**Baseline:** `v0.2.5` (`664d616`)
**State:** aprovado para publicacao

## O que muda para quem joga

- Explore `tidal-foundry` e `ember-kiln`, duas novas arenas com tiles proprios.
- Retome lobbies e partidas apos quedas breves sem perder imediatamente o assento.
- Veja claramente quando uma sala esta cheia ou com partida em andamento.
- Use personagem surpresa, encadeie pickups para ganhar guard e perceba melhor velocidade/fuse curto.
- Encontre entrada por codigo, guia Como jogar, copy e estados de carregamento mais claros.

## Mudancas invisiveis

- Admin fail-closed e sessoes administrativas anteriores revogadas.
- Mapa de perigo compartilhado, carregamento paralelo de personagens e menos alocacoes/canvas resets.
- Dependencia `ws` atualizada para 8.21.0; audit de producao sem vulnerabilidades conhecidas.

## Qualidade

- Build TypeScript/Vite aprovado.
- 47/47 contratos focados aprovados.
- Nenhum achado de seguranca P0-P2 confirmado.
- Sem breaking change ou migracao de dados.

Detalhes, tabela auditavel e riscos residuais: `DocsDev/releases/release-v0.3.0.md`.

---

# Patch Notes - 2026-07-08 v0.2.5 Official Patch

**Project:** AutoWebGame / BOMBA
**Path:** C:\Projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-07-08
**State:** release candidate for `v0.2.5`

## Executive Summary

Patch `v0.2.5` consolidates selected Codex work done after the official `v0.2.4` release. The GitHub cloud state (`origin/main`) and the latest official tag both pointed to `8222270`, while local detached worktrees held the new release candidates.

Main themes:
- New players get a public how-to-play guide before entering the arena.
- The commercial funnel has a full release smoke.
- Worker API dispatch is faster and covered by a route-contract check.
- Risky/conflicting work stayed outside this patch.

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| Latest release before patch | `v0.2.4` | `v0.2.4` | GitHub release published 2026-07-08T18:42:01Z. |
| Branch state before release prep | `main` at `v0.2.4` | `origin/main` at `8222270` | Local and remote were aligned before cherry-picks. |
| Integration | 5 selected commits cherry-picked | Not yet pushed at prep time | `codex-swarm` direct merge rejected due conflicts. |
| Working tree after validation | Release docs/art pending final commit | Clean remote | Release docs/art are final additions. |

## Sessions Checked Since v0.2.4

| Session / agent | Evidence checked | Changes found |
|-----------------|------------------|---------------|
| Codex / Ship commercial QA | Detached worktree `7459d65`, `ShipSwarm.md`, test script and package script | Yes: integrated commercial release smoke. |
| Codex / How-to-play page | Detached commits `72996ff` and `db07b4a`, `EnxameTalk.md`, HTML, image and test | Yes: integrated public how-to-play guide. |
| Codex / Performance round 8 | Detached commits `5f9cec8` and `fcfa975`, `PerformanceSwarm.md`, Worker diff and route test | Yes: integrated Worker API dispatch optimization. |
| Codex / codex-swarm | Branch `codex-swarm`, diff and merge-tree | Yes, but not integrated: branch conflicts with current `main` and needs cherry-pick review. |
| Codex / dirty detached worktrees | Worktrees `4f9a` and `58f1` | Pending uncommitted UI/edge-case work; not released. |
| Claude | Text search, branches, worktrees, docs and `C:\Projetos\LucasOl` | No post-`v0.2.4` versioned AutoWebGame changes found. |
| ZCode | Text search, branches, worktrees, docs and `C:\Projetos\LucasOl` | No post-`v0.2.4` versioned AutoWebGame changes found. |
| Wispr Flow | Text search, branches, worktrees, docs and `C:\Projetos\LucasOl` | No post-`v0.2.4` versioned AutoWebGame changes found. |
| OpenCode | Text search, branches, worktrees, docs and `C:\Projetos\LucasOl` | No post-`v0.2.4` versioned AutoWebGame changes found. |
| Trae Work | Text search, branches, worktrees, docs and `C:\Projetos\LucasOl` | No post-`v0.2.4` versioned AutoWebGame changes found. |

If any of those agents worked outside Git, outside the inspected worktrees, or in another repository, that work did not leave a versioned AutoWebGame trace in this release audit.

## Patch Notes Candidate

### Novidades

- **Como jogar publico:** nova pagina explica objetivo, controles, leitura de arena e plano de primeira partida.
- **Landing com guia:** a pagina inicial passa a apontar para o guia antes de abrir a arena.
- **Smoke comercial:** novo teste cobre promessa publica, `/game`, paginas legais, conta rapida, checkout, webhook pago, copy de compra e telemetria.

### Melhorias

- **Worker API mais rapido:** dispatch de `/api/*` usa tabela de rotas precompilada em vez de cadeia linear de `if`.
- **Contrato de rotas:** teste dedicado garante equivalencia de metodos e handlers publicos.
- **Patch card oficial:** nova arte 16:9 segue o padrao visual do release anterior.

### Fora deste release

- **`codex-swarm`:** nao entrou como merge direto por conflito e escopo amplo.
- **Dock responsivo e room-code em mensagem:** continuam pendentes por estarem sem commit/teste final nos worktrees `4f9a` e `58f1`.

## Validation

Passed:
- `git diff --check`
- `node --check worker/index.js`
- `npm run build`
- `npm run test:commercial-release-flow`
- `npm run test:how-to-play-page`
- `npm run test:worker-api-route-dispatch`
- `npm run test:billing-commercial`
- `npm run test:account-username`
- `npm run test:lobby-rules`
- `npm run test:matchmaking-state`
- `npm run test:online-4p`
- `npm run test:roster-sync`
- `npm run test:active-arena-fetch`
- `npm run test:growth-telemetry-retry`
- `codegraph status C:\Projetos\AutoWebGame`

## Files For This Release Prep

- `DocsDev/releases/release-v0.2.5.md`
- `DocsDev/releases/release-v0.2.5.json`
- `release-assets/v0.2.5-card.png`
- `release-assets/v0.2.5-card-bg.png`
- `patchnotes.md`
- `changelog.md`

---

# Patch Notes - 2026-07-07 v0.2.3 Official Patch

**Project:** AutoWebGame / BOMBA
**Path:** C:\Projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-07-07
**State:** release candidate for `v0.2.3`

## Executive Summary

Patch `v0.2.3` consolidates local CODEX/swarm work done after the official `v0.2.2` release. The GitHub cloud state (`origin/main`) was synced to `v0.2.2` plus the visible patch-notes commit (`602b5d7`), while local branches/worktrees held new gameplay, UX, audio, roster and storage changes.

Main themes:
- Bomb and power-up gameplay is more tactical.
- Shield, danger and round feedback are more readable.
- Lobby, feedback, username, i18n and storage paths are safer.
- Roster loading rejects duplicated/truncated public manifests.
- Online input and telemetry tolerate bad runtime data.

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| Latest release before patch | `v0.2.2` | `v0.2.2` | GitHub release published 2026-07-07T02:29:41Z. |
| Branch state before release prep | local integration in working tree | `origin/main` at `602b5d7` | `codex-swarm` and i18n worktree were local-only before this patch. |
| Integration | Manual merge of `codex-swarm` up to `eac1a60` plus i18n test from `1813b99` | Not yet pushed at audit time | Conflicts resolved in GameApp/session/i18n/CSS/tests/package docs. |
| Working tree after validation | Release docs/art pending final commit | Clean remote | Release docs/art are final additions. |

## Sessions Checked Since v0.2.2

| Session / agent | Evidence checked | Changes found |
|-----------------|------------------|---------------|
| CODEX / codex-swarm | `git branch -vv --all`, worktrees, `v0.2.2..codex-swarm`, `DocsDev/swarm-coordination.md` | Yes: gameplay, UX, audio, roster, input, storage and tests. |
| CODEX / i18n-storage-guard | Dedicated worktree/branch at `1813b99` | Yes: test evidence integrated; code path already covered by shared helper. |
| Claude | Text search, local branches, worktrees and docs | No post-`v0.2.2` versioned repo changes found. |
| ZCode | Text search, local branches, worktrees and docs | No post-`v0.2.2` versioned repo changes found. |
| Wispr Flow | Text search, local branches, worktrees and docs | No post-`v0.2.2` versioned repo changes found. |

If Claude, ZCode or Wispr Flow worked outside Git or outside the inspected worktrees, that work did not leave a local versioned trace in this repository.

## Patch Notes Candidate

### Novidades

- **Adrenalina de perigo:** jogador vulneravel ganha um pequeno boost ao sair de explosao iminente.
- **Short fuse power-up:** novo upgrade reduz fuse de bombas e aparece no HUD/drop pool.
- **Perfect start burst:** movimento imediato no inicio da rodada recebe burst curto.
- **Arena theme picker:** landing permite trocar tema de arena por query/link.
- **Entrada manual por codigo:** lobby aceita codigo digitado ou URL de convite colada.

### Melhorias

- **Chute de bomba mais tatico:** bomba chutada pode quebrar crate, revelar drop e perde fuse conforme desliza.
- **Demolition combo:** explosoes que quebram varias crates garantem uma recompensa quando nenhuma dropou.
- **Escudo mais expressivo:** block toca SFX de deflexao e concede burst de fuga curto.
- **Feedback dialog:** contador vivo, limite local, envio desabilitado quando invalido e Escape para fechar.
- **Audio de pickup:** variantes novas de coleta e shield block com protecao anti-stack.

### Correcoes

- **Roster resiliente:** manifesto publico duplicado/truncado cai para roster aprovado.
- **Storage seguro:** UI, idioma, bot fill, retorno de sessao e telemetry toleram storage bloqueado/parcial.
- **Telemetry UUID fallback:** `crypto.randomUUID` ausente nao derruba landing.
- **Input online saneado:** direcoes invalidas em pacotes viram neutro.
- **Pausa em aba oculta:** partida local para em blur/hidden e preserva tempo/perigo.
- **Sprite trim late-load:** sprites carregados tarde recalculam bounds em vez de cachear `null`.

## Validation

Passed:
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

## Files For This Release Prep

- `DocsDev/releases/release-v0.2.3.md`
- `DocsDev/releases/release-v0.2.3.json`
- `release-assets/v0.2.3-card.png`
- `release-assets/v0.2.3-card-bg.png`
- `patchnotes.md`
- `changelog.md`

---

# Patch Notes - 2026-07-06 v0.2.2 Official Patch

**Project:** AutoWebGame / BOMBA
**Path:** C:\Projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-07-06
**State:** release candidate for `v0.2.2`

## Executive Summary

Patch `v0.2.2` consolidates the local CODEX/swarm work done after the official `v0.2.1` release. The GitHub cloud state (`origin/main`) was still on `v0.2.1` (`b783537`) while local `main` accumulated 17 code commits before release docs/art generation.

Main themes:
- Local matches now support selectable bot intensity.
- Match flow communicates round starts, match-end actions and local shortcuts more clearly.
- Lobby/invite UX is more resilient around reconnects, pasted URLs and clipboard fallback.
- HUD feedback is sharper for critical danger and recent power-up pickups.
- Input, storage, SFX and arena theme paths are more robust.

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| Latest release before patch | `v0.2.1` | `v0.2.1` | GitHub release published 2026-07-06T18:07:52Z. |
| Branch state before release docs | `main` ahead 17 | `origin/main` at `b783537` | Local included post-release swarm branches. |
| Integration | Cherry-pick/combined conflict resolution | Not yet pushed at audit time | Overlay and package script conflicts resolved locally. |
| Working tree after validation | Clean before docs/art edits | Clean remote | Release docs/art are final local additions. |

## Sessions Checked Since v0.2.1

| Session / agent | Evidence checked | Changes found |
|-----------------|------------------|---------------|
| CODEX / swarm | `git branch -vv --all`, worktrees, reflog, `v0.2.1..HEAD`, `DocsDev/swarm-coordination.md` | Yes: all code changes in this patch. |
| Claude | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Claude after `v0.2.1`. |
| ZCode | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to ZCode after `v0.2.1`. |
| Wispr Flow | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Wispr Flow after `v0.2.1`. |

If Claude, ZCode or Wispr Flow worked outside Git or outside the inspected worktrees, that work did not leave a local versioned trace in this repository.

## Patch Notes Candidate

### Novidades

- **Intensidade local contra bots:** escolha 1, 2 ou 3 bots antes de iniciar a partida local.
- **Cue de inicio de rodada:** overlay curto orienta o jogador quando a rodada fica ativa.
- **Atalhos no resultado local:** `Enter`/`Space` reinicia; `Esc` volta ao menu.
- **Feedback de power-up:** HUD destaca pickups recem coletados.

### Melhorias

- **Lobby mais resiliente:** seat/ready exigem socket aberto e mostram estado de reconnect.
- **Convites melhores:** copiar convite tem fallback e colar URL completa extrai o codigo correto.
- **Landing com memoria:** retorno de sessao mostra ultimo contexto de entrada/resultado.
- **Foco e touch melhores:** controles ganharam foco visivel e tamanho minimo para toque.
- **Chrome local limpo:** partida local esconde controles online que nao se aplicam.

### Correcoes

- **Input sem scroll:** teclas de jogo nao rolam a pagina quando fora de campos interativos.
- **Storage seguro:** client e telemetria toleram `localStorage` bloqueado ou parcial.
- **SFX sem stack:** bomba/pickup nao duplicam audio no mesmo frame.
- **Temas corrigidos:** sprite themes usam paths runtime validos.
- **HUD de perigo:** estado `DANGER` aparece para explosao iminente sem atropelar guard/channel/down.

## Validation

Passed:
- `npm run build`
- `npm run compile:esm`
- `node tests/lobby-disconnected-actions-check.mjs`
- `node tests/arena-theme-runtime-paths-check.mjs`
- `node tests/session-return-brief-check.mjs`
- `node tests/session-room-invite-link-check.mjs`
- `node tests/room-code-entry-normalization-check.mjs`
- `node tests/touch-focus-css-check.mjs`
- `node tests/local-match-chrome-check.mjs`
- `node tests/hud-critical-state-feedback-check.mjs`
- `node tests/match-result-shortcuts-check.mjs`
- `node tests/sound-manager-variation-check.mjs`
- `node tests/growth-telemetry-storage-check.mjs`
- `node tests/input-page-scroll-check.mjs`
- `node tests/round-start-cue-check.mjs`
- `node tests/menu-bot-fill-check.mjs`
- `node tests/powerup-hud-slots-check.mjs`
- `node tests/danger-overlay-check.mjs`
- `node tests/round-outcome-pause-check.mjs`
- `node tests/lobby-rules-check.mjs`
- `node tests/matchmaking-session-state-check.mjs`
- `node tests/online-four-player-check.mjs`
- `node tests/online-character-selection-index-check.mjs`
- `node tests/server-character-skill-mapping-check.mjs`
- `node tests/character-skill-contract-check.mjs`
- `node tests/online-skill-reconcile-check.mjs`
- `node tests/bomb-hit-window-check.mjs`
- `node tests/bomb-chain-reaction-check.mjs`
- `node tests/powerup-drop-rate-check.mjs`
- `node tests/shield-powerup-check.mjs`
- `node tests/player-sprite-render-check.mjs`
- `node tests/bot-target-selection-check.mjs`
- `node tests/bot-intel-check.mjs`
- `node tests/bot-remote-detonation-check.mjs`
- `node tests/bot-survival-10s-check.mjs`
- `node tests/bot-opening-discipline-check.mjs`
- `node tests/bot-powerup-priority-check.mjs`
- `node tests/bot-spawn-protection-check.mjs`
- `node tests/character-roster-manifest-fallback-check.mjs`
- `node tests/character-roster-manifest-sync-check.mjs`

## Files For This Release Prep

- `DocsDev/releases/release-v0.2.2.md`
- `DocsDev/releases/release-v0.2.2.json`
- `release-assets/v0.2.2-card.png`
- `patchnotes.md`
- `changelog.md`

---

# Patch Notes - 2026-07-06 v0.2.1 Official Patch

**Project:** AutoWebGame / BOMBA
**Path:** C:\Projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-07-06
**State:** release candidate for `v0.2.1`

## Executive Summary

Patch `v0.2.1` consolidates the local work done after the official `v0.2.0` release. The GitHub cloud state (`origin/main`) was 11 commits behind local `main` after merging the swarm branch. Integration was clean: no Git conflicts, no dirty working tree before release docs/art generation, and the critical test sweep passed.

Main themes:
- Bot behavior is fairer in 3/4-player matches.
- Utility powerups are now real crate drops.
- Hidden-tab input latching is fixed.
- Character roster loading has a reliable approved-manifest fallback.
- Server tick timing is protected from clock regressions.
- Release documentation and CodeGraph guidance are current.

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| Latest release before patch | `v0.2.0` | `v0.2.0` | GitHub release published 2026-06-22. |
| Branch state before push | `main` ahead 11 | `origin/main` behind local | Local included CodeGraph docs and swarm gameplay fixes. |
| Integration | Fast-forward from swarm branch | Not yet pushed at audit time | No conflicts found. |
| Working tree | Clean before release prep | Clean remote | Release docs/art are the final local additions. |

## Sessions Checked Since v0.2.0

| Session / agent | Evidence checked | Changes found |
|-----------------|------------------|---------------|
| CODEX / codex-swarm | `git branch -vv --all`, reflog, worktrees, `DocsDev/swarm-coordination.md` | Yes: all gameplay, input, UX, docs and test commits in this patch. |
| Claude | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Claude after `v0.2.0`. |
| ZCode | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to ZCode after `v0.2.0`. |
| Wispr Flow | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Wispr Flow after `v0.2.0`. |

If Claude, ZCode or Wispr Flow worked outside Git or outside the inspected worktrees, that work did not leave a local versioned trace in this repository.

## Patch Notes Candidate

### Novidades

- **Utility drops nas crates:** `shield-up`, `bomb-pass-up` e `kick-up` agora entram no pool real de drops.
- **Referencia de controles locais:** landing mostra movimento, bomba e ultimate antes de iniciar partida contra bots.

### Melhorias

- **Bots miram melhor:** bots ignoram oponentes derrotados, priorizam alvos vivos e evitam perseguir inimigos com spawn protection.
- **Patrulha mais segura:** bot evita tiles que ficariam perigosos dentro da janela estrategica de chegada.
- **Explosoes menos repetitivas:** som de explosao alterna variantes existentes sem repetir back-to-back quando ha alternativa.

### Correcoes

- **Input sem travar:** blur/aba oculta limpa teclas seguradas, presses acumulados e prioridade de movimento.
- **Roster resiliente:** falha no manifest publico nao derruba mais o roster para placeholders.
- **Tick autoritativo monotonic:** amostras invalidas ou regressivas do relogio nao fazem o Worker voltar `lastUpdateAtMs`.

### Sistemas e QA

- **CodeGraph documentado:** inventario, contexto e mapa visual entram como referencia operacional.
- **Swarm coordination atualizado:** claims e evidencias do trabalho de agentes ficam rastreaveis.
- **Cobertura focada:** novos checks cobrem bot target, input visibility, roster fallback, SFX variation e server tick.

## Validation

Passed:
- `npm run build`
- `npm run compile:esm`
- `node tests/server-tick-catchup-check.mjs`
- `node tests/sound-manager-variation-check.mjs`
- `node tests/powerup-drop-rate-check.mjs`
- `node tests/powerup-hud-slots-check.mjs`
- `node tests/shield-powerup-check.mjs`
- `node tests/bomb-push-check.mjs`
- `node tests/character-roster-manifest-fallback-check.mjs`
- `node tests/character-roster-manifest-sync-check.mjs`
- `node tests/player-sprite-render-check.mjs`
- `node tests/bot-target-selection-check.mjs`
- `node tests/bot-intel-check.mjs`
- `node tests/bot-remote-detonation-check.mjs`
- `node tests/bot-survival-10s-check.mjs`
- `node tests/bot-opening-discipline-check.mjs`
- `node tests/bot-powerup-priority-check.mjs`
- `node tests/bot-spawn-protection-check.mjs`
- `node tests/input-visibility-clear-check.mjs`
- `node tests/input-transition-check.mjs`
- `node tests/lobby-rules-check.mjs`
- `node tests/matchmaking-session-state-check.mjs`
- `node tests/online-four-player-check.mjs`
- `node tests/online-character-selection-index-check.mjs`
- `node tests/server-character-skill-mapping-check.mjs`
- `node tests/character-skill-contract-check.mjs`
- `node tests/online-skill-reconcile-check.mjs`
- `node tests/bomb-hit-window-check.mjs`
- `node tests/bomb-chain-reaction-check.mjs`

## Files For This Release Prep

- `DocsDev/releases/release-v0.2.1.md`
- `DocsDev/releases/release-v0.2.1.json`
- `release-assets/v0.2.1-card.png`
- `patchnotes.md`
- `changelog.md`

---

# Patch Notes - 2026-06-07 (grokassets-clean) Safe Sync (PC vs GitHub Research)

**Project:** AutoWebGame (browser-based auto web game with animations, SFX, public assets, grokimagine, tests, Vite/TS, launcher)
**Path:** C:\projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-06-07
**State:** grokassets-clean + mds update (dirty from deletes + changelog/patch touches) | Synced on prior commits (last safe 2026-06-02+clean)

## Executive Summary
Research via git status (heavy D in grokassets/brand/pitch-deck/social + M changelog.md + patchnotes.md), git log (last: 2026-06-02+clean safe commit), fetch (ahead 0 on committed), diff --stat (deletes of duplicated brand assets + md updates).

PC vs GitHub: committed tree in sync (or was at last safe). Current mutations are the systematic removal of per-project grokassets (pitch decks, banners, social headers, brand guidelines — now centralized in desktop GrokAssets or central repo) + refresh of patch/changelog by agents. No new feature code in this window beyond the cleanup and doc maintenance.

This is part of the global grokassets deduplication sweep across 15+ projects on the PC (AutoWebGame, LojaSync, LUCA-AI, Kamui, Yume, ChessCam, cortex-pessoal, etc.).

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| HEAD | (post 2026-06-02 safe) | matches on committed | Synced |
| Working tree | dirty (deletes + mds) | clean | grokassets cleanup + doc refresh |
| 24h commits | 0 new | 0 | Activity is uncommitted deletes/mds |
| Divergence | grokassets D + patch/changelog M | none | PC has the cleanup state |

### Key changes
**Deletes (grokassets consolidation):**
- grokassets/BRAND-USAGE-GUIDELINES.md , README.md
- grokassets/banners/marketing/pitch-deck/ (bg-v1.svg through bg-v28.svg — 28 files)
- Other grokassets/banners/social , youtube-channel , etc. (common pattern)

**Modified:**
- changelog.md , patchnotes.md (agent-driven updates + this research)

No major source code changes reported in this 24h dirty tree beyond maintenance.

## Multi-Agent Parallel Work & Conflict Handling
Many agents/loops performed parallel cleanup of duplicated brand assets (grokassets/*) across all active projects while also touching patchnotes/changelog in each. This created consistent "dirty" state with D files + M mds.

No conflicts. Current tree (deletes + updated mds) is the canonical PC snapshot of the dedup + doc sync.

Reconciliation: stage the deletes (intentional cleanup), the mds (with research), commit as safe checkpoint. Other projects (LojaSync, LUCA-AI, Kamui, Yume, ChessCam, etc.) received analogous treatment.

## Files for This Safe Commit
- patchnotes.md , changelog.md (updated with 2026-06-07 research)
- All grokassets/* deletes (brand centralization)
- Any other M from status

## Conclusion & Next
PC version researched vs GitHub (synced on code; local has grokassets cleanup + refreshed docs). Safe commit captures the ecosystem cleanup state.

**Commit message target:** `2026-06-07 (grokassets-clean) safe commit`

Push main. Next: verify no broken references to deleted assets (update any remaining docs/images if needed), continue game features/animations/tests as per prior roadmap.

See changelog.md. Prior 2026-06-02 content in history.

---
Prior patch (2026-06-02): clean safe state before this cleanup sweep. See git or previous file version.
(End of 2026-06-07.)
