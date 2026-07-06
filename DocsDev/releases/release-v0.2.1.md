![v0.2.1](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.2.1/v0.2.1-card.png)

# v0.2.1 - Bot polish, utility drops e estabilidade (06/07/2026)

Patch oficial do AutoWebGame/BOMBA consolidando o trabalho local feito depois do release `v0.2.0`, com foco em comportamento de bots, powerups utilitarios, estabilidade de input, fallback de assets e documentacao operacional.

## Novidades

- **Utility drops nas crates:** `shield-up`, `bomb-pass-up` e `kick-up` agora entram no pool deterministico de drops e aparecem no HUD/estado de powerups.
- **Referencia de controles na landing:** a primeira tela mostra movimento, bomba e ultimate para reduzir atrito antes da partida local contra bots.

## Melhorias

- **Bots mais justos em partidas 3/4P:** bots passam a escolher oponentes vivos/ativos, priorizar alvos vulneraveis e evitar perseguir inimigos com spawn protection.
- **Patrulha mais segura:** movimentos de patrulha consideram a janela estrategica de perigo antes de entrar em tiles que explodiriam logo depois.
- **Explosoes com variacao:** o SFX de bomba alterna entre variantes existentes e evita repetir a mesma explosao quando ha alternativa.

## Correcoes

- **Input sem travar ao trocar de aba:** teclas seguradas e presses acumulados sao limpos quando a janela perde foco ou o documento fica oculto.
- **Roster com fallback aprovado:** se o manifest publico de personagens falhar, o loader recupera o roster TypeScript aprovado em vez de cair para placeholders.
- **Clock monotonic no Worker:** o pump autoritativo nao retrocede `lastUpdateAtMs` com amostras invalidas ou regressivas.

## Sistemas e QA

- **CodeGraph inventory:** inventario estrutural, contexto e mapa visual entram no repo para orientar agentes futuros.
- **Swarm coordination:** a documentacao local registra claims, evidencias e commits do trabalho recorrente de agentes.
- **Novos testes focados:** cobertura adicionada para bot target, input visibility, fallback de roster, SFX variation e regressao de server tick.

## Sessoes verificadas desde o ultimo release

| Sessao / agente | Evidencia encontrada | Resultado para o patch |
|---|---|---|
| CODEX / codex-swarm | Branches locais `codex-swarm` e `swarm/fix-stuck-input-on-hide-20260706-1700`, reflog e `DocsDev/swarm-coordination.md` | Mudancas rastreadas e integradas neste patch. |
| Claude | Busca textual, reflog, branches e worktrees locais | Nenhum commit ou arquivo versionado atribuivel a Claude depois de `v0.2.0`. |
| ZCode | Busca textual, reflog, branches e worktrees locais | Nenhum commit ou arquivo versionado atribuivel a ZCode depois de `v0.2.0`. |
| Wispr Flow | Busca textual, reflog, branches e worktrees locais | Nenhum commit ou arquivo versionado atribuivel a Wispr Flow depois de `v0.2.0`. |

Observacao: se Claude, ZCode ou Wispr Flow executaram trabalho fora do Git ou fora destas worktrees, esse trabalho nao deixou rastro versionado local no repo auditado.

## Local vs nuvem

Antes deste release, `origin/main` estava 11 commits atras da `main` local. A linha local continha reparo documental do `v0.2.0`, inventario CodeGraph e commits do swarm de 06/07/2026. A integracao local foi feita por fast-forward limpo para a `main`, sem conflitos.

## Validacao

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

Todos os checks acima passaram antes da preparacao final do release.

---

Notas completas geradas para o GitHub Release oficial `v0.2.1`.
