# Swarm Ledger - Geral

## 2026-07-14 - Imutabilidade runtime do FrontendStore

- Automacao: `SOLO`.
- Escopo registrado antes da implementacao: alterar somente `src/UiLayouts/frontend-store.ts`, criar `tests/frontend-store-immutability-check.mjs` e registrar esta rodada nos dois ledgers; preservar diffs alheios; commit local seletivo; sem push/deploy/branch/worktree.
- Evidencia antes: `getSnapshot()` e listeners prometem `Readonly<FrontendState>` apenas no tipo, mas retornam o mesmo objeto mutavel em runtime; um consumidor JavaScript pode alterar `route` sem passar por `setRoute` e sem notificacao.
- Criterio de sucesso: congelar cada snapshot inicial/atualizado, preservar deduplicacao e notificacoes, e passar teste focal, contrato da arquitetura frontend, build e diff-check seletivo.
- Antes -> depois: os snapshots compartilhados podiam ser mutados em JavaScript apesar do tipo `Readonly`; agora o estado inicial e cada novo estado sao congelados com `Object.freeze`, sem alterar a API publica.
- Evidencia RED -> GREEN: o teste falhou inicialmente porque `Object.isFrozen(initialSnapshot)` era `false`; depois confirmou `TypeError` na mutacao, rota interna preservada, snapshot notificado congelado e apenas uma notificacao para updates equivalentes.
- Validacao: `npm run compile:esm`, teste focal, `npm run test:frontend-architecture`, `npm run build` (56 modulos) e `git diff --check` seletivo passaram.
- Revisao/fechamento: diff funcional limitado ao store e ao teste novo; ledgers preservados fora do commit por conterem conteudo concorrente; commit local seletivo somente de runtime/teste; sem push ou deploy.

## 2026-07-14 - Contagem regressiva de perigo no HUD

- Automacao: `SOLO`.
- Correcao de escopo: o commit proprio `4f3657b` foi desfeito com `git revert --no-commit`, removendo somente o script npm de loading e seu registro, sem reset/rebase e sem incorporar mudancas concorrentes.
- Evidencia antes: `getPlayerHudStatus` ja calculava e exportava `dangerEtaMs`, mas o jogador via apenas o rotulo generico `DANGER`; CodeGraph confirmou os consumidores no HUD normal, HUD compacto e estado textual.
- Antes -> depois: perigo iminente deixa de mostrar somente `DANGER` e passa a mostrar `DANGER 0.8s` (valor dinamico em decimos), tornando o tempo de reacao perceptivel sem alterar simulacao, fuse ou regras de dano.
- Classificacao: intervencao criativa pequena de feedback de gameplay/HUD, baixo risco e comprovavel por teste focal.
- Arquivos funcionais: `src/Engine/game-app.ts` e `tests/hud-critical-state-feedback-check.mjs`; este ledger registra a rodada.

## 2026-07-14 - Script npm para cursor de botao desabilitado

- Automacao: `SOLO`.
- Escopo registrado antes da implementacao: expor o check existente `tests/disabled-button-cursor-check.mjs` via um script npm dedicado; sem alterar runtime, CSS, gameplay, rede, assets ou mudancas concorrentes.
- Classificacao: infraestrutura de teste CSS, baixo risco e comprovavel por execucao focal.
- Evidencia antes: a execucao direta passou com regra disabled, cursor de indisponibilidade, estado esmaecido e exclusao dos estados hover/active verdadeiros, mas o check nao aparecia nos scripts npm.
- Mudanca: adicionado somente `test:disabled-button-cursor`, executando o check existente sem compilacao desnecessaria.
- Validacao: `npm run test:disabled-button-cursor` passou (`pass: true`); `npm run test:package-scripts-unique` passou com 149 scripts; `npm run build` passou com 56 modulos transformados; `git diff --check` seletivo passou com apenas avisos LF -> CRLF.
- Revisao de escopo: a unica insercao funcional desta rodada e o novo script; a insercao preexistente `test:lab-fast-action-buffer` em `package.json` e todas as demais mudancas concorrentes foram preservadas e excluidas do staging seletivo.
- Commit: aprovado para criacao local seletiva; sem push ou deploy conforme instrucao explicita desta rodada.

## 2026-07-13 - Feedback de apontador no volume

- Automacao: `SOLO`.
- Intencao registrada: entregar uma intervencao visual pequena e perceptivel no controle de volume, sem alterar audio, gameplay, rede ou modulos de orquestracao e sem incorporar mudancas concorrentes.
- Classificacao inicial: comprovavel por contrato CSS; a inspecao atual mostrou que `.experience-audio__range` tinha somente layout e `accent-color`, embora o foco por teclado ja estivesse coberto.
- Antes -> depois: o slider nao comunicava interacao ao mouse alem do controle nativo; agora mostra cursor de apontador, clareia no hover e escurece durante o arraste/clique, com transicao curta de 140 ms.
- Arquivos previstos: `src/UiLayouts/main.css`, `tests/audio-range-focus-check.mjs` e este ledger.
- Criterio de sucesso: teste focal deve comprovar foco preservado e os novos estados de apontador; build e diff-check seletivo devem passar antes de commit seletivo.
- Resultado: `npm run test:audio-range-focus` passou com foco, cursor/transicao e estados hover/active verdadeiros; `node tests/touch-focus-css-check.mjs` e `node tests/reduced-motion-css-check.mjs` passaram; `npm run build` passou com 42 modulos transformados; `git diff --check` seletivo passou (somente avisos LF -> CRLF).
- Classificacao final: comprovada para feedback visual de apontador e preservacao dos contratos CSS automatizados; impacto subjetivo e aparencia entre navegadores nao foram medidos manualmente.
- Revisao de escopo: diff funcional limitado ao CSS do range e ao fortalecimento do teste existente; este registro documenta a rodada, e todas as mudancas alheias permaneceram fora do staging seletivo.

## 2026-07-13 - Script npm para foco acessivel do controle de audio

- Automacao: `SOLO`.
- Intencao registrada antes da implementacao: expor o check existente `tests/audio-range-focus-check.mjs` via um script npm dedicado; limitar a mudanca a infraestrutura de teste e a este ledger, sem tocar runtime, gameplay, rede, CSS ou arquivos concorrentes.
- Classificacao: infraestrutura de teste de acessibilidade, baixo risco.
- Evidencia antes: a execucao direta do check passou, validando seletor `:focus-visible`, outline de 2 px e offset de 2 px, mas o teste nao estava acessivel pelos scripts npm.
- Mudanca: adicionado somente `test:audio-range-focus`, executando o check CSS existente sem compilacao desnecessaria.
- Validacao: `npm run test:audio-range-focus` passou com os tres checks verdadeiros e `pass: true`; `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: a unica insercao funcional desta rodada e o script `test:audio-range-focus`; as tres outras insercoes preexistentes em `package.json` e todas as demais mudancas concorrentes foram preservadas e excluidas do staging seletivo.
- Commit: aprovado pelas validacoes e sera criado seletivamente com apenas o script npm e este registro.

## 2026-07-13 - Tema surpresa estavel por URL

- Automacao: `SOLO`.
- Intencao registrada antes da implementacao: adicionar um pequeno easter egg isolado ao seletor de arena, aceitando `?arenaTheme=surprise` e escolhendo um tema de forma deterministica a partir da URL; preservar todos os parametros, evitar os modulos de alto risco e nao tocar arquivos ja modificados.
- Classificacao: intervencao criativa pequena de UI/configuracao, sem alterar simulacao, colisao, rede autoritativa ou assets.
- Resultado: `resolveArenaThemeSelection` agora reconhece `arenaTheme=surprise`, deriva um tema valido por hash FNV-1a da rota e query e mantem a escolha estavel para a mesma URL; `buildArenaThemeUrl` preserva o token `surprise` e os demais parametros.
- Cobertura: o check de selecao de tema valida tema conhecido, estabilidade independente do fallback e preservacao de `room`/`utm` na URL surpresa.
- Validacao: `npm run test:arena-theme-selection` passou com 13 checks verdadeiros e `pass: true`; `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check` seletivo passou.
- Antes -> depois: antes, `surprise` era tratado como ID invalido e caia no fallback; depois, a mesma URL resolve sempre um tema oficial e compartilhavel, preservando a intencao e os demais parametros.
- Revisao de escopo: somente `src/Arenas/arena-theme-selection.ts`, `tests/arena-theme-selection-check.mjs` e este ledger; mudancas concorrentes foram preservadas e excluidas do staging.
- Commit: sera criado seletivamente apos esta atualizacao.

## 2026-07-13 - Script npm para variacao de efeitos sonoros

- Automacao: `autowebgame-enxame-geral`.
- Escopo registrado antes da implementacao: expor o check existente `tests/sound-manager-variation-check.mjs` via `package.json`; sem alterar runtime, audio, gameplay, rede ou arquivos com mudancas concorrentes.
- Classificacao: infraestrutura de teste, baixo risco e comprovavel por execucao focal.
- Evidencia antes: a execucao direta do check passou com manifesto, anti-spam, recuperacao e variacao de sons validados (`pass: true`), mas nao havia script npm dedicado.
- Mudanca: adicionado somente `test:sound-variation`, executando o check existente sem compilacao desnecessaria.
- Validacao: `npm run test:sound-variation` passou (manifesto, playback, anti-spam, recuperacao e variacao, `pass: true`); `npm run build` passou (TypeScript + Vite, 42 modulos); `git diff --check -- package.json SwarmLedger-geral.md` passou.
- Revisao de escopo: diff funcional contem uma insercao em `package.json` e este registro; mudancas preexistentes em `index.html`, `src/Engine/game-app.ts`, `tests/remote-detonation-check.mjs` e documentos/ledgers alheios foram preservadas e excluidas do staging.
- Commit: `8afb157` (`test(audio): expose sound variation check`).

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

# Swarm Ledger - geral

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de burst de partida perfeita como `npm run test:perfect-start-burst`.
- Arquivos: `package.json`
- Validacao: `npm run test:perfect-start-burst` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de lazy load do sound manager como `npm run test:sound-manager-lazy-load`.
- Arquivos: `package.json`
- Validacao: `npm run test:sound-manager-lazy-load` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de storage resiliente da growth telemetry como `npm run test:growth-telemetry-storage`.
- Arquivos: `package.json`
- Validacao: `npm run test:growth-telemetry-storage` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Executor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de limite de feedback como `npm run test:feedback-length-guard`.
- Arquivos: `package.json`
- Validacao: `npm run test:feedback-length-guard` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Executor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente do contador live do feedback como `npm run test:feedback-live-counter`.
- Arquivos: `package.json`
- Validacao: `npm run test:feedback-live-counter` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de normalizacao de codigo de sala como `npm run test:room-code-entry-normalization`.
- Arquivos: `package.json`
- Validacao: `npm run test:room-code-entry-normalization` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.

## 2026-07-09 - Governor

- Branch: `swarm-gov/autowebgame/geral`
- Entrega: exposto o teste existente de visibilidade de release como `npm run test:release-visibility`.
- Arquivos: `package.json`
- Validacao: `npm run test:release-visibility` passou.
- Risco: baixo; a mudanca adiciona apenas um alias de script para um check existente.


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
