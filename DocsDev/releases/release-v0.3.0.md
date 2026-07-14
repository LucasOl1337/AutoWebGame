![v0.3.0](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.3.0/v0.3.0-card.png)

# v0.3.0 - Arenas, retomada online e combate mais legivel (10/07/2026)

Release minor oficial do AutoWebGame/BOMBA PvP. O delta consolida o trabalho auditado desde `v0.2.5`, adiciona capacidades visiveis ao jogador e endurece os fluxos online e administrativos sem breaking change de protocolo ou migracao de dados.

## Resumo auditavel

| Área | Trabalho real confirmado | Evidência (arquivos/commits/testes) | Como o usuário percebe na prática | Status/risco |
|---|---|---|---|---|
| Arenas | Temas `tidal-foundry` e `ember-kiln` com tiles proprios | `src/Arenas/arena-theme-library.ts`, `configs/arena-theme-library.json`, assets; `tidal-foundry-theme-check`, `ember-kiln-theme-check` | Duas novas aparencias selecionaveis para a arena | Confirmado; baixo |
| Gameplay | Personagem surpresa, guard por cadeia de pickups, trail de velocidade, icone de fuse curto e pressao de revanche dos bots | `character-surprise.ts`, `pickup-chain.ts`, `game-app.ts`, `bot-ai.ts`; testes focados | Mais variedade na selecao, feedback visual e decisoes taticas | Confirmado; medio-baixo |
| Online | Retomada de lobby/partida com token opaco e grace de 15 s; bloqueio de entrada em partida ativa e de sala cheia | `reconnect-session.ts`, `lobby-reconnect-grace.ts`, `session-client.ts`, `worker/index.js`; testes de reconnect/join | Quedas breves deixam de encerrar a sessao e cards indisponiveis explicam o motivo | Confirmado; medio, coberto por contratos |
| UX e acessibilidade | Colar codigo/link para entrar, guia Como jogar refinado, skip link, copy comercial, recuperacao de bootstrap e lembrete de pronto | `index.html`, `how-to-play.html`, `main.ts`, `main.css`, `i18n.ts`; testes de landing/bootstrap/how-to | Entrada e orientacao mais claras por mouse, teclado e falhas de carregamento | Confirmado; baixo |
| Seguranca | Admin fail-closed sem credenciais default; sessoes antigas revogadas; reconnect usa token CSPRNG rotacionado e comparacao timing-safe | `worker/admin-auth.js`, `worker/index.js`, `admin-auth-fail-closed-check`, `active-match-reconnect-resume-check` | Invisivel ao usuario; reduz exposicao administrativa e sequestro de retomada | Confirmado; secrets externos ainda devem ser rotacionados |
| Performance | Mapa de perigo unico e compartilhado por passo, assets de personagens em paralelo, menos alocacoes de telemetria e cache de canvas | `danger-map.ts`, `assets.ts`, `growth-telemetry.ts`, `sprite-trim-cache.ts`; benchmark e testes | Invisivel na UI; bots e carregamento fazem menos trabalho repetido | Confirmado; baixo |
| Robustez | Timeout recuperavel de feedback, bomba bloqueada durante canalizacao e dependencia `ws` corrigida | `session-client.ts`, `game-app.ts`, `package*.json`; testes e `npm audit` | Formularios nao travam; regras de skill ficam coerentes; backend sem advisory conhecido | Confirmado; baixo |
| Qualidade/documentacao | 47 testes focados, indices e gates de release executaveis | `tests/`, `docs/INDEX.md`, `package.json` | Invisivel ao usuario; reduz risco de regressao | Confirmado; baixo |

## Baseline e snapshot auditado

- Repositorio: `LucasOl1337/AutoWebGame`; default branch `main`.
- Baseline publicado: tag/release `v0.2.5`, commit `664d616f801599a1956dd94e8f8ff8c5ef4f1a1b`, publicada em `2026-07-08T21:51:27Z`.
- Snapshot integrado antes destas notas: `6e60141` na worktree isolada `C:\Projetos\AutoWebGame-release-v0.3.0`.
- Delta antes dos artefatos finais: 76 arquivos, 4.392 insercoes, 519 remocoes e 69 commits consolidados/cherry-picked.
- O checkout original sujo e a worktree `codex-swarm` foram preservados integralmente; nenhum arquivo solto foi incluído.

## Sessoes e agentes rastreados

- Codex local: 181 sessoes relacionadas entre 8 e 10 de julho, consolidadas em blocos de entrega em vez de contadas como funcionalidades separadas.
- Linha `enxame/autowebgame/continuo`: 31 commits lineares confirmados pelo diff.
- Governor: landing, performance, documentacao, bugs, geral e ready-to-ship selecionados por commit; aliases duplicados e otimizacoes superseded foram eliminados na integracao.
- `codex-swarm`: billing ja estava integrado/evoluido; apenas nove entregas posteriores nao sobrepostas foram selecionadas.
- Claude, ZCode, Wispr e Traywork: nenhuma entrega recente atribuivel com seguranca; logs foram tratados apenas como evidencia secundaria.
- Nao havia outro escritor Codex independente ativo na fronteira usada para publicar.

## Checks executados

| Check | Resultado |
|---|---|
| `git diff --check` e `node --check worker/index.js` | Passou |
| `npm run build` | Passou; 48 modulos, bundle Vite de producao |
| `npm run compile:esm` | Passou |
| Bateria focada de 47 contratos | `SUITE_PASS 47/47` |
| `npm audit --omit=dev --audit-level=high` | `0 vulnerabilities` depois de atualizar `ws` para `8.21.0` |
| CodeGraph | Indice do repo fonte estava saudavel e sincronizado antes da consolidacao |
| Revisao de seguranca independente | Nenhum achado P0-P2 confirmado |

## Correcoes feitas durante a auditoria

- Botao flutuante `Topo` removido da ordem de foco enquanto invisivel.
- Teste de reconnect normalizado para LF/CRLF no Windows.
- Script duplicado `test:release-visibility` removido e whitespace final corrigido.
- `ws` elevado de `^8.20.0` para `^8.21.0` com lockfile atualizado.
- Conflitos de cherry-pick deduplicados sem reintroduzir implementacoes antigas de perigo/billing.

## Riscos residuais, breaking changes e migracao

- Sem breaking change ou passo de migracao de dados conhecido.
- O deploy deve rotacionar `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_TOKEN`; esta release remove defaults e revoga sessoes antigas, mas nao altera secrets externos.
- Reconnect e Worker foram validados por contratos/integracao local, nao por um ciclo real de Durable Object em producao.
- O timeout de feedback pode deixar um envio persistido no servidor antes de o cliente permitir retry; impacto residual baixo.
- Controles touch completos, escolha revanche/lobby e localizacao de algumas rejeicoes do Worker permanecem backlog, nao regressao desta release.

## Veredito

**Aprovado para release `v0.3.0`.** O incremento minor e necessario porque ha novas arenas e capacidades de gameplay/UX; os gates locais estao verdes e nao ha bloqueio de compatibilidade conhecido.
