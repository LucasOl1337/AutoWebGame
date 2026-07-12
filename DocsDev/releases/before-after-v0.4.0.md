# Relatório antes e depois — v0.4.0

## Estado executivo

| Dimensão | Antes da consolidação | Depois da preparação local | Depois da publicação |
|---|---|---|---|
| Produção Cloudflare | `v0.2.5`, Worker version 167, deployment `feea36d3…` | Sem alteração externa | `v0.4.0` em ambos os domínios; Worker e 740 assets publicados |
| GitHub `main` | `v0.3.0`, commit `15b3721` | Sem alteração externa | Consolidação integrada pelo PR #2 (`1bccda7`) |
| Release candidate local | Espalhada entre worktrees/refs | Worktree `AutoWebGame-release-v0.4.0-prep`, base `15b3721`, mudanças staged sem commit | Commit de release `20eb22f`, publicado e integrado |
| Versão de package/UI | `0.1.0` / badge `v0.2.2` | `0.4.0` / badge `v0.4.0` | `0.4.0` / badge `v0.4.0` em produção |
| Testes | v0.3 registrava 47 focados | 136/136 checks + build + audit + dry-run | Smoke live aprovado nos dois domínios; assets amostrados 1:1 |

## Inventário auditado

- 6 worktrees existentes + 1 worktree isolada de preparação.
- 20 commits Trae recuperáveis, todos fora de `main`.
- 43 patches exclusivos em branches locais, dos quais 18 já incorporados/evoluídos, 3 somente históricos e 2 parcialmente recuperados.
- 110 `refs/codex/snapshots`; 76 patches sem equivalente exato, revisados semanticamente por domínio.
- 23 `refs/codex/turn-diffs`; nenhum código adicional além dos overlays já identificados.
- 32 commits inalcançáveis; correção de áudio `8dc4741` recuperada e stashes de mídia preservados sem merge.
- 46 execuções Trae em 19 sessões: 20 commits, 9 rodadas sem commit, 17 falhas e 1 execução sem conclusão.
- 209 registros Codex desde 07/07, incluindo enxame contínuo, gameplay, performance, ship/governor e documentação.

## Mudanças visíveis ao jogador

| Antes | Depois |
|---|---|
| Bomba tinha apenas pulso genérico no fim do fuse | Anel crítico nos 450 ms finais. |
| Pickups podiam se misturar ao piso | Silhueta/contorno aumentam legibilidade. |
| Jogador no máximo consumia/ignorava feedback de pickup | Item é preservado e HUD mostra `MAX`. |
| Sudden Death avançava a cada 800 ms | Cadência de 900 ms, compartilhada com o mapa de perigo. |
| Drop pool mais denso e remote-up mais comum | 22/36 crates elegíveis no mapa determinístico; remote-up mais raro. |
| Landing dizia 7 arenas e 4v4 | Landing informa 9 arenas e 4 jogadores online. |
| Mobile podia ignorar notch/dynamic viewport | `viewport-fit=cover`, `svh/dvh` e safe-area nos overlays/dock. |

## Bots

- Priorizam o primeiro speed-up e aplicam retorno decrescente nos seguintes.
- Ignoram pickups saturados e preservam prioridade de escudo/sobrevivência.
- Preferem powerup precomputado em empate seguro de crates.
- Mantêm direção já comprometida em empates equivalentes.
- Evitam bomba ofensiva redundante quando uma bomba própria já cobre o alvo.
- Preservam abertura de crates, fuga, detonação remota e seleção de alvo.

## Robustez, online e Worker

- `pagehide` limpa estado de teclas.
- Falha de todas as variantes de SFX libera o throttle para retry.
- Primeiro gesto de áudio remove os dois listeners e impede rebind.
- Código de sala pode ser extraído de mensagem, link ou query aninhada; falha de clipboard mostra o código manual.
- 404 de chunk hashado recebe `no-store`, evitando cache de erro como immutable.
- Arena ativa usa cache do DO; admin lê sete dias em paralelo e reaproveita `recentDays[0]`.
- Admin continua fail-closed sem credenciais; Agent-First não foi acoplado ao `GlobalLobby`.

## Itens arquivados ou adiados

- Agent-First API: protótipo preservado em `AutoWebGame-agent-first`, não pronto para produção.
- Assets de marketing órfãos: preservados no object database, não incluídos no bundle.
- Suporte/SLA/reembolso, hero fictício, OG genérico, remoção de fontes e funil ampliado: não publicados.
- Billing: infraestrutura permanece, mas checkout live continua desabilitado até secrets/configuração aprovados.

## Evidência de qualidade

- `npm run build`: 48 módulos, build Vite aprovado.
- `tests/*-check.mjs`: 136/136.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades.
- `wrangler 4.110.0 deploy --dry-run`: 740 assets; upload 539,61 KiB / gzip 112,17 KiB; bindings `LOBBY` e `ASSETS` reconhecidos.
- Chrome: landing e `/game` sem overflow em 1280×720 e 390×844; badge `v0.4.0`; sem erros de console no app.
