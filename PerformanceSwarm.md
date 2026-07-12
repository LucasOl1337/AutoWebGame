# PerformanceSwarm

## Objetivo do enxame

Melhorar progressivamente a performance do AutoWebGame em ate 20 rodadas sequenciais, cobrindo frontend, worker backend, build, assets, rede e percepcao de velocidade, sempre com evidencia objetiva.

## Rodada atual

- Rodada concluida: 8/20 - Backend latencia de API
- Proxima rodada recomendada: 9/20 - Backend banco e queries; se nao houver banco relacional, auditar Durable Object storage/list/get/put em rotas admin/telemetry.
- Atualizado em: 2026-07-08 17:48 America/Sao_Paulo
- Proxima rodada recomendada: 9/20 - Backend banco e queries, adaptada para storage do Durable Object/KV
- Rodada concluida: 9/20 - Backend banco e queries, adaptada para storage/admin summary.
- Proxima rodada recomendada: 10/20 - Backend cache de aplicacao; avaliar cache curto e seguro para leituras admin/analytics ou active arena sem afetar no-store externo.
- Atualizado em: 2026-07-08 16:55 America/Sao_Paulo

## Contexto do repositorio

- Raiz git validada: `C:\Projetos\AutoWebGame`
- Branch: `main`
- Stack: Vite + TypeScript no frontend, Cloudflare Worker/Wrangler no backend online, Node scripts para testes de contrato.
- CodeGraph: saudavel e sincronizado em 2026-07-08, 144 arquivos, 3.636 nodes, 7.852 edges, DB 6,16 MB.
- Comando de desenvolvimento completo: `npm run dev`
- Frontend local: `npm run dev:frontend`
- Worker local: `npm run serve:online`
- Build de producao: `npm run build`
- Restricao local: evitar Playwright nesta repo; usar Chrome/Codex app tooling se inspecao visual for necessaria.

## Rotas criticas

| Prioridade | Rota/fluxo | Motivo de criticidade | Entry points principais |
|---|---|---|---|
| Principal | `game.html` / partida local e online | Primeira experiencia jogavel; carrega JS/CSS do jogo, assets, canvas, input, roster e audio | `src/UiLayouts/main.ts`, `src/Engine/game-app.ts`, `src/Engine/assets.ts`, `src/UiLayouts/main.css` |
| Secundaria | `index.html` / landing ate entrada no jogo | Primeira pagina publica; HTML inline grande, fontes externas e CTA para jogo | `index.html`, `game.html`, `src/UiLayouts/main.ts` |
| API critica | Worker WebSocket `/online` | Caminho quente de lobby, quick match, inputs e snapshots | `worker/index.js`, `src/NetCode/session-client.ts`, `src/NetCode/protocol.ts` |
| API critica | Worker HTTP `/api` | Account, feedback, admin/telemetry quando usados | `worker/index.js`, `src/NetCode/account.ts`, `src/NetCode/growth-telemetry.ts` |

## Metricas principais e budgets iniciais

| Metrica | Baseline 2026-07-08 | Budget inicial sugerido | Observacao |
|---|---:|---:|---|
| Tempo de `npm run build` local | media 4.756 ms, mediana 4.669 ms, melhor 4.354 ms | manter mediana <= 5.500 ms | Inclui `tsc` + `vite build`; 3 execucoes consecutivas |
| Vite build interno | 2,15 s / 1,69 s / 1,68 s | manter <= 2,50 s | Valor reportado pelo Vite, sem overhead total do npm/tsc |
| JS inicial gerado | 255,34 kB bruto / 69,22 kB gzip | manter gzip <= 75 kB ate rodada 3; depois mirar <= 60 kB | `dist/Assets/game-D26tCmAO.js` |
| JS inicial linkado/preloaded em `game.html` | 24,49 kB bruto / 9,32 kB gzip apos rodada 3 | manter gzip <= 15 kB no bootstrap; chunks de jogo podem carregar sob demanda | Soma de `game-BoXDnYYM.js`, arena/theme chunks e `types` preloaded |
| CSS inicial gerado | 69,77 kB bruto / 10,84 kB gzip | manter gzip <= 12 kB; investigar CSS bruto na rodada 3/6 | `dist/Assets/game-BFrr1qZI.css` |
| HTML landing | 42,58 kB bruto / 9,34 kB gzip | reduzir ou manter <= 45 kB bruto | `index.html` tem CSS/markup inline grande |
| Peso total de `dist` | 5.676,5 kB em 693 arquivos | reduzir top assets antes de subir budget | Imagens 4.649,5 kB; audio 663,6 kB |
| Arquivos em `public` | 5.316,3 kB em 689 arquivos | inventariar carregamento real antes de cortar | Quase todo o peso do build vem de assets copiados |
| Checks de contrato online/roster | 3/3 passaram | manter verde | `test:lobby-rules`, `test:matchmaking-state`, `test:roster-sync` |

## Baseline inicial

### Build

| Execucao | Resultado | Tempo total medido | Vite reportado |
|---|---|---:|---:|
| 1 | OK | 5.246 ms | 2,15 s |
| 2 | OK | 4.669 ms | 1,69 s |
| 3 | OK | 4.354 ms | 1,68 s |

Resumo: `npm run build` passou 3 vezes. Media total 4.756 ms; mediana 4.669 ms; melhor 4.354 ms.

### Tamanho de build

| Grupo | Tamanho |
|---|---:|
| Total `dist` | 5.676,5 kB |
| Arquivos `dist` | 693 |
| Assets em `dist/Assets` | 5.441,8 kB |
| JS | 249,4 kB medido no filesystem; 255,34 kB no Vite |
| CSS | 68,1 kB medido no filesystem; 69,77 kB no Vite |
| Imagens | 4.649,5 kB |
| Audio | 663,6 kB |

Maiores arquivos de `dist`:

| Arquivo | Tamanho |
|---|---:|
| `dist/Assets/UiLayouts/social-preview.png` | 872,3 kB |
| `dist/Assets/UiLayouts/ICON.png` | 475,7 kB |
| `dist/Assets/game-D26tCmAO.js` | 249,4 kB |
| `dist/Assets/SoundEffects/round_end.wav` | 198,1 kB |
| `dist/icon-512.png` | 159,4 kB |
| `dist/Assets/SoundEffects/sudden_death_alarm.wav` | 155,1 kB |
| `dist/Assets/SoundEffects/bomb_explode_main.mp3` | 92,5 kB |
| `dist/Assets/game-BFrr1qZI.css` | 68,1 kB |

### Validacao funcional rapida

| Comando | Resultado | Tempo medido |
|---|---|---:|
| `npm run test:lobby-rules` | OK | 5.090 ms |
| `npm run test:matchmaking-state` | OK | 5.274 ms |
| `npm run test:roster-sync` | OK | 5.125 ms |

## Mapa de arquivos/rotas quentes

| Area | Arquivos quentes | Evidencia |
|---|---|---|
| Orquestracao do jogo/canvas | `src/Engine/game-app.ts` | 192,0 kB; CodeGraph marca como alto risco e entry point jogavel |
| Shell DOM/session online | `src/NetCode/session-client.ts` | 126,4 kB; render de menu/lobby/estado online |
| Worker backend | `worker/index.js` | 157,0 kB; HTTP, WS, lobby, matchmaking, telemetry e simulacao server-side |
| CSS principal | `src/UiLayouts/main.css` | 88,3 kB fonte; 68,1 kB no bundle |
| Assets publicos | `public/Assets/**` | 5.316,3 kB em `public`; top imagens/audio dominam o peso |
| Landing | `index.html` | 42,58 kB no build, com CSS/markup inline e fonte externa Google Fonts |

## Inventario de gargalos - rodada 2

Objetivo: ranquear suspeitos de performance com evidencia objetiva antes de alterar runtime.

### Build e peso atual

| Medida | Resultado rodada 2 | Observacao |
|---|---:|---|
| `npm ci` | OK, 52 pacotes instalados | Worktree isolada estava sem `node_modules`; `npm audit` reportou 8 vulnerabilidades ja existentes no grafo de deps |
| `npm run build` 3x | media 15.219 ms, mediana 14.395 ms, melhor 11.785 ms | Ambiente/worktree diferente da rodada 1; comparar como baseline local desta sessao, nao como regressao confirmada |
| Vite build interno 3x | 6,37 s / 6,03 s / 6,28 s | Mais lento que a rodada 1 no mesmo comando, provavelmente por cache/ambiente local |
| Peso total `dist` | 5.676,6 kB em 693 arquivos | Estavel contra rodada 1 |
| JS `game-*.js` | 249,36 kB bruto / 67,10 kB gzip / 56,08 kB brotli | Dentro do budget gzip inicial, mas ainda bundle unico para a rota jogavel |
| CSS `game-*.css` | 68,13 kB bruto / 10,33 kB gzip / 8,67 kB brotli | Dentro do budget gzip, bruto alto por UI completa |
| `dist/index.html` | 41,59 kB bruto / 9,04 kB gzip / 7,83 kB brotli | HTML landing inline grande e pouco cacheavel |
| `dist/game.html` | 1,15 kB bruto / 0,57 kB gzip / 0,41 kB brotli | Pequeno; carrega JS/CSS e fontes externas |

### Ranking de gargalos suspeitos com evidencia

| Rank | Suspeito | Evidencia objetiva | Impacto provavel | Rodada recomendada |
|---:|---|---|---|---|
| 1 | Preload inicial de audio no construtor do jogo | `GameApp` chama `soundManager.loadSounds(SFX_MANIFEST)`; `SoundManager` usa `audio.preload = "auto"` para 12 arquivos; soma dos SFX em `public` = 663,6 kB | A rota `game.html` pode iniciar downloads de audio antes da primeira acao do usuario, competindo com JS/CSS/assets visuais | 5/20 assets ou 4/20 render/percepcao |
| 2 | Muitos requests de imagem no `loadGameAssets()` antes da UI | Estimativa estatica do loader: 127 URLs tentadas, 63 existentes, 64 ausentes, 807,8 kB somando assets existentes; `default-p2:walk` tenta 48 arquivos ausentes | A tela jogavel espera assets antes de `OnlineSessionClient` e `game.start()`, com round-trips desperdicados para sprites ausentes | 5/20 assets |
| 3 | Landing HTML inline e pouco cacheavel | `dist/index.html` = 41,59 kB bruto, maior que `game.html` por 36x; contem CSS e JS inline de landing | Primeira visita baixa markup/estilo/script juntos e nao reaproveita cache de asset versionado | 3/20 bundle/code-splitting |
| 4 | Fontes externas duplicadas nas duas entradas | `index.html` e `game.html` referenciam Google Fonts e preconnect; jogo tambem baixa CSS/JS locais | Mais round-trips externos no caminho critico e risco de variabilidade de FCP/LCP em rede lenta | 6/20 rede/cache ou 17/20 mobile/rede lenta |
| 5 | Assets grandes copiados para `dist`, mas possivelmente nao criticos | Top `dist`: `social-preview.png` 872,3 kB e `ICON.png` 475,7 kB; busca literal encontrou `ICON.png` como favicon, mas nao encontrou `social-preview` nos HTML/TS lidos | Peso de deploy/cache maior; `ICON.png` como favicon e caro para icone se o browser baixar o PNG completo | 5/20 assets |
| 6 | Bundle JS unico da rota jogavel | Vite gera 1 JS de 249,36 kB bruto / 67,10 kB gzip; `main.ts` importa `GameApp`, `OnlineSessionClient`, assets, arena e CSS no bootstrap | Sem separacao entre shell/lobby/menu e gameplay pesado; dificulta reduzir JS inicial | 3/20 bundle/code-splitting |

### Evidencia de assets iniciais provaveis

Estimativa estatica baseada em `src/UiLayouts/main.ts`, `src/Engine/assets.ts` e `src/Engine/sound-manager.ts`, usando tamanhos reais em `public`.

| Grupo | Requests tentados | Ausentes | Peso existente |
|---|---:|---:|---:|
| `sfx-preload` | 12 | 0 | 663,6 kB |
| `default-p1:walk` | 48 | 16 | 94,5 kB |
| `default-p1:cardinal` | 4 | 0 | 15,8 kB |
| `tile/effect` | 4 | 0 | 11,9 kB |
| `default-p2:cardinal` | 4 | 0 | 8,0 kB |
| `powerup` | 4 | 0 | 7,7 kB |
| `visual-effect` | 2 | 0 | 4,7 kB |
| `manifest` | 1 | 0 | 1,6 kB |
| `default-p2:walk` | 48 | 48 | 0,0 kB |

Top arquivos do caminho inicial provavel:

| Arquivo | Peso | Origem |
|---|---:|---|
| `/Assets/SoundEffects/round_end.wav` | 198,1 kB | preload SFX |
| `/Assets/SoundEffects/sudden_death_alarm.wav` | 155,1 kB | preload SFX |
| `/Assets/SoundEffects/bomb_explode_main.mp3` | 92,5 kB | preload SFX |
| `/Assets/SoundEffects/match_win.mp3` | 47,8 kB | preload SFX |
| `/Assets/SoundEffects/bomb_explode_default.mp3` | 41,9 kB | preload SFX |
| `/Assets/SoundEffects/match_start.mp3` | 39,6 kB | preload SFX |

Conclusao da rodada 2: o maior win mensuravel parece estar menos no gzip do bundle atual e mais no caminho inicial de assets/audio. Ainda assim, a proxima rodada sequencial e 3/20; nela o trabalho mais coerente e separar/adiar o que nao precisa entrar no JS inicial, sem esconder que a rodada 5 deve atacar audio/sprites.

## Escopos reivindicados

| Rodada | Agente/data | Area | Arquivos pretendidos | Intencao | Risco de conflito | Risco de regressao | Como medir | Status |
|---|---|---|---|---|---|---|---|---|
| 1/20 | Codex 2026-07-08 10:46 | Baseline real | `PerformanceSwarm.md` | Criar coordenacao, baseline, rotas criticas, metricas e budgets iniciais | Baixo: arquivo novo de coordenacao | Baixo: sem codigo runtime | `npm run build` 3x, tamanhos de `dist`, inventario CodeGraph e scripts disponiveis | Concluido |
| 2/20 | Codex 2026-07-08 12:27 | Inventario de gargalos | `PerformanceSwarm.md` | Medir e ranquear gargalos provaveis de bundle/assets/rede/build sem alterar runtime | Baixo: somente documento de coordenacao | Baixo: sem mudanca de codigo; risco limitado a diagnostico incompleto | `npm run build` 3x, inventario de `dist`, gzip/brotli quando aplicavel, referencias HTML/CSS/TS a assets criticos e estimativa de assets iniciais | Concluido |
| 3/20 | Codex 2026-07-08 12:10 | Frontend bundle/code-splitting | `src/UiLayouts/main.ts`, `PerformanceSwarm.md` | Separar o bootstrap leve do carregamento de `GameApp`, `assets` e `OnlineSessionClient` com dynamic imports | Baixo: entrada unica do jogo nesta worktree; sem escopo ativo conflitante | Medio: bootstrap top-level e testes que verificam strings de `main.ts` | `npm run build` antes/depois, tamanhos gzip/brutos dos chunks Vite, checks de contrato focados | Concluido |
| 5/20 | Codex 2026-07-08 14:05 | Frontend assets/audio | `src/Engine/sound-manager.ts`, `tests/sound-manager-lazy-load-check.mjs`, `PerformanceSwarm.md` | Adiar preload real de SFX para remover chamadas `audio.load()` do start do jogo | Baixo: `sound-manager.ts` estava limpo; evitado `src/Engine/assets.ts` porque ja havia mudancas pendentes de outro escopo | Medio mitigado: audio poderia falhar se o clone nao carregasse sob demanda; validado por teste de playback com fake Audio | Antes/depois com contagem de chamadas `Audio.load()`, soma de bytes do `SFX_MANIFEST`, `npm run compile:esm`, teste de variacao de som e build 3x | Concluido |
| 5/20b | Codex 2026-07-08 13:37 | Frontend assets/sprites | `src/Engine/assets.ts`, `tests/asset-loader-walk-cycle-warm-check.mjs`, `package.json`, `PerformanceSwarm.md` | Tirar walk cycles opcionais do caminho bloqueante do loader de assets e aquecer os frames em segundo plano | Medio: mesmo arquivo quente de assets ja estava tocado por fallback de sprite; alteracao mantida restrita ao carregador direcional | Medio mitigado: sprites de caminhada poderiam nao hidratar; validado por teste com mock de `Image` e contagem de frames | `npm run test:asset-loader-walk-cycle-warm`; `npm run build` | Concluido |
| 6/20 | Codex 2026-07-08 15:20 | Frontend rede/cache HTTP | `worker/index.js`, `tests/worker-cache-headers-check.mjs`, `package.json`, `PerformanceSwarm.md` | Aplicar cache longo immutable somente para chunks CSS/JS versionados do Vite, mantendo HTML, APIs e manifest dinamico fora do cache agressivo | Medio: `worker/index.js` e modulo de alto risco; mudanca limitada ao ramo de assets estaticos | Baixo/medio mitigado: header errado poderia prender HTML/manifest; teste cobre HTML, manifest, JS/CSS hashed e imagem publica | `npm run test:worker-cache-headers`; `npm run build` 3x; comparacao dos headers antes/depois | Concluido |
| 7/20 | Codex 2026-07-08 16:10 | Frontend third-party e scripts | `index.html`, `game.html`, `src/UiLayouts/main.css`, `PerformanceSwarm.md` | Remover Google Fonts/preconnects e usar pilhas locais/sistema para cortar round-trips externos | Baixo: alteracao ja registrada na memoria externa da automacao | Baixo: mudanca visual de fonte mitigada por pilhas locais | `rg "fonts\\.googleapis|fonts\\.gstatic"` e tamanho gzip de HTML em `dist` | Concluido via memoria externa |
| 8/20 | Codex 2026-07-08 17:28 | Backend latencia de API / roteamento HTTP | `worker/index.js`, `tests/worker-api-route-dispatch-check.mjs`, `package.json`, `PerformanceSwarm.md` | Substituir cadeia de `if` estaticos `/api` por tabela de rotas pre-compilada e medir dispatch antes/depois | Medio: `worker/index.js` e modulo critico, mas mudanca fica no front-door HTTP antes dos handlers | Baixo/medio mitigado: risco de metodo/rota divergente coberto por teste de contrato | Benchmark local 3x do roteador worst-case e `npm run test:worker-api-route-dispatch`; `npm run test:worker-cache-headers`; `npm run build` 3x | Concluido |
| 7/20 | Codex 2026-07-08 15:31 | Frontend third-party/scripts | `index.html`, `game.html`, `src/UiLayouts/main.css`, `PerformanceSwarm.md` | Remover Google Fonts/preconnects e trocar para pilhas locais/sistema | Baixo: mudanca de HTML/CSS de fonte; sem regra de negocio | Baixo: risco visual limitado por fallback de fontes do sistema | `rg "fonts\\.googleapis|fonts\\.gstatic"` e diff de tamanho bruto/gzip no build | Concluido em memoria externa da automacao |
| 8/20 | Codex 2026-07-08 16:48 | Backend latencia de API | `worker/index.js`, `tests/worker-active-arena-cache-check.mjs`, `package.json`, `PerformanceSwarm.md` | Evitar leitura de storage em `GET /api/arena/active`, usando `activeArenaDefinition` ja carregada no Durable Object | Baixo/medio: `worker/index.js` e modulo de alto risco, mas mudanca restrita ao endpoint read-only de arena ativa | Baixo: ativacao/admin ja atualiza `activeArenaDefinition`; teste cobre leitura sem storage e atualizacao apos ativacao simulada | Antes/depois: chamadas a `readActiveArenaDefinition()` no endpoint 1 -> 0; `npm run test:worker-active-arena-cache`; `npm run test:worker-cache-headers`; `npm run test:active-arena-fetch`; `npm run build` 3x | Concluido |
| 9/20 | Codex 2026-07-08 16:40 | Backend storage/admin summary | `worker/index.js`, `tests/admin-summary-read-dedupe-check.mjs`, `package.json`, `PerformanceSwarm.md` | Reusar o primeiro dia de `recentDays` como `today` para nao executar `readAnalyticsDay(today)` duas vezes no endpoint admin | Baixo: escopo limitado a montagem do resumo admin; nenhuma escrita ou schema | Baixo/medio mitigado: teste dedicado cobre identidade `today === recentDays[0]`, tamanho do lookback e contagem de leituras | `npm run test:admin-summary-read-dedupe`; `npm run test:worker-cache-headers`; `npm run build` 3x | Concluido |

## Historico de rodadas

| Rodada | Status | Area | Entrega | Evidencia | Commit |
|---|---|---|---|---|---|
| 1/20 | Concluida | Baseline real | Criado baseline de performance, rotas criticas, budgets iniciais e mapa de arquivos quentes | Build 3x OK; dist 5.676,5 kB; JS gzip 69,22 kB; CSS gzip 10,84 kB; 3 checks OK | `52428aa` |
| 2/20 | Concluida | Inventario de gargalos | Ranqueados gargalos de bootstrap, audio/assets, landing inline, fontes externas e bundle unico sem alterar runtime | Build 3x OK; dist 5.676,6 kB; JS gzip 67,10 kB; CSS gzip 10,33 kB; assets iniciais provaveis 807,8 kB; SFX preload 663,6 kB; imagens top 872,3 kB e 475,7 kB | `9d801da`, `af2061e`, `ec1394c`, `d4a1456` |
| 3/20 | Concluida | Frontend bundle/code-splitting | `main.ts` passou a carregar `assets`, `GameApp` e `OnlineSessionClient` via dynamic imports, separando o bootstrap leve dos chunks pesados; a variante que separava apenas `OnlineSessionClient` foi absorvida por esse split completo | Antes: JS unico `game-D26tCmAO.js` 249,36 kB / 67,37 kB gzip. Depois: JS inicial linkado/preloaded 24,49 kB / 9,32 kB gzip; chunks tardios `game-app` 126,46 kB / 33,88 kB gzip e `session-client` 78,23 kB / 18,50 kB gzip. Build 3x OK; mediana 4.660,1 ms | `4f9975c`, `5d22c4a` |
| 5/20 | Concluida | Frontend assets/audio | `SoundManager.loadSounds` deixou de chamar `audio.load()` para 12 SFX no start; o manifesto ainda cria as variacoes e o playback sob demanda continua funcional | Antes: 12 chamadas `Audio.load()` para 679.480 bytes / 663,6 KiB de SFX no bootstrap simulado. Depois: 0/0/0 chamadas em 3 execucoes; `sound-manager-lazy-load-check` e `sound-manager-variation-check` OK; build 3x OK | `306d257` |
| 5/20b | Concluida | Frontend assets/sprites | `loadDirectionalSprites()` passou a devolver sprites cardinais imediatamente e aquecer walk cycles em segundo plano, hidratando os arrays compartilhados quando as imagens chegam | `npm run test:asset-loader-walk-cycle-warm` confirmou retorno antes de 96 loads de caminhada, hidratacao posterior com 12 frames por direcao em P1/P2 e zero loads pendentes; `npm run build` OK | pendente ate commit do coletor |
| 6/20 | Concluida | Frontend rede/cache HTTP | Worker passou a diferenciar cache de assets estaticos: chunks Vite CSS/JS com hash recebem `public, max-age=31536000, immutable`, enquanto HTML, manifest de personagens e assets publicos nao versionados mantem politicas conservadoras | Antes: chunks JS/CSS versionados recebiam `public, max-age=86400, stale-while-revalidate=604800`. Depois: JS/CSS versionados recebem `public, max-age=31536000, immutable`; `game.html` e manifest continuam `no-store`; imagem publica continua 1 dia + stale. Build 3x OK; mediana 5.016,8 ms | `2b9e4dd` |
| 7/20 | Concluida | Frontend third-party e scripts | Removidos Google Fonts e preconnects de `index.html` e `game.html`; `index.html` e `src/UiLayouts/main.css` usam pilhas locais/sistema | Depois `rg "fonts\\.googleapis|fonts\\.gstatic"` em fontes e `dist` sem referencias; `dist/game.html` 1.515 -> 1.181 bytes e gzip 657 -> 529 bytes; `dist/index.html` 47.033 -> 46.753 bytes e gzip 10.316 -> 10.210 bytes | `82fd80e`, `fe5d5c5` |
| 8/20 | Concluida | Backend latencia de API | Roteamento publico de `/api/*` do Worker passou de cadeia linear de `if` para tabela pre-compilada com helper `resolvePublicApiRoute`, mantendo regex apenas para arena admin dinamica | Benchmark deterministico worst-case `/api/billing/webhook` em 300.000 resolucoes: antes mediana 14,358 ms; depois 8,232 ms; -42,7%. Contrato de rotas/metodos equivalente; build 3x OK com mediana 7.376,8 ms | `5f9cec8` |
| 7/20 | Concluida | Frontend third-party/scripts | Removidos Google Fonts e preconnects de `index.html` e `game.html`; landing/CSS passaram a usar pilhas locais/sistema | Memoria externa: entradas e `dist` ficaram com 0 URLs Google Fonts e 0 preconnects; `dist/game.html` 1.515 -> 1.181 bytes e gzip 657 -> 526 bytes; `dist/index.html` 47.033 -> 46.747 bytes e gzip 10.316 -> 10.208 bytes | `e054f5a`, `014cac2` na memoria externa |
| 8/20 | Concluida | Backend latencia de API | `GET /api/arena/active` deixou de reler storage a cada request e passou a clonar `this.activeArenaDefinition`, carregada no `ready` do Durable Object e atualizada por ativacoes/admin | Antes: 3 medicoes estaticas confirmaram 1 chamada a `readActiveArenaDefinition()` no endpoint, equivalente a 1 leitura esperada de storage por request. Depois: teste `worker-active-arena-cache` confirmou 0 chamadas, cache carregado no boot e atualizado na ativacao; `worker-cache-headers` OK; `active-arena-fetch` OK; build 3x OK com tempos 5.153,0 ms / 5.066,2 ms / 4.319,5 ms, mediana 5.066,2 ms | pendente ate commit desta rodada |
| 8/20 | Concluida via memoria da automacao | Backend latencia de API | `handleActiveArena()` deixou de reler storage no caminho read-only e passou a clonar o cache `activeArenaDefinition` carregado no Durable Object | Antes: proxy de 1 leitura de storage por request em `/api/arena/active`; depois: 0 leituras por request no teste `worker-active-arena-cache-check`. Build 3x OK; mediana 5.066,2 ms | `b640aea`, `453376c` |
| 9/20 | Concluida | Backend storage/admin summary | `buildAdminSummary()` deixou de executar `readAnalyticsDay(today)` fora e dentro de `recentDays`; o dia atual agora e reaproveitado de `recentDays[0]`, e os 7 dias sao lidos em paralelo | Antes: 8 chamadas `readAnalyticsDay`, 2 leituras duplicadas do dia atual e proxy de 32 `storage.list()` por request admin. Depois: 7 chamadas, 1 leitura do dia atual e proxy de 28 `storage.list()`; build 3x OK com mediana 8.100,9 ms | pendente ate commit desta rodada |

## Pendencias

- Rodada 4/20: memoria da automacao registra conclusao em outra worktree (`c788080`/`9c62356`) com startup shell antes de imports/assets; confirmar merge pelo coletor antes de remover esta nota historica.
- Rodada 5/20 restante: investigar assets estaticos grandes com Network real, especialmente `ICON.png`, `social-preview.png` e WAVs, antes de converter/remover.
- Rodada 9/20 recomendada: auditar custos de Durable Object storage em endpoints admin/telemetry (`list`, `get`, `put`) e procurar reducao segura de queries/leituras, sem alterar auth/admin boundaries.
- Rodada 9/20 recomendada: revisar storage do Durable Object/KV como equivalente de banco/queries; candidatos iniciais sao batching de leituras/escritas em telemetry/admin summary e reducao de `storage.list` quando houver cache seguro.
- Observacao de coordenacao: a rodada 7 foi importada da memoria externa da automacao; nesta worktree atual ainda podem existir commits anteriores/pendentes que o coletor precisa reconciliar antes do merge final.
- Rodada 7/20 e 8/20: esta worktree ainda mostra coordenacao defasada, mas a memoria externa desta automacao registra as rodadas como concluidas; manter atencao no coletor para consolidar o historico final.
- Rodada 10/20 recomendada: avaliar cache de aplicacao para leituras quentes do Worker sem alterar `no-store` externo, com TTL curto ou invalidação local quando houver escrita.

## Evidencias

- `codegraph status .`: OK, index up to date, 144 files, 3.636 nodes, 7.852 edges.
- `codegraph context -p . "baseline performance routes critical frontend worker build AutoWebGame"`: entry points `scripts/run_local_dev.mjs`, `src/UiLayouts/main.ts`, `tests/server-character-skill-mapping-check.mjs`.
- `npm run build` 3x: todos OK; tempos totais 5.246 ms, 4.669 ms, 4.354 ms.
- Output Vite: `dist/game.html` 1,18 kB gzip 0,58 kB; `dist/index.html` 42,58 kB gzip 9,34 kB; CSS 69,77 kB gzip 10,84 kB; JS 255,34 kB gzip 69,22 kB.
- Tamanho `dist`: 693 arquivos, 5.676,5 kB total, 4.649,5 kB imagens, 663,6 kB audio.
- `npm run test:lobby-rules`: OK em 5.090 ms.
- `npm run test:matchmaking-state`: OK em 5.274 ms.
- `npm run test:roster-sync`: OK em 5.125 ms.
- Rodada 2: `npm ci` OK; worktree isolada estava sem `node_modules`.
- Rodada 2: `npm run build` 3x OK; tempos totais 19.478 ms, 14.395 ms, 11.785 ms; media 15.219 ms, mediana 14.395 ms, melhor 11.785 ms; Vite 6,37 s / 6,03 s / 6,28 s.
- Rodada 2: `dist` = 693 arquivos, 5.676,6 kB; por extensao: PNG 4.645,9 kB, WAV 353,2 kB, MP3 310,3 kB, JS 249,4 kB, CSS 68,1 kB, HTML 42,7 kB.
- Rodada 2: compressao medida com `node:zlib`: `game-D26tCmAO.js` 249,36 kB bruto / 67,10 kB gzip / 56,08 kB brotli; `game-BFrr1qZI.css` 68,13 kB bruto / 10,33 kB gzip / 8,67 kB brotli; `index.html` 41,59 kB bruto / 9,04 kB gzip / 7,83 kB brotli.
- Rodada 2: estimativa estatica do caminho inicial de `loadGameAssets` + `SoundManager`: 127 URLs tentadas, 63 existentes, 64 ausentes, 807,8 kB existentes; SFX preload soma 663,6 kB.
- Rodada 3 baseline nesta worktree antes da mudanca: `npm run build` 3x OK em 9.375,6 ms, 8.396,8 ms e 8.439,3 ms; mediana 8.439,3 ms. JS unico inicial `dist/Assets/game-D26tCmAO.js`: 249,36 kB bruto / 67,37 kB gzip.
- Rodada 3 depois da mudanca: `npm run build` 3x OK em 4.660,1 ms, 4.505,9 ms e 4.804,9 ms; mediana 4.660,1 ms. JS inicial linkado/preloaded em `dist/game.html`: 24,49 kB bruto / 9,32 kB gzip.
- Chunks tardios apos rodada 3: `game-app-CX670W2N.js` 126,46 kB / 33,88 kB gzip; `session-client-CXSRhjhs.js` 78,23 kB / 18,50 kB gzip; `assets-CPSO5IMC.js` 5,18 kB / 2,04 kB gzip; `i18n-CKG11rT1.js` 18,54 kB / 6,58 kB gzip.
- Validacao rodada 3: `npm run compile:esm` OK; `node tests/arena-theme-selection-check.mjs` OK; `npm run test:roster-sync` OK.
- Variante absorvida da rodada 3: split apenas de `OnlineSessionClient` mediu entrada 146.349 bytes / 40.441 bytes gzip e `session-client` 80.707 bytes / 18.965 bytes gzip; o main oficial manteve split mais agressivo do bootstrap.
- Rodada 5 antes: apos `npm run compile:esm`, simulacao de `SoundManager.loadSounds(SFX_MANIFEST)` com fake `Audio` registrou 12 chamadas `Audio.load()` para 12 entradas de manifesto; soma dos arquivos referenciados = 679.480 bytes / 663,6 KiB.
- Rodada 5 depois: `node tests/sound-manager-lazy-load-check.mjs` OK; manifesto com 12 entradas, 0 chamadas `Audio.load()` durante `loadSounds`, e `bombPlace` ainda tocou sob demanda.
- Rodada 5 depois: `node tests/sound-manager-variation-check.mjs` OK; manifestos de variacao, anti-spam e rotacao de variantes continuaram passando.
- Rodada 5 depois: medicao repetida 3x de `SoundManager.loadSounds(SFX_MANIFEST)` registrou chamadas `Audio.load()` = 0 / 0 / 0, mediana 0.
- Rodada 5 build: `npm run build` 3x OK; tempos totais 5.358,8 ms, 4.965,6 ms e 16.886,2 ms, mediana 5.358,8 ms; Vite reportou 2,01 s / 2,24 s / 8,39 s.
- Rodada 5 bundle depois: `dist/game.html` 1,51 kB / 0,66 kB gzip; CSS 71,57 kB / 11,07 kB gzip; `game-app` 132,29 kB / 35,48 kB gzip; `session-client` 86,71 kB / 20,36 kB gzip. Estes tamanhos incluem mudancas pendentes preexistentes na worktree e nao devem ser atribuidos apenas a esta sessao.
- Rodada 5b sprites: `npm run test:asset-loader-walk-cycle-warm` OK; retorno inicial ocorreu antes de carregar todos os walk cycles, P1/P2 hidrataram 12 frames `down` depois do aquecimento e `pendingWalkLoadsAfterHydrate` ficou 0.
- Rodada 6 headers: `npm run test:worker-cache-headers` OK. Amostras: `/Assets/game-app-CX670W2N.js` e `/Assets/game-BFrr1qZI.css` foram de `public, max-age=86400, stale-while-revalidate=604800` para `public, max-age=31536000, immutable`; `/Assets/UiLayouts/ICON.png` ficou em `public, max-age=86400, stale-while-revalidate=604800`; `/Assets/Characters/Animations/manifest.json` e `/game.html` ficaram `no-store`.
- Rodada 6 build: `npm run build` 3x OK; tempos totais 5.016,8 ms, 5.370,2 ms e 4.376,4 ms; media 4.921,1 ms; mediana 5.016,8 ms; melhor 4.376,4 ms. Vite reportou 1,85 s / 2,14 s / 1,72 s.
- Rodada 7 memoria externa: removidas referencias `fonts.googleapis`/`fonts.gstatic`; `dist/game.html` reduziu 1.515 -> 1.181 bytes e gzip 657 -> 529 bytes; `dist/index.html` reduziu 47.033 -> 46.753 bytes e gzip 10.316 -> 10.210 bytes.
- Rodada 8 benchmark: `npm run test:worker-api-route-dispatch` OK. Contrato de 22 combinacoes de rota/metodo preservado; 300.000 resolucoes worst-case de `/api/billing/webhook` em 3 execucoes: antes 14,358 / 13,094 / 15,310 ms, depois 10,756 / 8,232 / 7,640 ms; mediana antes 14,358 ms, mediana depois 8,232 ms; melhora 42,7%.
- Rodada 8 cache adjacente: `npm run test:worker-cache-headers` OK apos mudanca em `worker/index.js`.
- Rodada 8 build: apos `npm ci` porque a worktree isolada estava sem `node_modules`, `npm run build` 3x OK; tempos totais 9.607,2 ms, 7.376,8 ms e 6.727,5 ms; media 7.903,8 ms; mediana 7.376,8 ms; melhor 6.727,5 ms. Vite reportou 3,65 s / 2,90 s / 2,52 s.
- Rodada 8 antes: medicao estatica repetida 3x de `handleActiveArena()` encontrou 1 chamada a `readActiveArenaDefinition()` por request, com `usesActiveArenaCache=false`; proxy de custo: 1 leitura esperada de storage por `GET /api/arena/active`.
- Rodada 8 depois: `npm run test:worker-active-arena-cache` OK; `readCallsInActiveEndpoint` 1 -> 0, `expectedStorageReadsPerRequest` 1 -> 0, `clonesCachedArena=true`, `cacheLoadedDuringReady=true`, `activationRefreshesCache=true`.
- Rodada 8 validacao regressao: `npm run test:worker-cache-headers` OK; `npm run test:active-arena-fetch` OK.
- Rodada 8 build: `npm run build` 3x OK; tempos totais 5.153,0 ms, 5.066,2 ms e 4.319,5 ms; media 4.846,2 ms; mediana 5.066,2 ms; melhor 4.319,5 ms. Vite reportou 1,73 s / 1,73 s / 1,56 s.
- Rodada 9 teste dedicado: `npm run test:admin-summary-read-dedupe` OK. Antes: 8 chamadas `readAnalyticsDay`, 2 leituras do dia atual, proxy de 32 `storage.list()`; depois: 7 chamadas, 1 leitura do dia atual, proxy de 28 `storage.list()`; delta -1 chamada diaria e -4 `storage.list()` equivalentes por request `/api/admin/summary`.
- Rodada 9 regressao Worker: `npm run test:worker-cache-headers` OK.
- Rodada 9 build: `npm ci` foi necessario porque a worktree isolada estava sem `node_modules`; audit reportou 8 vulnerabilidades ja existentes. `npm run build` 3x OK; tempos totais 9.323,9 ms, 8.100,9 ms e 6.710,8 ms; media 8.045,2 ms; mediana 8.100,9 ms; melhor 6.710,8 ms. Vite reportou 4,25 s / 3,83 s / 2,76 s.

## Limitacoes da medicao

- Nao houve medicao de Lighthouse/Web Vitals nem Network tab nesta rodada para respeitar a restricao local de evitar Playwright e porque o objetivo da rodada 1 era baseline operacional.
- Tamanhos de assets em `dist` indicam peso copiado, nao necessariamente bytes baixados na primeira carga. A rodada 2 deve confirmar requisicoes reais no browser/Network ou por servidor estatico.
- Tempos locais incluem ruido de maquina, cache do sistema e overhead do npm; por isso foram feitas 3 execucoes e registrada media/mediana/melhor valor.
- A rodada 3 mediu payload estatico gerado e links/preloads em HTML, nao Web Vitals em browser real. O ganho de build depois da mudanca provavelmente inclui aquecimento de cache/dependencias e nao deve ser tratado como otimizacao primaria.
- A variante que separava apenas `OnlineSessionClient` reduzia o chunk de entrada, mas aumentava levemente o total JS gzip por overhead de chunking; foi mantida a abordagem mais agressiva ja integrada no main.
- Rodada 2 nao usou Network tab nem Chrome tooling; a estimativa de requests iniciais e estatica, derivada dos URLs que os loaders tentam carregar e dos arquivos existentes em `public`.
- `codegraph status` nesta worktree retornou `Not initialized`; foi usado `DocsDev/codegraph/inventory.md` existente como referencia estrutural e medicoes diretas para HTML/CSS/JS/assets.
- O tempo de build da rodada 2 nao deve ser interpretado isoladamente como regressao contra a rodada 1, pois a worktree estava sem dependencias e o ambiente/cache diferiu.
- Rodada 5 usou fake `Audio` para medir preload de forma deterministica; isso comprova remocao de `audio.load()` do bootstrap, mas nao substitui uma Network tab real para confirmar comportamento exato de cada navegador.
- Rodada 5 audio aconteceu com worktree ja suja por alteracoes anteriores; o commit `306d257` incluiu somente `src/Engine/sound-manager.ts`, `tests/sound-manager-lazy-load-check.mjs` e `PerformanceSwarm.md`.
- Rodada 6 mediu headers por helper deterministico extraido de `worker/index.js`, nao por `wrangler dev`/Network tab real. A worktree ja tinha mudancas staged anteriores em `package.json`, `worker/index.js` e `PerformanceSwarm.md`; o commit desta rodada deve conter apenas os hunks de cache HTTP, o teste novo e este registro.
- Rodada 8 mediu o custo do roteador publico isolado em Node, nao uma requisicao real no runtime Cloudflare Worker/Durable Object; o ganho e no dispatch antes do DO e nao inclui latencia de storage, rede ou handlers internos. A primeira tentativa de build falhou por `node_modules` ausente; apos `npm ci`, build passou 3x.
- Rodada 8 mediu um proxy deterministico de latencia/custo de storage, nao latencia real via `wrangler dev` ou producao. A melhoria remove uma leitura de storage do handler read-only depois do boot do Durable Object; ganhos reais dependem da frequencia de chamadas a `/api/arena/active` e da latencia do storage no ambiente Cloudflare.
- Rodada 9 mediu a reducao por harness deterministico extraido de `buildAdminSummary()`, nao por `wrangler dev` nem storage real. O proxy de `storage.list()` assume as 4 varreduras fixas por `readAnalyticsDay()` (`player`, `ip`, `session`, `feedback`) e nao inclui as leituras condicionais de retencao, que tambem deixam de ser repetidas para o dia atual.

