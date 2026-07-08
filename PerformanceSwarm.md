# PerformanceSwarm

## Objetivo do enxame

Melhorar progressivamente a performance do AutoWebGame em ate 20 rodadas sequenciais, cobrindo frontend, worker backend, build, assets, rede e percepcao de velocidade, sempre com evidencia objetiva.

## Rodada atual

- Rodada concluida: 1/20 - Baseline real
- Proxima rodada recomendada: 2/20 - Inventario de gargalos
- Atualizado em: 2026-07-08 11:04 America/Sao_Paulo

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

## Escopos reivindicados

| Rodada | Agente/data | Area | Arquivos pretendidos | Intencao | Risco de conflito | Risco de regressao | Como medir | Status |
|---|---|---|---|---|---|---|---|---|
| 1/20 | Codex 2026-07-08 10:55 | Baseline real | `PerformanceSwarm.md` | Criar coordenacao, baseline, rotas criticas, metricas e budgets iniciais | Baixo: arquivo novo de coordenacao | Baixo: sem codigo runtime | `npm run build` 3x, tamanhos de `dist`, inventario CodeGraph e scripts disponiveis | Concluido |

## Historico de rodadas

| Rodada | Status | Area | Entrega | Evidencia | Commit |
|---|---|---|---|---|---|
| 1/20 | Concluida | Baseline real | Criado baseline de performance, rotas criticas, budgets iniciais e mapa de arquivos quentes | Build 3x OK; dist 5.676,5 kB; JS gzip 69,22 kB; CSS gzip 10,84 kB; 3 checks OK | `52428aa` |

## Pendencias

- Rodada 2/20: inventariar gargalos com evidencia antes de mudar codigo. Recomendo focar primeiro em:
  - se `social-preview.png` e `ICON.png` sao baixados no caminho critico ou apenas copiados;
  - se `index.html` precisa manter tanto CSS/markup inline na landing;
  - se o bundle unico `game-*.js` permite code-splitting seguro entre landing/shell/jogo;
  - se WAVs grandes podem ser convertidos ou lazy-loaded sem quebrar feedback de gameplay;
  - se `worker/index.js` tem endpoints ou serializacoes lentas que merecem microbench.

## Evidencias

- `codegraph status .`: OK, index up to date, 144 files, 3.636 nodes, 7.852 edges.
- `codegraph context -p . "baseline performance routes critical frontend worker build AutoWebGame"`: entry points `scripts/run_local_dev.mjs`, `src/UiLayouts/main.ts`, `tests/server-character-skill-mapping-check.mjs`.
- `npm run build` 3x: todos OK; tempos totais 5.246 ms, 4.669 ms, 4.354 ms.
- Output Vite: `dist/game.html` 1,18 kB gzip 0,58 kB; `dist/index.html` 42,58 kB gzip 9,34 kB; CSS 69,77 kB gzip 10,84 kB; JS 255,34 kB gzip 69,22 kB.
- Tamanho `dist`: 693 arquivos, 5.676,5 kB total, 4.649,5 kB imagens, 663,6 kB audio.
- `npm run test:lobby-rules`: OK em 5.090 ms.
- `npm run test:matchmaking-state`: OK em 5.274 ms.
- `npm run test:roster-sync`: OK em 5.125 ms.

## Limitacoes da medicao

- Nao houve medicao de Lighthouse/Web Vitals nem Network tab nesta rodada para respeitar a restricao local de evitar Playwright e porque o objetivo da rodada 1 era baseline operacional.
- Tamanhos de assets em `dist` indicam peso copiado, nao necessariamente bytes baixados na primeira carga. A rodada 2 deve confirmar requisicoes reais no browser/Network ou por servidor estatico.
- Tempos locais incluem ruido de maquina, cache do sistema e overhead do npm; por isso foram feitas 3 execucoes e registrada media/mediana/melhor valor.
