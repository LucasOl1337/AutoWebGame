# Agent Handoff

Resumo curto para futuros agentes trabalharem neste projeto sem repetir erro antigo.

## Stack e fluxo local

- Frontend: Vite + TypeScript.
- Backend online: Cloudflare Worker + Durable Object em `worker/index.js`.
- Comando principal de dev: `npm run dev`
  - sobe frontend em `http://127.0.0.1:5173`
  - sobe worker local em `http://127.0.0.1:8787`
- Build de produção: `npm run build`
- Deploy live: `npm run deploy:cloudflare`

## Arquivos centrais

- UI online e navegação: `C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts`
- Protocolo online: `C:\Users\user\Desktop\AutoWebGame\src\online\protocol.ts`
- Matchmaking helpers: `C:\Users\user\Desktop\AutoWebGame\src\online\matchmaking.ts`
- Worker e regras de sala: `C:\Users\user\Desktop\AutoWebGame\worker\index.js`
- UI/responsividade global: `C:\Users\user\Desktop\AutoWebGame\src\styles\main.css`
- I18n e boot de idioma: `C:\Users\user\Desktop\AutoWebGame\src\i18n.ts`
- Runtime do jogo: `C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts`

## Regras de arquitetura que nao devem ser quebradas

- `partida rapida`, `lobby manual` e `partida infinita` precisam continuar separados.
- Use `roomKind` e `sessionState` do servidor; nao volte a inferir tudo por flags locais soltas.
- `endless` nao deve reaproveitar lifecycle de lobby classico.
- Saida de jogador no meio da partida nao deve derrubar a sala inteira.
- Offline contra bots nao pode depender do websocket online continuar conectado.

## Responsividade

- O shell usa `height: 100dvh` e `overflow: hidden`; por isso o layout precisa caber sem scroll global em desktop.
- Para viewports baixos, a estrategia correta e:
  - comprimir paddings, gaps, tipografia e botoes por `max-height`
  - mover overflow para listas internas
  - nunca deixar a pagina inteira crescer alem do viewport
- As regras mais sensiveis ficam em `main.css`:
  - `@media (max-height: 820px) and (min-width: 1081px)`
  - `@media (max-height: 690px) and (min-width: 1081px)`
  - `@media (max-height: 620px) and (min-width: 1081px)`

## Idioma

- `/en` precisa continuar funcionando como entrypoint real.
- O switcher de idioma fica no topo e usa navegação por URL.
- Para usuarios nao-BR, o site tende a cair em ingles automaticamente.
- HTML do worker esta com `cache-control: no-store` para evitar bundle antigo preso no custom domain.

## URLs de room

- Ha trabalho em andamento para remover `?room=CODE` da URL publica e manter a navegacao por dentro da UI.
- Mudancas relacionadas foram feitas em:
  - `C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts`
  - `C:\Users\user\Desktop\AutoWebGame\src\online\growth-telemetry.ts`
- Antes de mexer nisso de novo, confira o comportamento de convite/copiar codigo e o fluxo de entrar em lobby.

## Validacao recomendada

- Sempre rode `npm run build` antes de concluir.
- Para matchmaking, rode pelo menos:
  - `npm run test:matchmaking-state`
- Para bug visual, faca smoke real com viewport curta.
  - alvo minimo seguro: `1365x620`
  - alvo mais agressivo: `1365x580`
- Em bugs de shell/UI, medir no browser e melhor que confiar so no CSS.

## Armadilhas conhecidas

- O worktree costuma estar sujo. Nao reverta mudancas grandes sem entender contexto.
- `git diff --stat` pode parecer enorme porque ha muitos arquivos grandes e alteracoes paralelas.
- Se o build quebrar por TypeScript, verifique primeiro se e um erro antigo nao relacionado antes de culpar a mudanca atual.
- O MCP do browser pode falhar se houver uma sessao do Chrome aberta; usar Playwright via `node` e um fallback util.

## Ultimo contexto util

- O lobby/setup para resolucoes baixas recebeu compressao adaptativa e overflow interno no CSS.
- O setup segurou localmente em `1365x620` e `1365x580` sem overflow do documento.
- Essa ultima rodada foi validada localmente com `npm run build`, mas pode ainda precisar deploy dependendo de quando este arquivo estiver sendo lido.
