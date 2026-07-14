## 2026-07-13 - Correcao da capitalizacao do manifesto no README

- Escopo reservado: corrigir somente a referencia do manifesto de personagens em `README.md` para o caminho realmente rastreado pelo Git e registrar a validacao neste ledger, sem tocar nas mudancas preexistentes.
- Evidencia inicial: `README.md` apontava para `public/assets/characters/manifest.approved.json`, mas `git ls-tree -r --name-only HEAD public` confirma `public/Assets/Characters/Animations/manifest.approved.json`; a diferenca quebra a referencia em ambientes case-sensitive.
- Validacoes planejadas: existencia do destino rastreado, `npm run test:roster-sync`, `npm run build`, `git diff --check` e revisao seletiva do escopo.
- Implementacao: a referencia em `README.md` agora usa `public/Assets/Characters/Animations/manifest.approved.json`, exatamente como o arquivo aparece na arvore rastreada.
- Validacao concluida: `npm run test:roster-sync` passou (`pass: true`), `npm run build` passou (42 modulos), e `git diff --check -- README.md SwarmLedger-documentacao.md` passou.
- Revisao de escopo: diff funcional limitado a uma linha em `README.md`; este ledger registra reserva e resultado. Commit seletivo autorizado apenas para esses dois arquivos.

## 2026-07-12 - Exposicao do teste de fallback UUID da telemetria

- Escopo reservado: adicionar somente um script npm para o teste existente `tests/growth-telemetry-uuid-fallback-check.mjs` em `package.json` e registrar a validacao neste ledger, sem tocar nas mudancas preexistentes.
- Evidencia inicial: `DocsDev/swarm-coordination.md` registra `fix-telemetry-uuid-fallback`, e o teste dedicado existe, mas `package.json` nao oferece comando `test:growth-telemetry-uuid-fallback`.
- Validacoes planejadas: novo script npm, teste adjacente de retry, build, `git diff --check` e revisao seletiva do escopo.
- Implementacao: `package.json` agora expoe `test:growth-telemetry-uuid-fallback`, reutilizando o teste dedicado existente e o mesmo preparo ESM dos checks adjacentes.
- Validacao concluida: `npm run test:growth-telemetry-uuid-fallback` passou (`pass: true`), `npm run test:growth-telemetry-retry` passou (`pass: true`), `npm run build` passou (42 modulos), e `git diff --check -- package.json SwarmLedger-documentacao.md` passou.
- Revisao de escopo: diff funcional limitado a uma linha em `package.json`; este ledger registra reserva e resultado. Commit seletivo autorizado apenas para esses dois arquivos.

## 2026-07-12 - Correcao de referencia do manifesto no README

- Escopo reservado: corrigir somente o caminho obsoleto do manifesto de personagens em `README.md` e validar a documentacao contra o arquivo real, sem tocar nas mudancas preexistentes.
- Evidencia inicial: `README.md` aponta para `public/Assets/Characters/Animations/manifest.approved.json`, enquanto o inventario CodeGraph registra `public/assets/characters/manifest.approved.json`.
- Validacoes planejadas: existencia do destino, teste de sincronizacao do roster, build, diff-check e revisao seletiva do escopo.
- Implementacao: referencia em `README.md` atualizada para `public/assets/characters/manifest.approved.json`; nenhuma mudanca preexistente foi alterada.
- Validacao concluida: `npm run test:roster-sync` passou (`pass: true`), `npm run build` passou (42 modulos), e `git diff --check -- README.md SwarmLedger-documentacao.md` passou.
- Revisao de escopo: diff funcional limitado a uma linha em `README.md`; este ledger registra reserva e resultado. Commit seletivo autorizado apenas para esses dois arquivos.

## 2026-07-09 - Automacao documentacao

- Branch: `swarm/autowebgame/documentacao` criada a partir de `main`.
- Bloqueio: repositorio ja estava sujo antes desta execucao.
- Arquivos preexistentes detectados: `index.html` modificado e `DocsDev/qa-browser-loop.md` nao rastreado.
- Acao tomada: nenhum documento operacional foi alterado alem deste ledger; encerrado para nao misturar trabalho de outro fluxo.

## 2026-07-09 - Automacao documentacao

- Branch confirmada: `swarm/autowebgame/documentacao`.
- Bloqueio: repositorio ainda iniciou sujo antes de qualquer edicao desta execucao.
- Evidencia `git status --short --branch`: `index.html` modificado; nao rastreados `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md`, `SwarmLedger-ready-to-ship.md`.
- Acao tomada: somente este ledger foi atualizado; nenhuma documentacao operacional foi alterada para evitar misturar fluxos.

## 2026-07-09 00:55:11 -03:00 - Automacao documentacao

- Branch confirmada: `swarm/autowebgame/documentacao`.
- CodeGraph de `C:\Projetos\AutoWebGame` conferido e atualizado.
- Bloqueio: repositorio iniciou sujo antes de qualquer edicao desta execucao.
- Evidencia `git status --short --branch`: `index.html` modificado; nao rastreados `DocsDev/qa-browser-loop.md`, `SwarmLedger-bugs.md`, `SwarmLedger-documentacao.md`, `SwarmLedger-geral.md`, `SwarmLedger-landing.md`, `SwarmLedger-migracao-visual.md`, `SwarmLedger-performance.md`, `SwarmLedger-ready-to-ship.md`.
- Acao tomada: somente este ledger foi atualizado; nenhuma documentacao operacional foi alterada para evitar misturar fluxos.

# Swarm Ledger - documentacao

## 2026-07-09T08:35Z - docs index

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: added `docs/INDEX.md` as the first-stop documentation map for product, gameplay, visual, operations, releases, and CodeGraph docs.
- Validation: passed local markdown link existence check for `docs/INDEX.md` (`22` links).
- Risk: low; documentation-only change.

## 2026-07-09T09:19Z - release readiness links

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: linked the documentation index to the repository README gates and the existing billing checkout readiness record.
- Validation: passed local markdown link existence check for `docs/INDEX.md` (`24` links) and `node tests/readme-release-gates-check.mjs`; `npm run test:readme-release-gates` is not registered on this branch.
- Risk: low; documentation-only navigation update.

## 2026-07-09T12:14Z - docs index link gate

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: added `npm run test:docs-index-links` to verify every relative link in `docs/INDEX.md` resolves to a local file.
- Validation: passed `npm run test:docs-index-links` (`24` links checked).
- Risk: low; documentation test only.
