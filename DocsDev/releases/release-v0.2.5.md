![v0.2.5](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.2.5/v0.2.5-card.png)

# v0.2.5 - Onboarding, QA e APIs mais rapidas (08/07/2026)

Patch oficial do AutoWebGame/BOMBA consolidando o trabalho versionado feito depois do release `v0.2.4`. O foco desta rodada e publicar um onboarding melhor para novos jogadores, adicionar um smoke comercial de release e reduzir custo do roteamento publico do Worker sem puxar worktrees conflitantes para dentro da linha principal.

## Novidades

- **Pagina Como jogar:** nova pagina publica `how-to-play.html` com guia visual de objetivo, controles, leitura da arena, plano de primeira partida e CTA para entrar no jogo.
- **Arte de onboarding:** imagem propria `how-to-play-arena.png` publicada em `public/Assets/UiLayouts/` e linkada a partir da landing.
- **Smoke comercial completo:** novo `npm run test:commercial-release-flow` cobre promessa publica, entrada em `/game`, paginas legais, conta rapida, checkout, webhook pago, copy localizada e eventos de conversao.

## Performance e backend

- **Worker API dispatch mais rapido:** o roteamento publico de `/api/*` saiu de uma cadeia linear de condicionais para uma tabela precompilada com `resolvePublicApiRoute`.
- **Contrato de rotas preservado:** teste dedicado `npm run test:worker-api-route-dispatch` valida equivalencia de metodos e rotas publicas.
- **Rodada de performance documentada:** `PerformanceSwarm.md` registra a rodada 8/20, benchmark e hash final integrado.

## Qualidade de release

- **Release enxuto:** entraram apenas os commits sem conflito e com evidencia minima.
- **Risco isolado:** a branch `codex-swarm` ficou fora deste patch como merge direto porque ainda conflita com a linha `main` atual.
- **Worktrees sujos fora:** as mudancas soltas de dock responsivo e extracao avancada de codigo de sala seguem pendentes ate virarem commits testados.

## Local vs nuvem

- Nuvem verificada com `git fetch --all --tags --prune` e `gh release list --repo LucasOl1337/AutoWebGame`.
- Ultimo release oficial antes deste patch: `v0.2.4`, publicado em 2026-07-08T18:42:01Z.
- Tag local `v0.2.4` aponta para `82222707698fbf6bbcc86ea869540e36c37d641d`.
- `origin/main` antes deste patch estava em `82222707698fbf6bbcc86ea869540e36c37d641d`.
- `main` local antes das patch notes estava em `77796a8`, 5 commits a frente de `origin/main`.
- Branch remota principal: `origin/main`.
- Branches remotas extras `origin/auto-improvements-test` e `origin/cloudflare-live` ja eram ancestrais de `main` e nao trouxeram trabalho novo para este patch.

## Sessoes/agentes auditados desde v0.2.4

| Sessao / agente | Evidencia verificada | Decisao |
|---|---|---|
| Codex / Ship commercial QA | Worktree detached `7459d65`, `ShipSwarm.md`, `package.json`, `tests/commercial-release-flow-check.mjs` | Integrado |
| Codex / How-to-play page | Worktree detached `72996ff` + `db07b4a`, `EnxameTalk.md`, `how-to-play.html`, imagem e teste | Integrado |
| Codex / Performance round 8 | Worktree detached `5f9cec8` + `fcfa975`, `PerformanceSwarm.md`, `worker/index.js`, teste de dispatch | Integrado |
| Codex / codex-swarm | Branch `codex-swarm` com 10 commits e diff amplo em Worker, GameApp, session client, CSS, assets e testes | Nao integrado; conflita e exige cherry-pick seletivo |
| Codex / match dock responsive a11y | Worktree sujo `4f9a` sem commit final | Pendente |
| Codex / manual room-code message extract | Worktree sujo `58f1` sem commit final | Pendente |
| Claude | Busca textual, branches, worktrees, docs locais e raiz adicional `C:\Projetos\LucasOl` | Nenhum rastro versionado novo nesta repo |
| ZCode | Busca textual, branches, worktrees, docs locais e raiz adicional `C:\Projetos\LucasOl` | Nenhum rastro versionado novo nesta repo |
| Wispr Flow | Busca textual, branches, worktrees, docs locais e raiz adicional `C:\Projetos\LucasOl` | Nenhum rastro versionado novo nesta repo |
| OpenCode | Busca textual, branches, worktrees, docs locais e raiz adicional `C:\Projetos\LucasOl` | Nenhum rastro versionado novo nesta repo |
| Trae Work | Busca textual, branches, worktrees, docs locais e raiz adicional `C:\Projetos\LucasOl` | Nenhum rastro versionado novo nesta repo |

Observacao: `C:\Projetos\LucasOl` contem outro repositorio e materiais de portfolio; ele foi checado por rastros dos agentes, mas nao e clone de AutoWebGame nem fonte de mudanca versionada deste release.

## Validacao de release

Checks executados e aprovados durante a preparacao deste patch:

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

## Artefatos

- `DocsDev/releases/release-v0.2.5.md`
- `DocsDev/releases/release-v0.2.5.json`
- `release-assets/v0.2.5-card.png`
- `release-assets/v0.2.5-card-bg.png`
- `patchnotes.md`
- `changelog.md`

---

Notas completas geradas para o GitHub Release oficial `v0.2.5`.
