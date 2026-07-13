# Swarm Ledger - Geral

## 2026-07-13 - Script npm para visibilidade de release

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado antes da implementacao: expor o check existente `tests/release-visibility-check.mjs` via `package.json`; sem alterar runtime, gameplay, rede ou arquivos com mudancas concorrentes.
- Evidencia antes: o check valida badge e notas da release em PT/EN, renderizacao no cliente e estilos correspondentes; a execucao direta passou, mas nao havia script npm dedicado.
- Mudanca: adicionado somente `test:release-visibility`, executando o check existente sem compilacao desnecessaria.
- Validacao: `npm run test:release-visibility` passou (oito checks verdadeiros, `pass: true`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff funcional contem uma insercao em `package.json` e este registro; mudancas preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e ledgers/documentos alheios foram preservadas e excluidas do staging.
- Commit: `12b640f` (`test(release): expose visibility check`).

## 2026-07-12 - Script npm para limite de feedback

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado: expor o check existente `tests/feedback-length-guard-check.mjs` via `package.json`; sem alterar runtime, gameplay, rede ou arquivos com mudancas concorrentes.
- Evidencia antes: o check validava o limite compartilhado de 2.000 caracteres no cliente, Worker e copy PT/EN, passava por execucao direta, mas nao possuia script npm dedicado.
- Mudanca: adicionado somente `test:feedback-length`, executando o check existente sem compilacao desnecessaria.
- Validacao: `npm run test:feedback-length` passou (`FEEDBACK_MAX_LENGTH: 2000`, checks de fonte e copy PT/EN sem falhas, `pass: true`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff funcional contem uma insercao em `package.json` e este registro; mudancas preexistentes em `DocsDev/swarm-coordination.md`, `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e ledgers alheios foram preservadas e excluidas do staging.
- Commit: `0cbde99` (`test(feedback): expose length guard check`).

## 2026-07-12 - Script npm para prioridade direcional em repeticao de input

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado: expor o check existente `tests/input-repeat-direction-priority-check.mjs` via `package.json`; sem alterar runtime, gameplay, rede ou arquivos com mudancas concorrentes.
- Evidencia antes: o check validava que eventos `repeat` antigos nao roubam a direcao fisica mais recente, mas nao possuia script npm dedicado.
- Mudanca: adicionado somente `test:input-repeat-priority`, com compilacao ESM e execucao do check existente.
- Validacao: `npm run test:input-repeat-priority` passou (`latestPhysicalPress: right`, `afterOlderKeyRepeat: right`, `repeatDidNotQueuePress: true`, `fallbackToHeldDirection: up`, `pass: true`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff funcional contem uma insercao em `package.json` e este registro; mudancas preexistentes em `DocsDev/swarm-coordination.md`, `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e ledgers alheios foram preservadas e excluidas do staging.
- Commit: pendente de criacao seletiva.

## 2026-07-12 - Script npm para fallback de manifesto publico invalido

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado: expor o teste existente `tests/character-roster-invalid-public-manifest-check.mjs` via `package.json`; sem alterar runtime, assets, gameplay, rede ou arquivos com mudancas concorrentes.
- Evidencia antes: o check exercitava o fallback para o roster aprovado quando o manifesto publico contem IDs duplicados, mas nao possuia script npm dedicado.
- Mudanca: adicionado somente `test:roster-invalid-public-manifest`, com compilacao ESM e execucao do check existente.
- Validacao: `npm run test:roster-invalid-public-manifest` passou (`pass: true`, roster aprovado com 4 IDs e sem `Ranni Copy`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff contem uma insercao funcional em `package.json` e este registro; mudancas preexistentes em `DocsDev/swarm-coordination.md`, `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e ledgers alheios foram preservadas e excluidas do staging.
- Commit: `67a0d80eff4dc1c6ef3469396b763912d595409e` (`test(assets): expose invalid roster manifest check`).

## 2026-07-12 - Script npm para biblioteca de temas

- Automacao: `autowebgame-enxame-geral`.
- Escopo: expor o teste existente `tests/arena-theme-library-check.mjs` via um unico script em `package.json`; sem alterar runtime, gameplay, rede ou arquivos com mudancas concorrentes.
- Evidencia antes: o teste focal existia, mas nao era referenciado pelos scripts npm.
- Mudanca: adicionado `test:arena-theme-library`, executando compile ESM e o check dedicado.
- Validacao: `npm run test:arena-theme-library` passou (`themeCount: 7`, `missingFiles: []`, `pass: true`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff funcional contem somente uma insercao em `package.json`; mudancas preexistentes em `DocsDev/swarm-coordination.md`, `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e ledgers alheios foram preservadas e excluidas do staging.
- Commit: pendente de criacao seletiva.

## 2026-07-12 - Script npm para normalizacao de codigo de sala

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado: expor um teste existente e orfao via `package.json`, sem alterar runtime, gameplay, rede ou arquivos ja modificados por trabalhos concorrentes.
- Evidencia antes: `tests/room-code-entry-normalization-check.mjs` existia e passava com execucao direta, mas nao era referenciado por nenhum script do `package.json`.
- Mudanca: adicionado `test:room-code-normalization`, executando `node tests/room-code-entry-normalization-check.mjs`.
- Evidencia depois: `npm run test:room-code-normalization` passou com 6 casos e `failedCases: []`; `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json` passou.
- Revisao de escopo: commit seletivo contem somente uma insercao em `package.json`; mudancas preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e demais ledgers/documentos nao foram revertidas nem incluidas.
- Commit: `0ee4781bad625cab70095d3397433de4fd9c7cf9` (`test(online): expose room code normalization check`).

## 2026-07-12 - Fixture headless de detonacao remota

- Automacao: `autowebgame-enxame-geral`
- Classificacao: correcao de infraestrutura de teste, baixo risco, sem alteracao de runtime.
- Evidencia: `DocsDev/swarm-coordination.md` registrava `test:remote` bloqueado porque o contexto Canvas falso nao implementava `translate`, metodo agora usado pelo renderer.
- Escopo: somente adicionar `translate: noop` a `tests/remote-detonation-check.mjs`; gameplay, rede, producao e `index.html` preservados.
- Validacao parcial: `node --check tests/remote-detonation-check.mjs` e `git diff --check -- tests/remote-detonation-check.mjs DocsDev/swarm-coordination.md SwarmLedger-geral.md` passaram.
- Bloqueio: `npm run test:remote` nao chegou ao harness porque `compile:esm` falhou em `src/Engine/game-app.ts(185,7)` com `POWER_UP_SPAWN_POP_MS` ainda nao usada, arquivo pertencente ao claim concorrente `ux-powerup-spawn-pop-120ms`. Build integral fica bloqueado pela mesma falha; nenhuma alteracao de terceiros foi revertida.
- Commit: nao criado, pois teste focal e build integral nao ficaram validados.

## 2026-07-11 - Bot prioriza o primeiro escudo

- Automacao: `autowebgame-enxame-geral`
- Escopo: pequena intervencao de gameplay isolada na prioridade de coleta dos bots; nenhum arquivo alheio foi revertido.
- Classificacao: gameplay / IA de sobrevivencia, baixo risco, comportamento compartilhado local e servidor por meio de `getPowerUpPriorityScore`.
- Mudanca: bot sem cargas de escudo agora atribui prioridade 500 ao primeiro `shield-up`, acima de upgrades ofensivos; cargas seguintes preservam a prioridade gradual anterior.
- Prova: `tests/bot-powerup-priority-check.mjs` cobre escudo versus bomba em distancia equivalente e manteve os cenarios anteriores.
- Validacao: `npm run test:bot-powerup` e `npm run build` passaram.

## 2026-07-09 00:55 BRT - Rodada bloqueada por branch/worktree de outro enxame

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md` e `SwarmLedger-ready-to-ship.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar arquivos, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git status --short --branch`, `git diff --name-status` e `git ls-files --others --exclude-standard` confirmaram o estado acima.

## 2026-07-09 - Rodada bloqueada por worktree sujo

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md` e `SwarmLedger-documentacao.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar arquivos, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git status --short --branch` retornou `## swarm/autowebgame/documentacao` com as alteracoes acima.
- Observacao final: uma nova checagem tambem mostrou `SwarmLedger-bugs.md` untracked; arquivo nao inspecionado nem alterado por esta rodada.

## 2026-07-09 00:35 BRT - Rodada bloqueada por branch/worktree de outro enxame

- Automacao: `autowebgame-enxame-geral`
- Branch encontrada: `swarm/autowebgame/documentacao`
- Estado encontrado antes de editar: `index.html` modificado; `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md` e `SwarmLedger-ready-to-ship.md` untracked.
- Decisao: encerrado sem trocar branch, sem implementar melhoria e sem disputar `index.html` ou ledgers de outros enxames, conforme regra fixa para repo sujo por outro trabalho.
- Evidencia: `git -C C:\Projetos\AutoWebGame status --short --branch` retornou `## swarm/autowebgame/documentacao` com as alteracoes acima.
