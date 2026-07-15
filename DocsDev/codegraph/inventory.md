# CodeGraph inventory - AutoWebGame

Generated at: 2026-07-15T11:21:46-03:00

Repository: `C:\Projetos\AutoWebGame`

CodeGraph status: healthy, synchronized, 386 indexed files, 7,386 nodes, 14,258 edges.

Scope: real project files in the current working directory. Ignored for analysis: `node_modules`, `.git`, build output and caches. CodeGraph was the primary structural source; direct reads were used only for repository metadata, package scripts and docs.

## 1. Funcoes de uso do cliente / usuario comum

### 1.1 Partida local classica

- Nome: Partida local classica
- Descricao: Executa uma partida Bomberman-style no browser com canvas, jogadores locais/bots, bombas, flames, powerups, round result e placar.
- Arquivos relacionados: `src/Engine/game-app.ts`, `src/Engine/input.ts`, `src/Engine/bot-ai.ts`, `src/Gameplay/types.ts`, `src/Gameplay/powerups.ts`, `src/Arenas/arena.ts`
- Como e acessada/usada: Pelo frontend Vite em `src/UiLayouts/main.ts`, que instancia a experiencia principal; tambem por `npm run dev`/`npm run dev:frontend`.
- Dependencias internas: `InputController`, arena runtime, bot AI, asset loader, sound manager, skill system, powerup definitions.
- Status: funcional
- Observacoes tecnicas: Ha testes dedicados para input, bots, bombas, powerups, spawn, sudden death, round outcome e sprites. O modulo `GameApp` e muito grande e concentra render, simulacao, UI e online.

### 1.2 Menu inicial e selecao de personagem

- Nome: Menu inicial e selecao de personagem
- Descricao: Permite escolher experiencia, personagens, idiomas e iniciar modos locais/online.
- Arquivos relacionados: `src/NetCode/session-client.ts`, `src/Engine/game-app.ts`, `src/UiLayouts/i18n.ts`, `src/Characters/Animations/character-roster-manifest.ts`, `public/assets/characters/manifest.approved.json`
- Como e acessada/usada: Renderizacao DOM feita por `OnlineSessionClient.render` e painels do `GameApp`.
- Dependencias internas: Copy i18n, roster/manifest, asset loader, controles de estado do lobby.
- Status: funcional
- Observacoes tecnicas: Ha testes para menu de personagens, sync do manifesto e player sprite. JSON/CSS/HTML nao entram como codigo estruturado no CodeGraph.

### 1.3 Quick match online

- Nome: Quick match online
- Descricao: Entrada rapida para fila classica online com estado de busca, contagem e pareamento em sala.
- Arquivos relacionados: `src/NetCode/session-client.ts`, `src/NetCode/protocol.ts`, `src/NetCode/matchmaking.ts`, `worker/index.js`
- Como e acessada/usada: Botao de quick match no cliente envia `QuickMatchMessage`; o worker processa por `GlobalLobby.handleQuickMatch`.
- Dependencias internas: `OnlineSessionClient`, `ClientMessage`, `ServerQuickMatchStateMessage`, `resolveOnlineSessionState`, `GlobalLobby`.
- Status: funcional
- Observacoes tecnicas: Coberto por testes de online 4p, matchmaking state e lobby rules.

### 1.4 Lobby manual online

- Nome: Lobby manual online
- Descricao: Cria/lista salas, entra por codigo, seleciona assento/personagem, pronto, chat e fluxo ate partida.
- Arquivos relacionados: `src/NetCode/session-client.ts`, `src/NetCode/protocol.ts`, `src/NetCode/lobby-rules.ts`, `worker/index.js`
- Como e acessada/usada: Cliente DOM envia mensagens de criar/entrar/sair/claim seat/set ready/chat; worker gerencia membros via websocket.
- Dependencias internas: `OnlineSessionClient.handleSetupPrimaryAction`, `GlobalLobby.handleCreateLobby`, `handleJoinLobby`, `handleClaimSeat`, `handleSetReady`, `handleChatSend`.
- Status: funcional
- Observacoes tecnicas: A regra de start/reset e compartilhada por helpers em `src/NetCode/lobby-rules.ts` e `src/NetCode/matchmaking.ts`.

### 1.5 Modo endless online

- Nome: Modo endless online
- Descricao: Entrada online para sala/partida infinita com room mode separado de classic.
- Arquivos relacionados: `src/NetCode/protocol.ts`, `src/NetCode/matchmaking.ts`, `src/NetCode/session-client.ts`, `worker/index.js`
- Como e acessada/usada: Cliente envia `EndlessMatchMessage`; worker trata por `GlobalLobby.handleEndlessMatch`, `joinEndlessRoom` e lifecycle de endless room.
- Dependencias internas: `ENDLESS_ROOM_CODE`, `resolveOnlineSessionState`, `GlobalLobby.matches`, `GameApp` headless.
- Status: funcional
- Observacoes tecnicas: Existem testes `endless-mode-check`, `endless-room-lifecycle-check` e `endless-bot-roster-check`.

### 1.6 Habilidades de personagens

- Nome: Habilidades de Ranni, Killer Bee, Nico e Crocodilo Arcano
- Descricao: Sistema de skill com cooldown, channel/release, dash/blink/beam/surge e imunidade contextual.
- Arquivos relacionados: `src/ultimate/skill-system.ts`, `src/ultimate/skill-registry.ts`, `src/ultimate/shared.ts`, `src/Characters/CustomMechanics/*.ts`, `src/Gameplay/types.ts`
- Como e acessada/usada: `GameApp.simulatePlayerInputStep` chama sync, timers, activate e update channel para cada jogador.
- Dependencias internas: `SkillContext`, `getCharacterSkillId`, modulos de mecanica por personagem, `GameApp.createSkillContext`.
- Status: funcional
- Observacoes tecnicas: Coberto por testes especificos de cada personagem e por reconcile online de skill.

### 1.7 Powerups, bombas, flames e controles especiais

- Nome: Bombas, remote detonation, shield/powerups e perigo visual
- Descricao: Bombas com fuse/range, chain reaction, remote detonation, powerups de bomba/flame/speed/remote, shield, HUD e overlays.
- Arquivos relacionados: `src/Engine/game-app.ts`, `src/Gameplay/powerups.ts`, `src/Gameplay/types.ts`, `tests/*bomb*.mjs`, `tests/shield-powerup-check.mjs`
- Como e acessada/usada: Input de bomba/detonate passa por `simulatePlayerInputStep`; render por `drawBomb`, `drawFlame`, `drawPowerUp`, `drawDangerOverlay`.
- Dependencias internas: arena tiles, collision, bot AI, sound manager, powerup definitions.
- Status: funcional
- Observacoes tecnicas: Ha boa cobertura por scripts de teste focados em bomba, hit window, chain, range, push, shield e HUD.

### 1.8 Temas de arena

- Nome: Sistema de temas de arena
- Descricao: Define tema default `tournament-clean` e alternativos como `arcane-citadel`, `verdant-ruins` e `skyfoundry-bastion`.
- Arquivos relacionados: `src/Arenas/arena-theme-library.ts`, `src/Arenas/arena.ts`, `src/Engine/game-app.ts`, `tests/arena-theme-library-check.mjs`
- Como e acessada/usada: Pode ser selecionado via query string `?arenaTheme=<theme-id>` conforme README.
- Dependencias internas: arena runtime config, render de floor/wall/crate e CSS/asset pipeline.
- Status: funcional
- Observacoes tecnicas: O tema e runtime TS sao indexados; assets visuais e CSS ficam fora do grafo.

### 1.9 Contas, autenticacao, feedback e idioma

- Nome: Conta autenticada, feedback e troca de idioma
- Descricao: Cliente oferece registro/login por e-mail em `/account`, sessao persistente, migracao de conta rapida legada, envio de feedback e alternancia PT/EN.
- Arquivos relacionados: `src/Auth/account-auth.ts`, `src/Auth/account-credentials.ts`, `src/Auth/account-page.ts`, `src/NetCode/session-client.ts`, `src/NetCode/account.ts`, `src/UiLayouts/i18n.ts`, `worker/index.js`
- Como e acessada/usada: `/account` renderiza login/registro; o Worker expoe `/api/auth/session`, `/api/auth/register`, `/api/auth/login` e `/api/auth/logout`; contas com papel `admin` seguem para `/admin`.
- Dependencias internas: `AccountAuth`, adaptador de storage do `GlobalLobby`, Web Crypto/PBKDF2, roteador frontend, `handleFeedbackIngest`.
- Status: funcional
- Observacoes tecnicas: Credenciais armazenadas usam PBKDF2-SHA256 com salt e o limite de 100 mil iteracoes aceito pelo Web Crypto do Worker; sessoes, tentativas e contas ficam no storage do Durable Object. Operacoes de hash sao serializadas e protegidas por limites globais e por IP; registro tem quota propria. O bootstrap administrativo continua fail-closed, reserva o e-mail configurado e depende dos secrets `ADMIN_USERNAME` e `ADMIN_PASSWORD`.

## 2. Funcoes de estrutura e backend

### 2.1 Cloudflare Worker / Durable Object GlobalLobby

- Nome: Worker backend autoritativo
- Descricao: Backend central para autenticacao, websocket, salas, quick match, endless, partidas headless, admin, telemetry e feedback.
- Arquivos relacionados: `worker/index.js`, `wrangler.jsonc`, `src/NetCode/protocol.ts`, `src/NetCode/server-tick.ts`
- Como e acessada/usada: `npm run serve:online`, `npm run dev`, `npm run deploy:cloudflare`; requests/websockets roteiam para `GlobalLobby`.
- Dependencias internas: `GameApp` headless, arena helpers, protocol contracts, fixed tick pump, storage do Durable Object/KV conforme bindings.
- Status: funcional
- Observacoes tecnicas: `worker/index.js` tem cerca de 160 KB e 199 nos indexados; e um ponto critico por concentrar HTTP, WS, admin e simulacao.

### 2.2 Simulacao server-side de partida

- Nome: Partida autoritativa no servidor
- Descricao: Cria `GameApp` headless no worker, aplica inputs, avanca ticks e emite snapshots.
- Arquivos relacionados: `worker/index.js`, `src/Engine/game-app.ts`, `src/NetCode/server-tick.ts`, `src/NetCode/protocol.ts`
- Como e acessada/usada: `GlobalLobby.startRoomMatch`, `pumpRoomMatch`, `stopRoomMatch`, `createServerGame`.
- Dependencias internas: FixedRatePumpState, neutral input, character selections, active player IDs, bot player IDs.
- Status: funcional
- Observacoes tecnicas: Testes cobrem server tick, server player removal, skill mapping e reconcile.

### 2.3 Protocolo online compartilhado

- Nome: Protocolos ClientMessage/ServerMessage
- Descricao: Tipos compartilhados para lobby, quick match, endless, input, snapshots, chat, feedback e estados de sessao.
- Arquivos relacionados: `src/NetCode/protocol.ts`, `src/NetCode/session-client.ts`, `worker/index.js`
- Como e acessada/usada: Cliente serializa mensagens WS; worker valida/trata e responde com mensagens tipadas.
- Dependencias internas: gameplay types, matchmaking state, account model.
- Status: funcional
- Observacoes tecnicas: Como o worker e JS com JSDoc/import types, validar `npm run build` continua importante para contratos.

### 2.4 Matchmaking e regras de lobby

- Nome: Regras de lobby/matchmaking
- Descricao: Resolve estados de sessao, visibilidade de lobby manual, quick match candidate, reset de sala e readiness.
- Arquivos relacionados: `src/NetCode/matchmaking.ts`, `src/NetCode/lobby-rules.ts`, `worker/index.js`, `tests/matchmaking-session-state-check.mjs`, `tests/lobby-rules-check.mjs`
- Como e acessada/usada: Cliente usa para UI/state; worker usa sala/status e seats.
- Dependencias internas: `LobbyStatus`, `LobbyMode`, `OnlineRoomKind`, `PlayerId`.
- Status: funcional
- Observacoes tecnicas: Pequeno e bem isolado; bom candidato para manter regras compartilhadas fora do worker.

### 2.5 Telemetry, analytics, feedback e admin

- Nome: Telemetry/feedback/admin do Worker
- Descricao: Coleta eventos, feedback, sumarizacao diaria, autorizacao administrativa unificada e CRUD/validacao/ativacao de arena.
- Arquivos relacionados: `worker/index.js`, `src/Auth/account-auth.ts`, `src/NetCode/growth-telemetry.ts`, `src/Arenas/arena.ts`
- Como e acessada/usada: O login administrativo passa pelo mesmo `/api/auth/login` das contas comuns; endpoints `handleAdmin*` exigem sessao com papel `admin`.
- Dependencias internas: `AccountAuth`, storage do Worker, validacao de arena, auth/config env.
- Status: parcial
- Observacoes tecnicas: O codigo existe, mas o inventario nao confirmou configuracao de ambiente, credenciais, KV/storage ou despacho real de relatorios.

### 2.6 Legacy relay online

- Nome: Relay online legado
- Descricao: Servidor Node websocket/local anterior ao Worker.
- Arquivos relacionados: `scripts/online_server.mjs`, `package.json`
- Como e acessada/usada: `npm run serve:online:legacy-relay`.
- Dependencias internas: `ws`, modelos de sala semelhantes ao worker.
- Status: nao conectada
- Observacoes tecnicas: Parece duplicar parte do Worker e e explicitamente rotulado como legacy. Tratar como suporte/compatibilidade, nao fonte principal.

### 2.7 Auto-improvement bridge e agentes Python

- Nome: Auto-improvement / bot automation
- Descricao: Ponte TS e ferramentas Python para broker, agentes, memoria, modelos, relatorios e decisoes de bots.
- Arquivos relacionados: `src/Engine/auto-improvement-bridge.ts`, `auto-improvements/*.py`, `tests/autobot-codex-e2e.mjs`
- Como e acessada/usada: Bridge no runtime pode consultar decisoes externas; broker Python expoe endpoints internos.
- Dependencias internas: telemetry, decision cache, HTTP local, agentes manager/worker/live.
- Status: parcial
- Observacoes tecnicas: Area experimental/operacional. Ha comentarios de AI desabilitada por jogador e endpoints de broker. Validar antes de tratar como feature de producao.

### 2.8 Pipelines de assets Pixellab, SFX e Airtest

- Nome: Ferramentas de assets e verificacao visual
- Descricao: Scripts para gerar/importar assets, orquestrar Pixellab e checar templates de imagem.
- Arquivos relacionados: `scripts/pixellab_orchestrator.mjs`, `scripts/import_pixellab_characters.mjs`, `scripts/generate_sfx_v3.py`, `tools/airtest-assets/*`, `configs/pixellab-pack.v1.json`
- Como e acessada/usada: Scripts npm `pixellab:*`, `sync:pixellab`, `airtest:*`.
- Dependencias internas: manifests, public assets, env `PIXELLAB_AUTH_HEADER`, Airtest tooling.
- Status: parcial
- Observacoes tecnicas: Depende de servicos externos/env vars; testes cobrem orquestrador/spec/roster.

## 3. Funcoes de estrutura frontend

### 3.1 Bootstrap Vite

- Nome: Bootstrap frontend
- Descricao: Ponto de entrada cria a experiencia no elemento `#app`.
- Arquivos relacionados: `src/UiLayouts/main.ts`, `index.html`, `vite.config.ts`
- Como e acessada/usada: Vite carrega `main.ts`; erro se `#app` nao existir.
- Dependencias internas: `OnlineSessionClient`/shell e estilos CSS.
- Status: funcional
- Observacoes tecnicas: CSS/HTML nao sao capturados pelo CodeGraph como simbolos, mas fazem parte do runtime.

### 3.2 OnlineSessionClient DOM shell

- Nome: Shell DOM da experiencia
- Descricao: Renderiza landing, lobby list, setup, match screen, buttons, inputs, chat, roster e feedback dialog.
- Arquivos relacionados: `src/NetCode/session-client.ts`, `src/UiLayouts/i18n.ts`, `src/UiLayouts/main.css`
- Como e acessada/usada: `OnlineSessionClient.render` cria elementos; handlers disparam callbacks online/local.
- Dependencias internas: i18n, protocol, account, matchmaking, telemetry.
- Status: funcional
- Observacoes tecnicas: `session-client.ts` tambem e grande (96 KB); separar render DOM, state machine e WS reduziria risco.

### 3.3 Canvas renderer e HUD

- Nome: Renderer canvas/HUD
- Descricao: Desenha arena, paredes, crates, bombas, flames, powerups, players, beams, previews, danger overlay, pips, stats e overlays centrais.
- Arquivos relacionados: `src/Engine/game-app.ts`, `src/Engine/assets.ts`, `src/Engine/sprite-trim-cache.ts`, `src/Arenas/arena-theme-library.ts`
- Como e acessada/usada: Game loop de `GameApp` chama metodos `draw*`.
- Dependencias internas: assets, theme palette, gameplay state, online visual interpolation.
- Status: funcional
- Observacoes tecnicas: Muitos metodos privados `draw*` em `GameApp`; acoplamento alto com estado de simulacao.

### 3.4 Asset loader e roster data-driven

- Nome: Loader de assets e roster
- Descricao: Carrega sprites direcionais, fallback/headless sprites e manifesto aprovado de personagens.
- Arquivos relacionados: `src/Engine/assets.ts`, `src/Characters/Animations/character-roster-manifest.ts`, `public/assets/characters/manifest.approved.json`
- Como e acessada/usada: Inicializacao do app e selecao de personagens.
- Dependencias internas: URLs de assets, sprite trim cache, manifest JSON.
- Status: funcional
- Observacoes tecnicas: README enfatiza roster data-driven; teste `character-roster-manifest-sync-check` cobre sync.

### 3.5 i18n e copy

- Nome: Internacionalizacao PT/EN
- Descricao: Copy de UI para portugues/ingles e troca de idioma no shell.
- Arquivos relacionados: `src/UiLayouts/i18n.ts`, `src/NetCode/session-client.ts`
- Como e acessada/usada: Botoes de linguagem no `OnlineSessionClient`.
- Dependencias internas: Estado de linguagem do cliente.
- Status: funcional
- Observacoes tecnicas: O arquivo de i18n e TS indexado; textos em CSS/HTML devem ser auditados separadamente se houver copy fora dele.

## Mapa dos principais fluxos do sistema

1. Inicializacao local:
   `index.html` -> `src/UiLayouts/main.ts` -> `OnlineSessionClient`/`GameApp` -> `loadAssets` -> `createArena` -> loop de render/input.

2. Partida local:
   input teclado -> `InputController` -> `GameApp.simulatePlayerInputStep` -> movimento/bomba/skill -> colisao/arena -> render `draw*` -> audio.

3. Skill:
   input `skillPressed/skillHeld` -> `GameApp.syncPlayerSkill` -> `activatePlayerSkill` -> modulo do personagem -> `updatePlayerSkillChannel` -> efeitos no estado -> render preview/beam/surge/HUD.

4. Quick match:
   botao landing -> `OnlineSessionClient` -> websocket `quick-match` -> `GlobalLobby.handleQuickMatch` -> fila/sala -> `startRoomMatch` -> snapshots para cliente.

5. Lobby manual:
   criar/listar/entrar -> `GlobalLobby.handleCreateLobby`/`handleJoinLobby` -> seat/ready/chat -> `maybeStartMatch` -> partida autoritativa -> match result/rematch/lobby.

6. Online gameplay:
   input cliente -> input latch/seq -> worker match input -> `GameApp` headless -> snapshot -> `pushOnlineRenderSample` -> `projectNetworkPlayerPosition` -> render suavizado.

7. Conta e admin:
   `/account` -> registro/login -> `AccountAuth` -> conta/sessao no Durable Object -> papel `user` mantem a conta no jogo; papel `admin` redireciona para `/admin` -> arena list/create/get/update/validate/activate -> active arena definition -> novas partidas usam arena ativa.

8. Asset pipeline:
   Pixellab/spec -> gerar/promover/importar assets -> manifesto/arquivos publicos -> asset loader -> personagens no jogo.

## Dependencias principais

- Runtime: TypeScript + Vite.
- Backend: Cloudflare Worker/Wrangler, Durable Object APIs.
- Local legacy relay: `ws`.
- Build/test: TypeScript compiler, Vite, many Node `.mjs` contract checks.
- Code/data contracts internos: `src/Gameplay/types.ts`, `src/NetCode/protocol.ts`, `src/Arenas/arena.ts`.
- Assets: `public/assets/characters/manifest.approved.json`, `public/Assets/*`, CSS em `src/UiLayouts/main.css`.

## Pontos criticos, riscos e inconsistencias

- `src/Engine/game-app.ts` e um modulo muito grande e mistura simulacao, render, UI/HUD, online reconciliation, bots e skills.
- `worker/index.js` e muito grande e mistura Durable Object, HTTP endpoints, websocket, admin, telemetry, feedback e simulacao.
- `src/NetCode/session-client.ts` tambem concentra DOM render, handlers, websocket/state e copy de UI.
- `scripts/online_server.mjs` parece duplicar conceitos do worker e esta rotulado como legacy; manter claro que nao e backend primario.
- `scripts/.temp-static-server.cjs` esta indexado apesar de parecer temporario.
- README contem links absolutos antigos para `C:\Users\user\Desktop\AutoWebGame`, enquanto o cwd atual e `C:\Projetos\AutoWebGame`.
- Docs de progresso contem muitos TODOs antigos; nao implicam quebra runtime, mas indicam backlog e ruido documental.
- Configuracao real de Worker/admin/telemetry/feedback depende de env/bindings nao validados por CodeGraph.
- CodeGraph nao indexa CSS/HTML/imagens/JSON como codigo estrutural; front visual e assets precisam de auditoria complementar quando o assunto for UI/arte.

## Codigo morto, duplicado, incompleto ou desconectado

- Possivel duplicado/desconectado: `scripts/online_server.mjs` por ser legacy relay paralelo ao Worker.
- Possivel temporario: `scripts/.temp-static-server.cjs`.
- Parcial/operacional: `auto-improvements/*` e `src/Engine/auto-improvement-bridge.ts`; existem, mas parecem ferramenta de automacao/experimento, nao fluxo principal do usuario comum.
- Parcial/externo: Pixellab/SFX/Airtest dependem de env vars, servicos externos e/ou ferramentas locais.
- Incompleto documental: TODOs extensivos em `docs/progress.md` e `progress.md`.

## Proximos passos recomendados

1. Separar gradualmente `GameApp` em modulos de simulacao, render/HUD, online reconciliation e menu/local setup.
2. Separar `worker/index.js` em dominios: routing HTTP, websocket lobby, match pump, admin arena, telemetry/feedback; manter autenticacao no modulo profundo `src/Auth/account-auth.ts`.
3. Confirmar se `scripts/online_server.mjs` ainda e necessario; se sim, documentar suporte legacy; se nao, remover ou arquivar.
4. Remover ou ignorar `scripts/.temp-static-server.cjs` se for artefato temporario.
5. Atualizar links absolutos do README para caminhos relativos.
6. Rodar a bateria release-oriented do README antes de qualquer merge de runtime.
7. Quando investigar arquitetura, usar CodeGraph primeiro e abrir `DocsDev/codegraph/codegraph-visual.html` para orientacao rapida.
