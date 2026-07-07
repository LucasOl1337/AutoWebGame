![v0.2.2](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.2.2/v0.2.2-card.png)

# v0.2.2 - UX de arena, lobby resiliente e feedback vivo (06/07/2026)

Patch oficial do AutoWebGame/BOMBA consolidando o trabalho local feito depois do release `v0.2.1`, com foco em UX de partida, feedback de HUD, fluxos de lobby, input resiliente e estabilidade de storage/audio.

## Novidades

- **Intensidade local contra bots:** a landing agora permite escolher 1, 2 ou 3 bots antes de iniciar a partida local.
- **Cue de inicio de rodada:** cada nova rodada mostra um aviso curto no canvas, inclusive depois de reset/round transition.
- **Atalhos no resultado local:** `Enter`/`Space` reinicia a partida e `Esc` volta ao menu no resultado local.
- **Feedback de power-up recem coletado:** HUD destaca upgrades coletados e exibe aviso temporario do pickup.

## Melhorias

- **Lobby mais honesto em reconexao:** acoes de seat/ready exigem socket aberto e mostram feedback de reconexao quando indisponiveis.
- **Retorno de sessao na landing:** a tela inicial lembra a ultima entrada/resultado recente e deixa o jogador pronto para voltar.
- **Foco e touch targets melhores:** botoes, toggles, chat, tabs e seletor de personagem ganharam foco visivel e areas minimas em touch.
- **Chrome local mais limpo:** partidas locais contra bots escondem chrome de online/lobby que nao se aplica ao modo local.
- **Overlay de proxima acao:** fim de rodada/partida mostra placar e proximo passo com mais clareza.

## Correcoes

- **Convites e codigos de sala:** copiar convite tem fallback quando clipboard falha; colar URL completa extrai o `room` correto.
- **Input sem scroll acidental:** teclas de jogo capturadas fora de campos interativos nao rolam a pagina.
- **Storage seguro:** telemetria, personagem preferido, intensidade de bot e retorno de sessao toleram storage bloqueado/parcial.
- **SFX sem stack:** `bombPlace` e `powerCollect` sao rate-limited em janelas curtas para evitar clicks/chimes duplicados no mesmo frame.
- **Temas sprite corrigidos:** `arcane-citadel`, `verdant-ruins` e `skyfoundry-bastion` usam paths runtime validos.
- **HUD de perigo critico:** jogador em tile prestes a explodir recebe estado `DANGER`, respeitando prioridade de guard/channel/down.

## Sessoes verificadas desde o ultimo release

| Sessao / agente | Evidencia encontrada | Resultado para o patch |
|---|---|---|
| CODEX / swarm | Branches/worktrees `swarm/*`, reflog, commits locais, `DocsDev/swarm-coordination.md` e diff `v0.2.1..HEAD` | Mudancas de gameplay/UX/input/lobby/audio/storage foram auditadas, resolvidas e integradas. |
| Claude | Busca textual, branches, worktrees, reflog e docs locais | Nenhum commit ou arquivo versionado atribuivel a Claude depois de `v0.2.1`. |
| ZCode | Busca textual, branches, worktrees, reflog e docs locais | Nenhum commit ou arquivo versionado atribuivel a ZCode depois de `v0.2.1`. |
| Wispr Flow | Busca textual, branches, worktrees, reflog e docs locais | Nenhum commit ou arquivo versionado atribuivel a Wispr Flow depois de `v0.2.1`. |

Observacao: se Claude, ZCode ou Wispr Flow executaram trabalho fora do Git ou fora das worktrees inspecionadas, esse trabalho nao deixou rastro versionado local no repo auditado.

## Local vs nuvem

- Nuvem verificada com `git fetch --tags --prune`, `git ls-remote --tags origin` e `gh release list --repo LucasOl1337/AutoWebGame`.
- Ultimo release oficial na nuvem antes deste patch: `v0.2.1`, publicado em 2026-07-06T18:07:52Z.
- `origin/main` e a tag remota `v0.2.1` apontavam para `b783537`.
- `main` local ficou 17 commits a frente de `origin/main` apos integrar as sessoes de codigo; este release adiciona docs/arte finais antes do push.
- Nao houve conflito Git remanescente; conflitos resolvidos combinaram overlays/atalhos/cue de rodada e scripts de teste.

## Mudancas por sessao

| Sessao | Mudancas |
|---|---|
| `fix-lobby-actions-disconnected` | Bloqueia acoes de lobby quando o socket nao esta aberto e cobre estados de reconnect. |
| `fix-arena-theme-tilepaths` | Corrige paths runtime dos temas sprite e adiciona regressao para tiles. |
| `ux-session-return-brief` | Persiste retorno de sessao/resultado local e renderiza resumo na landing. |
| `fix-room-code-normalization` / `fix-lobby-join-trimmed-code` | Copia convite com fallback e normaliza codigos vindos de URLs coladas/encodadas. |
| `ux-accessible-touch-focus` | Amplia foco visivel e touch targets em controles importantes. |
| `fix-local-match-chrome` | Remove chrome de lobby/chat/online na partida local contra bots. |
| `hud-critical-state-feedback` | Mostra `DANGER` no HUD para perigo iminente. |
| `ux-match-end-next-actions` / `ux-match-result-shortcuts` | Exibe placar/proxima acao e adiciona atalhos locais de rematch/menu. |
| `audio-sfx-stack-guard` | Rate-limit curto para `bombPlace` e `powerCollect`. |
| `ux-telemetry-storage-fallback` / integracao | Telemetria e storage do client toleram bloqueio ou APIs parciais. |
| `powerup-telegraph-polish` | HUD destaca powerups coletados recentemente. |
| `ux-round-start-cue` | Cue visual curto no inicio das rodadas. |
| `fix-input-page-scroll` | Teclas de jogo previnem scroll fora de campos interativos. |
| `ux-local-bot-intensity-selector` | Seletor local de 1/2/3 bots com persistencia e teste. |

## Validacao

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

Todos os checks acima passaram antes da preparacao final do release.

## Arte

- `release-assets/v0.2.2-card.png`

---

Notas completas geradas para o GitHub Release oficial `v0.2.2`.
