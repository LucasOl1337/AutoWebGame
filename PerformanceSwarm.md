# PerformanceSwarm

## Objetivo do enxame

Melhorar progressivamente a performance do AutoWebGame em ate 20 rodadas sequenciais, cobrindo frontend, worker backend, build, assets, rede e percepcao de velocidade, sempre com evidencia objetiva.

## Rodada atual

- Rodada concluida: 2/20 - Inventario de gargalos
- Proxima rodada recomendada: 3/20 - Frontend bundle e code-splitting
- Atualizado em: 2026-07-08 12:45 America/Sao_Paulo

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

## Historico de rodadas

| Rodada | Status | Area | Entrega | Evidencia | Commit |
|---|---|---|---|---|---|
| 1/20 | Concluida | Baseline real | Criado baseline de performance, rotas criticas, budgets iniciais e mapa de arquivos quentes | Build 3x OK; dist 5.676,5 kB; JS gzip 69,22 kB; CSS gzip 10,84 kB; 3 checks OK | `52428aa` |
| 2/20 | Concluida | Inventario de gargalos | Ranqueados gargalos de audio/assets, landing inline, fontes externas e bundle unico sem alterar runtime | Build 3x OK; dist 5.676,6 kB; JS gzip 67,10 kB; CSS gzip 10,33 kB; assets iniciais provaveis 807,8 kB; SFX preload 663,6 kB | Pendente ate commit local |

## Pendencias

- Rodada 3/20: frontend bundle e code-splitting. Recomendo um trabalho pequeno e seguro:
  - medir se `index.html` pode extrair CSS/JS inline para assets versionados sem mudar visual;
  - ou separar algum modulo nao essencial do bootstrap de `game.html` por `import()` com budget de JS inicial.
- Rodada 5/20 deve priorizar assets/audio:
  - adiar preload de SFX ate primeira interacao ou ate entrada real em partida;
  - remover tentativas de 48 sprites ausentes de `default-p2:walk` se nao houver animacao;
  - trocar favicon PNG grande por SVG/32px quando suportado e confirmar se `ICON.png` ainda precisa ser referenciado.

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

## Limitacoes da medicao

- Nao houve medicao de Lighthouse/Web Vitals nem Network tab nesta rodada para respeitar a restricao local de evitar Playwright e porque o objetivo da rodada 1 era baseline operacional.
- Tamanhos de assets em `dist` indicam peso copiado, nao necessariamente bytes baixados na primeira carga. A rodada 2 deve confirmar requisicoes reais no browser/Network ou por servidor estatico.
- Tempos locais incluem ruido de maquina, cache do sistema e overhead do npm; por isso foram feitas 3 execucoes e registrada media/mediana/melhor valor.
- Rodada 2 nao usou Network tab nem Chrome tooling; a estimativa de requests iniciais e estatica, derivada dos URLs que os loaders tentam carregar e dos arquivos existentes em `public`.
- `codegraph status` nesta worktree retornou `Not initialized`; foi usado `DocsDev/codegraph/inventory.md` existente como referencia estrutural e medicoes diretas para HTML/CSS/JS/assets.
- O tempo de build da rodada 2 nao deve ser interpretado isoladamente como regressao contra a rodada 1, pois a worktree estava sem dependencias e o ambiente/cache diferiu.
