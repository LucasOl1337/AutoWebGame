# PRD — Consolidação e release v0.4.0

## Objetivo

Transformar as entregas recuperáveis de Codex, Trae Work, branches, worktrees, snapshots e commits órfãos em uma única release auditável, sem reintroduzir implementações antigas, degradar o Worker autoritativo ou publicar protótipos inseguros.

## Problema

Antes desta preparação, havia três estados divergentes: produção em `v0.2.5`, GitHub/main em `v0.3.0` e novidades locais distribuídas em seis worktrees, branches Trae/Governor/Codex, 110 snapshots, 23 turn-diffs e 32 commits inalcançáveis. A divergência impedia afirmar paridade 1:1 entre PC, GitHub e Cloudflare.

## Escopo de v0.4.0

### Gameplay e bots

- Integrar as 20 rodadas Trae em ordem, sobre `main`, sem merge bruto da branch divergente.
- Melhorar telegraph final da bomba, legibilidade de pickups, preservação/HUD de powerups no máximo, distribuição de drops e cadência do Sudden Death.
- Melhorar prioridades, estabilidade, sobrevivência e disciplina ofensiva dos bots.
- Preservar o mapa de perigo como fonte única e manter IA/jogo na mesma cadência.

### Robustez e UX

- Limpar input em `pagehide`.
- Recuperar playback após falha e remover os dois listeners de unlock de áudio.
- Aceitar código de sala em mensagem/link e fornecer fallback manual quando a cópia falhar.
- Melhorar teclado móvel, viewport dinâmica, safe areas e responsividade da landing.
- Corrigir as promessas factuais da landing para 4 jogadores online e 9 arenas.

### Worker e performance

- Não cachear 404 de assets hashados.
- Servir arena ativa a partir do cache já hidratado do Durable Object.
- Remover leitura duplicada do dia atual no resumo administrativo.
- Reusar deltas cardinais estáticos no blast map e explosão do jogo.
- Preservar admin fail-closed, secrets externos e o `GlobalLobby` autoritativo.

### Operação e documentação

- Sincronizar versão de package/UI para `0.4.0`.
- Publicar `robots.txt` e sitemap com páginas públicas e os dois domínios.
- Consolidar ledgers, proveniência, PRD, antes/depois, release notes e patch notes.
- Validar build, 136 checks, audit, Worker, Wrangler dry-run e Chrome desktop/mobile.

## Fora de escopo deliberado

| Item | Decisão | Motivo |
|---|---|---|
| Agent-First Arena API | Adiar e preservar no worktree | Singleton global, ausência de quota/TTL, body buffering, lockstep travável, custo de snapshots e OpenAPI divergente. |
| Billing real | Manter fail-closed/não configurado | Produção não possui `BILLING_CHECKOUT_URL`/`BILLING_WEBHOOK_SECRET`; não prometer venda funcional. |
| Suporte público | Não publicar | Snapshot promete SLA/reembolso sem canal, owner ou política aprovada. |
| Novo hero/OG genérico | Arquivar | Assets mostram roster fictício, pesam 1–1,9 MB e piorariam marca/LCP. |
| Expansão de telemetria | Adiar | Métricas de funil precisam denominador por sessão e revisão de privacidade. |
| Pacote `grokassets` órfão | Arquivar, não embarcar | 19,2 MB de mídia antiga sem prova de consumo em produção. |

## Critérios de aceite

- `main` continua sendo a base; nenhum merge bruto de branch antiga.
- Build TypeScript/Vite e Worker syntax verdes.
- Todos os `tests/*-check.mjs` passam.
- `npm audit --omit=dev --audit-level=high` retorna zero vulnerabilidades.
- `wrangler deploy --dry-run` empacota Worker, Assets e `GlobalLobby` sem mudança de migração.
- QA Chrome em 1280×720 e 390×844 sem overflow horizontal ou erro de console.
- Commit/push/deploy somente após autorização explícita.

## Rollout e rollback

1. Criar commit único/auditável em branch `codex/release-v0.4.0`.
2. Push e PR/revisão ou fast-forward autorizado para `main`.
3. Tag/release `v0.4.0`.
4. Deploy Cloudflare preservando bindings/secrets atuais.
5. Smoke em `/health`, landing, `/game`, arena ativa, lobby e admin fail-closed.
6. Em regressão, usar rollback de versão do Worker e reverter o commit de release; não alterar migração DO.

## Métricas de sucesso

- GitHub/main, tag e versão Cloudflare apontam para o mesmo conteúdo versionado.
- Zero diferença de arquivos versionados entre o artefato local aprovado e o bundle de deploy.
- Zero regressão nos 136 contratos locais.
- Queda de chamadas de analytics no admin de 8 para 7 e leituras de arena ativa por request de 1 para 0.
