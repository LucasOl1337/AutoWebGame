# v0.4.0 — Gameplay Trae consolidado, mobile seguro e Worker mais eficiente (12/07/2026)

Release minor publicada do AutoWebGame/BOMBA PvP, baseada em `v0.3.0`. Esta unidade consolida o trabalho recuperável entre Codex e Trae Work, fecha diferenças locais relevantes e rejeita explicitamente protótipos ou snapshots que não atingiram o padrão de produção.

## Destaques

- 20 rodadas Trae de gameplay/bots transplantadas sobre a arquitetura atual.
- Bombas e pickups mais legíveis; powerups no máximo são preservados e sinalizados.
- Bots mais estáveis, seletivos e menos redundantes.
- Input, áudio, convite e código de sala mais resilientes.
- Landing/mobile com copy factual, viewport dinâmica e safe areas.
- Worker evita cache de 404, leitura repetida de arena ativa e analytics duplicado.
- SEO operacional básico com robots e sitemap para os domínios públicos.

## Proveniência consolidada

- Baseline local/GitHub: `15b372109008942b2db32552b53d74d95dbf23bb` (`v0.3.0`).
- Produção observada antes do release: conteúdo equivalente a `v0.2.5`.
- Trae: branch `swarm/autowebgame/documentacao`, 20 commits entre `04f1d29` e `36bbe2b`; sem worktree Trae ativo adicional.
- Codex/Governor: runtime de billing, Tidal Foundry, Ember Kiln, speed trail, copy e gates já estava incorporado/evoluído em `main`; deltas estáticos perdidos foram recuperados.
- Snapshots: correções de input/áudio/mobile/invite/Worker foram portadas seletivamente; variantes antigas/superseded não foram cherry-picked.
- Órfãos: `8dc4741` recuperado; stashes de mídia e skill-channel duplicado apenas preservados.

## Segurança e compatibilidade

- Sem breaking change de protocolo ou migração de Durable Object.
- Admin permanece desabilitado quando credenciais não estão configuradas.
- Secrets de produção não foram lidos, alterados ou rotacionados.
- Agent-First foi adiado por riscos de isolamento, memória, rate limit, lifecycle e verificação.
- Billing live permanece fail-closed até configuração explícita.

## Validação

| Gate | Resultado |
|---|---|
| TypeScript/Vite | Passou; 48 módulos |
| Worker syntax e admin auth | Passou |
| Matriz local | 136/136 checks |
| Dependências de produção | 0 vulnerabilidades |
| Wrangler dry-run | Passou; 740 assets, `LOBBY` + `ASSETS` |
| Chrome desktop/mobile | Sem overflow; badge `v0.4.0`; console limpo |

## Estado de publicação

**Publicada em produção em 12/07/2026.** O PR #2 integrou a consolidação ao `main`; o Worker e os 740 assets foram implantados nos domínios `bombapvp.com` e `bombpvp.com`. O smoke live confirmou `/health`, landing, `/game`, `robots.txt` e `sitemap.xml`; amostras de JS/CSS e arquivos operacionais apresentaram hashes SHA-256 idênticos ao bundle local. Os bindings `LOBBY` e `ASSETS` foram preservados.

Detalhes: [PRD](PRD-v0.4.0.md) e [antes/depois](before-after-v0.4.0.md).
