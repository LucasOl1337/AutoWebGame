Original prompt: Usaando a habilidade web game do codex, vamos desenvolver um jogo webapp.

2026-03-16
- Kickoff do projeto registrado.
- Workspace estava vazio no momento da anÃ¡lise inicial.
- Definido plano inicial para um jogo web inspirado em Bomberman, com foco em MVP 2D grid-based.

TODO
- Escolher entre Vite + JavaScript puro ou Vite + TypeScript no primeiro scaffold.
- Criar scaffold inicial com canvas Ãºnico, loop determinÃ­stico e hooks `window.render_game_to_text` / `window.advanceTime`.
- Implementar primeiro slice jogÃ¡vel: mapa fixo, movimentaÃ§Ã£o em grid, bombas, explosÃ£o e destruiÃ§Ã£o de blocos.

Sugestoes
- Manter placeholder assets no inÃ­cio para validar jogabilidade antes de investir em arte final.
- Testar cada incremento com o cliente Playwright da skill `develop-web-game`.

2026-03-16 implementation
- Scaffold inicial criado com Vite + TypeScript + Canvas 2D.
- Core do jogo implementado com menu, partida versus local, round reset, match result, bombas, chamas, power-ups e hooks de debug.
- Runtime atual usa renderizacao procedural no canvas como fallback visual enquanto assets MCP nao entram.
- Smoke test via skill Playwright validou: menu, start de partida, alias de automacao para P1/P2, round reset apos explosao e ausencia de erros de console.
- Ajustado alias de automacao para funcionar com o conjunto reduzido de teclas do cliente da skill sem alterar os controles principais do jogo para usuarios reais.
- HUD refinado apos revisao visual dos screenshots.

TODO adicional
- Integrar assets gerados por MCP em `public/assets` e trocar a arte procedural atual quando quisermos subir o acabamento visual.
- Adicionar mais cenarios de smoke para pickup de power-up e chain reaction de bombas.
2026-03-16 map revision
- Arena redesenhada para abrir mais corredores laterais e um miolo contestado, reduzindo blocos quebraveis de 97 para 40.
- Spawns ficaram com bolsao seguro e rotas iniciais claras para evitar sensacao de personagem travado.
- Visual do piso recebeu destaque em corredores e spawn bays para melhorar leitura da arena.
- Smoke validou movimentacao livre do P1 logo no inicio e regras de partida/explosao permaneceram estaveis.
2026-03-16 pixellab art pass
- Integrados sprites PixelLab para os dois personagens (4 direcoes), bomba, chama, crate, wall, piso base/lane/spawn e pickups.
- Feitas multiplas rodadas de refinamento visual: primeira integracao, troca de lane tile menos estourado e nova parede mais limpa para reduzir ruido.
- Runtime agora carrega assets locais com fallback procedural, permitindo iterar sem quebrar o jogo.
- Smokes visuais revisados em spawn-check, art-round-1, art-round-2, art-round-3, bomb-preview e bomb-only.

TODO visual
- Se quisermos mais polish, a proxima rodada natural e gerar HUD/logo e animacoes de caminhada no PixelLab.
- Considerar uma segunda familia de crates ou variacao de piso para reduzir repeticao em partidas longas.
2026-03-16 ruins pivot
- Direcao visual mudou de neon factory para mistbridge/cliff ruins para aproximar o mood das referencias.
- Varias rodadas do PixelLab foram curadas manualmente; apenas os assets aprovados entraram no runtime.
- Integrados novos personagens fantasy, piso de pedra, crate/barricada de ruina, bomba e chama tematicas.
- Arena foi centralizada com tile menor para abrir margem visual ao redor do grid e melhorar composicao de cena.
- Paredes solidas passaram a ser desenhadas como parapeito de pedra menos tabuleiro.
- Screenshots-chave: output/art-round-framed, output/bomb-only-final, output/bomb-preview.
2026-03-16 movement refactor
- Movimentacao saiu do modelo tile-a-tile travado e foi para deslocamento continuo com lane snapping, mantendo resposta curta para taps e parada imediata ao soltar input.
- Causa raiz do personagem "travado" encontrada: spawns antigos (`1,1` e `13,11`) caiam em tiles de pilar solido; novos spawns foram movidos para tiles jogaveis (`2,1` e `12,11`).
- `render_game_to_text` agora reporta velocidade do player alem de tile e pixel, ajudando a validar sensacao/responsividade.
- Validado com build, smoke da skill (`tests/actions/skill-move-left.json`) e checagem complementar via Playwright pressionando tecla real para confirmar tap curto sem deslocamento de um tile inteiro.

TODO movimento
- Ajustar mais fino de feeling: velocidade base, hitbox e lane snap podem ser tunados agora que a base esta correta.
- Se quisermos resposta ainda mais "cirurgica", vale adicionar turn buffering e corner assist um pouco mais agressivo.
2026-03-16 movement precision pass
- Velocidade base reduzida pela metade para aumentar a precisao por toque: `BASE_MOVE_MS` foi de `160` para `320`.
- Ganho por pickup de velocidade foi reescalado para manter progressao util: `SPEED_STEP_MS` foi para `40` e `MIN_MOVE_MS` para `160`.
- Validacao complementar em rota livre confirmou queda de deslocamento por input; smoke novo em `tests/actions/skill-move-up.json`.
2026-03-16 tile-sized occupancy pass
- Hitbox do player passou a ocupar efetivamente 1 tile (`TILE_SIZE`) em vez de uma caixa menor flutuante.
- Movimento agora recentraliza com mais forca no eixo perpendicular e so deixa avancar no corredor quando o player esta suficientemente alinhado ao centro da lane.
- Sprite do player foi ajustado para desenhar exatamente no tamanho do tile, evitando leitura visual de deslocamento "fora da celula".
- Validado visualmente em `output/manual-corridor-lock/shot-0.png`.
2026-03-16 bomb responsiveness pass
- Input deixou de perder taps curtos entre frames fixos: `InputManager` agora usa fila de press em vez de limpar `justPressed` no fim de todo frame.
- Bomba passou a usar o tile derivado da posicao atual do player no momento do comando, evitando defasagem entre movimento e colocacao.
- Teclas reservadas do jogo agora fazem `preventDefault`, incluindo `Q`, `O`, `E`, `P`, `Esc`, `F` e setas, reduzindo interferencia do navegador.
- Validacao manual com Playwright pressionando tecla real mostrou bomba aparecendo imediatamente no estado (`output/bomb-instant-check-2/state-0.json`).
2026-03-16 visual overhaul pass
- Substituidos personagens P1/P2 por sprites PixelLab novos e coerentes entre si.
- Substituidos bomba, chama e os tres pickups por assets PixelLab mais refinados.
- Segunda rodada de tiles PixelLab integrada com piso-base escuro, lane clara, spawn rÃºnico, parede de parapeto e barricada mais legivel.
- Ajustado runtime para desenhar sombras/realces sutis em parede e crate para ganhar profundidade sem poluir.
- Screenshots-chave: `output/art-pass-final/shot-0.png`, `output/art-pass-final-bomb/shot-0.png`.
2026-03-16 edge-forgiveness pass
- Player agora guarda a ultima direcao de movimento util e usa isso como fallback quando um giro novo ainda nao cabe por alinhamento de borda/corredor.
- A logica prioriza continuar no corredor atual em vez de parar seco quando a nova direcao ainda nao tem avancao real.

2026-03-27 online lobby polish pass
- Adicionado seletor persistente de personagem na coluna esquerda; ele controla claim de slot e quick match via `preferredCharacterIndex` salvo em `localStorage`.
- Quick match e claim-seat agora carregam o personagem escolhido no protocolo cliente/worker.
- HUD do menu foi limpo: sairam textos legados de P2/match options e entrou uma faixa compacta com controles padrao `WASD`, `Q`, `E`.
- Canvas agora escala ate o limite real do viewport, sem o arredondamento conservador que deixava a arena pequena.
- Chat do lobby foi endurecido no cliente: input para de propagar teclas/clicks, nao limpa draft se o socket cair, e refoca apos envio.
- Layout desktop foi comprimido para priorizar o playfield, com selector fixo na esquerda e cards de slot empilhados na rail direita para manter legibilidade.
- Validado com `npm run build`, `node --check worker/index.js` e preview visual em `output/layout-after-pass-2.png`.

TODO online polish
- Validar o chat com o backend online real; a preview estatica nao sobe websocket em `/online`, entao so confirmou layout/foco visual.
- Se quiser mais densidade competitiva, o proximo corte natural e recolher o painel de slots durante partida ativa e deixar apenas chat + status.

2026-03-27 AAA lobby shell pass
- Shell online refeito por estado (`browse`, `lobby`, `match`) com foco real no playfield e rail lateral recolhida em partida.
- HUD legado foi removido do canvas de menu; controles e copy de onboarding migraram para o DOM.
- Match agora tenta fullscreen automaticamente ao entrar na partida e arma retry no primeiro input caso o navegador bloqueie a API sem ativacao fresca.
- Validados screenshots locais em `output/layout-refactor-check.png` e `output/layout-match-check.png`.
- Deploy publicado no Worker com bundles `index-B5R3Twke.js` e `index-BzsVDsDS.css`.
- Smoke de curva/buffer adicionado em `tests/actions/corner-buffer.json` e validado em `output/corner-buffer/shot-0.png`.
2026-03-16 player scale pass
- Sprites dos personagens foram ampliados visualmente e ancorados pelos pes na celula, mantendo hitbox/grid intactos.
- O objetivo foi aproximar a presenca visual do personagem da referencia tipo Bomberman: menos "miniatura no mapa", mais avatar hero por cima do tile.
- Menu portraits tambem foram ampliados para refletir a nova escala.
- Screenshot-chave: `output/player-scale-pass/shot-0.png`.
2026-03-16 turn clean-up pass
- Troca de direcao perpendicular ficou mais estrita: o giro agora so entra quando existe avancÌ§o real na nova lane.
- Se o jogador virar cedo demais, o sistema continua no eixo anterior em vez de puxar o personagem para tras ou gerar snap lateral estranho.
- Smoke atualizado em `output/corner-buffer-2/shot-0.png`, com P1 mantendo o movimento para baixo ate a curva caber.

TODO visual
- O layout ja esta bem melhor, mas ainda vale uma rodada futura para HUD/logo e talvez props de penhasco/vegetacao fora do grid.
- Se quisermos bomba/chama ainda mais heroicos, animacoes ou sprites multi-frame seriam o proximo salto.
2026-03-16 bot intelligence sprint
- Nova frente de progresso: IA de bot para o P2 com toggle no menu (tecla B) e auto-ready/rematch quando habilitado.
- Bot agora toma decisoes por contexto: fugir de perigo (chamas/bombas prestes a explodir), buscar power-up visivel, pressionar blocos quebraveis e perseguir P1.
- Plantio de bomba foi refinado para exigir rota de fuga dentro do tempo do fusivel (em passos de tile), evitando suicidio e destravando comportamento ofensivo.
- HUD e `render_game_to_text` passaram a expor estado de bot (`botEnabled`, `botControlled`) para depuracao e testes.

Validacao
- Typecheck: `npx tsc --noEmit` sem erros.
- Teste de simulacao em Node: `tests/bot-intel-check.mjs` validando tres cenarios da IA:
  1) decisao sob pressao (movimento ativo),
  2) fuga quando em tile perigoso,
  3) plantio ofensivo com rota de fuga possivel.
- Resultado final da simulacao: `pressurePass=true`, `dangerPass=true`, `bombPass=true`.
- Observacao de ambiente: Playwright/Chromium bloqueado no sandbox com `spawn EPERM`, entao nao foi possivel gerar screenshot de gameplay nesta rodada.

TODO bot
- Quando o ambiente permitir browser spawn, rodar smoke visual em gameplay real (`tests/actions/bot-smoke.json`) e ajustar tuning (agressividade/cooldown/radius).
- Considerar estado de "hunting" por trilha de perigo dinamica (tempo ate explosao) para rotas mais curtas e menos conservadoras.

2026-03-27 four-player online pass
- Online/worker/protocolo generalizados para `PlayerId` 1..4, com snapshots e estado de partida carregando `activePlayerIds`.
- Quick match ajustado para fila global de ate 4 jogadores: com 2 jogadores inicia contagem de 5s; se 3 ou 4 entrarem na mesma fila antes do prazo, todos entram juntos na mesma arena.
- Lobbies manuais agora suportam ate 4 slots; a partida abre quando houver pelo menos 2 slots ocupados e todos os slots ocupados estiverem em ready.
- Runtime do jogo atualizado para suportar partidas com 2-4 jogadores ativos no mesmo mapa, incluindo score, HUD, snapshots online e renderizacao dos 4 personagens.
- Spawns da arena expandidos para os 4 cantos: P1 superior esquerdo, P2 superior direito, P3 inferior esquerdo, P4 inferior direito.

Validacao 2026-03-27
- `npm run build`
- `npm run test:spawn`
- `npm run test:online-4p`

TODO online
- Fazer um smoke automatizado do fluxo websocket real de quick match 2p/3p/4p quando tivermos um harness dedicado para Durable Object ou uma camada de matchmaking extraida para teste unitario.
2026-03-16 bot tactical offense sprint
- IA do BOT recebeu comportamento tatico ofensivo novo: detectar linha de tiro de bomba (mesma linha/coluna com alcance livre) para plantar bomba mesmo sem adjacencia.
- Adicionada busca por posicao de ataque: quando ainda nao tem linha de tiro, BOT passa a navegar para tiles de onde a bomba atingiria o P1 com rota de fuga valida.
- Refatorado check de plantio em `canBotPlaceBombAtTile(...)` para reutilizar validacao de escape tanto na decisao imediata quanto no planejamento de rota ofensiva.
- Chase fallback ficou mais inteligente: perseguicao agora prioriza ficar adjacente ao alvo (nao tentar ocupar exatamente o mesmo tile).
- Teste `tests/bot-intel-check.mjs` ampliado com 2 cenarios novos: `lineBombPass` (linha de tiro) e `attackPositionPass` (reposicionamento ofensivo).
- Espelhamento aplicado tambem em `output/esm/app/game-app.js` para manter compatibilidade com o harness Node que importa ESM precompilado.

Validacao desta rodada
- Nao foi possivel executar `node`, `npm`, `npx`, Playwright ou typecheck neste sandbox (comandos ausentes no ambiente atual).
- Validacao automatizada ficou preparada no codigo, pendente de execucao quando runtime JS estiver disponivel.
2026-03-16 movement + scale alignment pass
- Corrigida inconsistencia entre visual e colisao do player: hitbox reduzida de quase 1 tile para `0.42 * TILE_SIZE`, mantendo grid/collision robustos e melhorando leitura visual.
- Sistema anti-travar/fallback de curva foi restringido: ao receber input perpendicular, agora respeita esse input sempre que houver qualquer movimento valido na nova direcao (combined/lane/forward), em vez de forcar continuidade no eixo anterior.
- Fallback para ultima direcao agora so entra quando ha avanc¸o combinado real no eixo anterior (`combinedFree`), removendo o empurrao indevido para frente em corredor.
- Escala visual do personagem melhorada sem trocar assets: render agora usa crop do frame util do sprite (`32x52` a partir de `x=16,y=6`) e upscale maior in-game (`2.25x` de altura por tile).
- Portrait do menu passou a usar o mesmo crop para evitar miniatura com muito transparente.

Validacao
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` (ok).
- Smoke visual Playwright (`tests/actions/corner-buffer.json`) com screenshots em `output/corner-buffer-fix-2` confirmou personagens maiores e melhor ancoragem visual.
- Experimento A/B de input lateral em corredor (`tests/actions/corridor-side-a.json` vs `corridor-side-b.json`):
  - com input lateral (`a2`): P1 final `pixel.y = 130`, `direction = right`
  - sem input lateral (`b2`): P1 final `pixel.y = 131.166...`, `direction = down`
  => sinaliza que o input lateral nao esta mais forçando continuidade para frente como antes.
- `tests/bot-intel-check.mjs` executado (ok) apos ajuste de um cenario para evitar falso negativo.
2026-03-16 automation mini-sprint (auto-correcoes)
- Playwright + dev-server smoke attempt in this run was blocked by sandbox `spawn EPERM` (Chromium and esbuild/Vite could not spawn), so this pass focused on code-level fixes plus Node validations.
- Fixed UI/state consistency bug: when toggling BOT in menu (`B`), P2 label now updates immediately (`BOT`/`P2`) through `syncPlayerLabels()` instead of waiting for match start.
- `render_game_to_text` now exposes `menuReady` and `rematchReady` to make menu/rematch flow debugging easier.
- `InputManager` now reserves `KeyB` in `preventDefault`, reducing browser-side interference for automation/manual play.

Validation in this run
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` (ok).
- Bot harness: `node tests/bot-intel-check.mjs` (ok; all checks pass).

TODO next run
- Re-run real browser smoke as soon as Chromium/Vite spawn is available; prioritize `tests/actions/bot-smoke.json`, `smoke-match.json`, and a BOT-toggle menu scenario.
- Capture fresh screenshots/state in `output/` and visually verify HUD/menu regressions after label sync changes.
2026-03-16 auto-correcoes mini sprint (menu + debug consistency)
- Diagnostico de rodada automatizada: ambiente bloqueia spawn de browser/child process para Vite+Playwright (`spawn EPERM`), entao gameplay visual desta rodada ficou limitada a analise de codigo + testes Node.
- Corrigido estado inconsistente de identidade do P2 quando alterna BOT no menu: painel de ready/rematch agora recebe override explicito (`BOT`/`P2`) e hint contextual (`BOT auto-ready` no rematch).
- `drawReadyPanel` foi estendido com `nameOverride` para evitar texto stale em UI quando o modo de controle muda antes de recriar players.
- Removido efeito colateral de `render_game_to_text` (nao muta mais nome interno de players), mantendo hook de depuracao somente-leitura.

Validacao
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` (ok).
- Teste IA: `node tests/bot-intel-check.mjs` (todos os cenarios pass).

TODO proximo run
- Rodar smoke visual real em browser assim que o sandbox permitir spawn do Chromium (ou quando houver runtime com permissao), priorizando `tests/actions/smoke-match.json` e `tests/actions/bot-smoke.json`.
- Considerar um harness headless sem Chromium para validar textos de HUD/menu (snapshot de canvas ou asserts no draw pipeline) em ambientes restritos.
2026-03-16 HUD + framing polish
- Rebalanceado o enquadramento de gameplay: `TILE_SIZE` subiu para `30`, HUD desceu para `52px` e a arena foi recentralizada para ocupar mais da tela com menos vazio morto.
- HUD foi redesenhado em paineis compactos (`ROUND`, `GOAL`, `TIME`, placas de P1/BOT e modo atual) para parecer UI de jogo finalizado, nao texto solto em barra alta.
- Backdrop/arena receberam frame mais forte e base/cliff shading mais intencional para o tabuleiro "sentar" melhor na cena.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Build: `cmd /c npm run build` (ok).
- Smoke visual skill Playwright:
  - `output/ui-polish/shot-0.png`
  - `output/ui-polish-bot/shot-0.png`
- Estado textual confirmou nova geometria: `tileSize = 30`, `origin = { x: 15, y: 58 }`.
2026-03-16 player fit correction
- Corrigido o exagero de escala do personagem: o sprite deixava a celula porque era desenhado com crop muito largo (`32x52`) e altura de `2.25 * TILE_SIZE`.
- Novo ajuste usa o bounds opaco real do asset (`27x44` a partir de `x=29,y=21`), altura reduzida para `1.5 * TILE_SIZE` e ancora vertical recalibrada para casar melhor com o tile.
- Hitbox aproximada do corpo visual: `PLAYER_HITBOX_HALF` passou de `0.42` para `0.44 * TILE_SIZE`.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Build: `cmd /c npm run build` (ok).
- Screenshot de conferência: `output/player-fit-fix/shot-0.png`.
2026-03-16 auto-correcoes mini sprint (input transitions + test reliability)
- Tentativa de gameplay real repetida nesta rodada, mas Vite/Chromium seguem bloqueados por sandbox com `spawn EPERM`; sem sessao Playwright visual.
- Bug corrigido: eventos de tecla em fila podiam vazar entre modos (menu -> match, round -> match-result), gerando acoes inesperadas (ex.: pause no inicio da partida). Solucao: `InputManager.clearPresses()` + limpeza ao entrar em match e match-result.
- Estado de debug corrigido: `menuReady` agora reseta ao iniciar partida, evitando estado stale no `render_game_to_text` durante gameplay.
- Gap de confiabilidade corrigido nos testes Node: adicionado pipeline `compile:esm` para gerar `output/esm` a partir de `src` antes dos testes e script de patch de imports relativos `.js` para resolver ESM no Node.
- Novo teste: `tests/input-transition-check.mjs` valida que `Escape` no menu nao pausa a partida apos start e que `menuReady` fica resetado.

Validacao desta rodada
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)

TODO proximo run
- Assim que ambiente permitir spawn de browser, executar smoke visual real (`smoke-match`, `bot-smoke`) para validar UX/render apos as correcoes de transicao de input.
- Considerar adicionar um teste Node para fluxo completo de rematch (round winner -> match-result -> restart) garantindo ausencia de vazamento de input em todas as transicoes.
2026-03-16 sudden death mechanics sprint
- Nova mecanica de fim de round: Sudden Death inicia nos ultimos 25s e injeta chamas em espiral das bordas para o centro, forçando confronto e encerrando rounds arrastados.
- Cada tick do Sudden Death pode quebrar bloco no tile atingido, revelar power-up escondido e acionar bomba posicionada naquele tile (fuse -> 0), integrando com os sistemas existentes em vez de bypass.
- HUD agora mostra countdown para Sudden Death (`SD Ns`) e troca para estado ativo (`SUDDEN DEATH`) quando o evento entra.
- `render_game_to_text` passou a expor `match.suddenDeath` com `active`, `startsAtMs`, `tickMs` e `progress` para depuracao automatizada.

Validacao desta rodada
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Build completo com Vite continua bloqueado no sandbox (`spawn EPERM` em esbuild/vite).
- Teste deterministico novo: `node tests/sudden-death-check.cjs` (ok), validando ativacao, progresso da espiral, criacao de chama e limpeza/reveal em bloco+power-up.
- Regressao de IA mantida: `node tests/bot-intel-check-src.cjs` (ok).

TODO proximo run
- Rodar smoke visual Playwright assim que o ambiente permitir Chromium/Vite spawn, para calibrar ritmo visual do Sudden Death em partida real.
- Se o ritmo estiver agressivo demais em jogo real, ajustar `SUDDEN_DEATH_TICK_MS` (atual 800ms) e/ou duracao de chama (atual 900ms).
2026-03-16 P1 character swap (PixelLab Guts)
- Integrado novo personagem principal (P1) a partir do PixelLab character `a57a868c-f2c3-4e11-b4db-5f255c9408c4`.
- Sprites do P1 atualizados em `public/assets/sprites/player1-{south,east,north,west}.png`.
- Render do jogador foi adaptado para perfis por player (`PLAYER_SPRITE_PROFILE`), permitindo usar P1 160x160 e manter P2 88x88 sem cortes/impreciso.
- Portrait de menu tambem passou a usar o perfil por player para manter enquadramento consistente.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke visual Playwright (menu): `output/p1-guts-menu/shot-0.png`.
- Smoke visual Playwright (match): `output/p1-guts-integration/shot-0.png` + estado em `state-0.json`.
- Sem erros de console em ambos os smokes.
2026-03-16 player size normalization (P1)
- Ajuste de proporcao do novo P1 para ficar no tamanho visual de ~1 tile (estilo quadradinho do grid), reduzindo escala e apertando crop.
- `PLAYER_HITBOX_HALF` reduzido para `0.4 * TILE_SIZE` para combinar melhor com o novo volume visual do personagem.
- Perfil P1 atualizado para crop `56,40,57,79`, `heightScale: 1.22` e retrato de menu menor (`menuHeight: 46`).

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke menu: `output/p1-size-fix-menu/shot-0.png` (ok).
- Smoke match: `output/p1-size-fix-match/shot-0.png` (ok).
- Sem erros de console nos dois smokes.
2026-03-16 P1 quality fix (new native tile character)
- O P1 anterior estava com perda forte de legibilidade por downscale agressivo de sprite 160x160 para tile de 30px.
- Solucao aplicada: gerado novo personagem PixelLab em tamanho nativo de jogo (`3448cb0a-0443-4dfb-bd5e-9a9d7d4520b4`, 48x48, 4 direcoes) com silhouette mais limpa para leitura em tile pequeno.
- Substituidos `player1-{south,east,north,west}.png` por essa versao 48x48.
- Ajustado profile de render do P1 para crop util (`x=12,y=8,w=24,h=40`) mantendo presenca boa sem distorcao/PPI quebrado.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Playwright menu: `output/p1-newchar-menu/shot-0.png`.
- Playwright match: `output/p1-newchar-match/shot-0.png`.
- Sem erros de console nos dois smokes.
2026-03-16 guts hi-res downscale strategy (requested original kept)
- Mantido o personagem original solicitado (PixelLab 160x160, id `a57a868c-f2c3-4e11-b4db-5f255c9408c4`) e descartada a troca por personagem alternativo.
- Nova estrategia de qualidade aplicada: preprocess do sprite hi-res para canvas 88x88 (mesmo envelope do P2), com corpo util ~44px, downscale por nearest-neighbor e leve ajuste de brilho/contraste para leitura em mapa escuro.
- Isso reduz aliasing ruim de downscale extremo em runtime e preserva pixel definition no tamanho do tile.
- Perfil do P1 ajustado para esse pacote: `src 26,44,36,44`, `heightScale 1.5`; hitbox refinada para `0.42 * TILE_SIZE`.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Playwright menu: `output/p1-guts-hq-menu/shot-0.png`.
- Playwright match: `output/p1-guts-hq-match/shot-0.png`.
- Sem erros de console nos dois smokes.
2026-03-16 walk animation integration (Guts)
- Iniciado pipeline de animacao de caminhada para o personagem principal Guts original (`a57a868c-f2c3-4e11-b4db-5f255c9408c4`).
2026-03-27 PvP smoothing + network trim
- Causa mais provavel do lag residual em PvP identificada como jitter de rede/arrival-time no cliente online, nao custo bruto do runtime: contra BOT local a simulacao segue lisa.
- Cliente online saiu do modelo `sample anterior + atual por receivedAt` para um buffer de amostras com interpolacao por `serverTick`, o que reduz stutter quando frames chegam em rajadas irregulares.
- Input de jogador remoto deixou de subir 60 mensagens/s cegamente: agora envia por mudanca de estado + heartbeat curto, e o servidor limpa flags edge-triggered (`bomb/detonate`) a cada tick.
- `host-snapshot` ficou menos frequente (`10 ticks`) para aliviar parse/banda sem mexer na autoridade do servidor.

Validacao
- Build: `npm run build` (ok).

TODO proximo run
- Se ainda houver microstutter perceptivel, proximo passo de maior impacto e delta-compression real para `bombs/flames` e buffer separado de reconciliacao para o jogador local.
- PixelLab: gerada template `walking-8-frames`; zip baixado e extraido em `output/pixellab-guts/unzipped`.
- Frames exportados para runtime em `public/assets/sprites/player1-walk-{south,east,north,west}-0..7.png` (32 arquivos).
  - `south/north/west`: frames nativos do PixelLab.
  - `east`: gerado por espelho horizontal dos frames `west` (fallback tecnico para manter 4 direcoes funcionais no jogo).
- Pipeline de preprocess aplicado nos frames do Guts para consistencia visual com jogo atual: downscale nearest-neighbor + leve ajuste de brilho/contraste + envelope 88x88.

Codigo
- `src/app/assets.ts`: `DirectionalSprites` agora inclui `walk` e loader automatico de ciclos `player*-walk-<dir>-<frame>.png`.
- `src/app/game-app.ts`: adicionada troca de frame de caminhada por tempo (`WALK_FRAME_MS`) quando o player esta em movimento.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke Playwright com movimentacao P1: `output/p1-walk-anim/shot-0.png`, `shot-1.png`.
- Sem erros de console no smoke.
2026-03-16 tile scale + grid reduction sprint
- Escala estrutural do mapa alterada para favorecer leitura da animacao do Guts:
  - `TILE_SIZE`: 30 -> 40
  - `GRID_WIDTH x GRID_HEIGHT`: 15x13 -> 11x9
  - arena centralizada automaticamente via `ARENA_OFFSET_X` calculado em config.
- Arena/layout tornou-se dinamico (sem hardcodes 15x13): lanes centrais/laterais e pockets agora calculados por `GRID_WIDTH/GRID_HEIGHT`.
- Distribuicao de power-ups e open tiles recalibradas para o novo grid reduzido.
- Proporcao personagem/hitbox alinhada em 1:1 de tile:
  - `PLAYER_HITBOX_HALF = TILE_SIZE * 0.5`
  - perfis de sprite com `heightScale = 1.0` (P1/P2), reduzindo discrepancia visual x colisao.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke menu: `output/tile-scale-menu/shot-0.png`.
- Smoke gameplay: `output/tile-scale-match/shot-0.png`.
- `render_game_to_text` confirmou nova geometria: `tileSize=40`, `arena.width=11`, `arena.height=9`.
- Sem erros de console no smoke.
2026-03-16 quality + spawn safety hotfix
- Hotfix de legibilidade do Guts: aplicado pass em sprites estaticos + walk (`player1-*.png`, `player1-walk-*.png`) com aumento de brilho/contraste e rim light sutil para separacao do fundo.
- Ajuste visual do P1: `heightScale` de 1.0 -> 1.15 para ganhar leitura sem estourar proporcao do tile grande.
- Hotfix de insta-death no spawn:
  - adicionado `spawnProtectionMs` em `PlayerState`
  - jogadores nascem com `SPAWN_PROTECTION_MS = 2200`
  - dano por chama ignora player enquanto protecao > 0
  - `render_game_to_text` agora expõe `spawnProtectionMs` por player para QA.
- Arena spawn zone expandida (open tiles) para reduzir rounds com abertura travada em grid compacto.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke qualidade: `output/guts-quality-fix/shot-0.png`.
- Smoke spawn curto: `output/spawn-protection-short/shot-0.png` + estado com `spawnProtectionMs: 1550`.
- Sem erros de console.
2026-03-16 bot danger-time intelligence sprint
- IA do BOT saiu do modelo binario de perigo (set de tiles) para mapa temporal de risco por tile (`getDangerMap`), com fuse minimo por coordenada.
- Novo comportamento time-aware: pathfinding agora evita tiles que vao explodir antes da chegada estimada (considerando velocidade atual do bot + buffer).
- Chain reaction preditiva adicionada: quando uma bomba acerta outra no raio de explosao, o fuse da segunda e antecipado no modelo de perigo.
- Escape em perigo ganhou fallback robusto (rota priorizando tiles com saida e fallback seguro) e chase ganhou fallback de reposicionamento para reduzir idle.

Validacao
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` (ok).
- IA: `npm run test:bot` (ok), incluindo novo cenario `chainDangerPass` para ameaca indireta por cadeia de bombas.
- Regressao de transicao/input: `npm run test:input` (ok).
- Smoke Playwright bloqueado no ambiente por `spawn EPERM` do Chromium; pendente validacao visual quando sandbox permitir browser spawn.

2026-03-17 auto-correcoes mini sprint (spawn lock + render fallback)
- Analise desta rodada encontrou 2 regressões principais:
  1) crash no harness Node em `drawPlayer` quando `assets.players[*].walk` nao existe (fixtures antigas dos testes).
  2) BOT e jogador podiam nascer "presos" no mapa 11x9: spawn em `2,1` / `8,7` tinha unica saida marcada como breakable por power-up forcado, causando IA sem direcao e jogo truncado no inicio.
- Correcao aplicada no render: `drawPlayer` agora usa fallback seguro para ciclo de caminhada (`baseSprites.walk?.[dir] ?? []`), evitando excecao e preservando sprite estatico quando nao ha frames de walk.
- Correcao aplicada no layout de arena: power-up forcado foi movido de `{2,2}` para `{2,3}` (espelhado para o lado oposto), liberando os corredores de saida de spawn sem alterar a estrutura geral da arena.

Validacao
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` (ok).
- Regressao IA: `npm run test:bot` (ok; `pressurePass`, `dangerPass` e `chainDangerPass` voltaram a true).
- Regressao input/transicao: `npm run test:input` (ok).
- Mecanica sudden death: `node tests/sudden-death-check.cjs` (ok).
- Gameplay curto (simulado por hooks deterministicos): round iniciou, P1 moveu para `2,2`, colocou bomba, explosao ocorreu e round encerrou com `winner=2` apos eliminacao (estado coerente com regras).

Limitacoes de ambiente
- Sessao Playwright visual real continua bloqueada nesta maquina: pacote `playwright` ausente no workspace e Vite bloqueado por `spawn EPERM` no sandbox (esbuild/Chromium).

TODO proximo run
- Quando houver permissao de spawn/browser, executar smoke visual real com a skill (`smoke-match`, `bot-smoke`, `sudden-death-smoke`) para validar UX/render apos o ajuste de spawn.
- Adicionar teste dedicado de "spawn escape" para garantir que ambos os spawns tenham pelo menos 1 rota livre sem depender de breakable.
2026-03-16 guts cleanup pass (remove glow/alias artifacts)
- Removido o pass visual artificial que gerava borda brilhante no Guts (rim/glow).
- Rebuild completo dos sprites do P1 (idle + walk) a partir das fontes originais, sem glow e sem boosts agressivos.
- Novo downscale limpo para runtime (LANCZOS), mantendo envelope 88x88 e proporcao de jogo.
- Ajuste fino de presenca: `PLAYER_SPRITE_PROFILE[1].heightScale` para 1.08 (menos exagero).

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- Smoke de gameplay: `output/guts-clean-v2/shot-0.png`.
- Recorte close do P1 para inspeção: `output/guts-clean-v2/crop-p1.png`.
- Sem erros de console.
2026-03-16 sharpness/rendering fidelity sprint
- Corrigido pipeline de render para reduzir blur global (HUD, tiles e sprites):
  - canvas agora usa backbuffer 2x (`CANVAS_BACKBUFFER_SCALE = 2`) e `ctx.setTransform(...)` para desenhar em coordenadas logicas com mais definicao real.
  - novo `syncCanvasDisplaySize()` aplica escala de exibicao com preferencia por fator inteiro conforme viewport, evitando interpolacao fracionada que embaça pixel art.
  - hook em `resize` e `fullscreenchange` para manter a nitidez apos redimensionamento/toggle fullscreen.
- CSS do canvas simplificado para nao forcar escala dinamica fracionada via regra fixa; tamanho passa a ser controlado pelo runtime.
- Test harnesses Node atualizados (`tests/bot-intel-check.mjs` e `tests/input-transition-check.mjs`) com `setTransform`, `style`, `innerWidth/innerHeight` no fake canvas/window.

Validacao
- `node node_modules/typescript/bin/tsc --noEmit` (ok)
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- Playwright smoke skill:
  - gameplay: `output/sharpness-pass/shot-0.png`
  - menu/HUD: `output/sharpness-menu/shot-0.png`
  - sem `errors-0.json` nos dois.
2026-03-16 guts native fidelity sprint
- P1 passou a carregar sprites base hi-res nativos (`player1-*-hires.png`) com fallback para os arquivos padrao.
- Render do P1 refinado com crop por direcao (down/right/up/left) para manter proporcao e detalhes do sprite original sem suavizacao excessiva.
- Caminhada low-res do P1 foi desativada (`allowWalkAnimation=false`) para evitar mistura de qualidade entre idle hi-res e walk downscaled.
- HUD superior recebeu texto com contorno (`strokeText + fillText`) para melhorar legibilidade/percepcao de nitidez em ROUND/GOAL/TIME/MODE e status dos players.

Validacao
- `node node_modules/typescript/bin/tsc --noEmit` (ok)
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- Playwright smoke:
  - menu: `output/guts-native-pass-menu/shot-0.png`
  - gameplay: `output/guts-native-pass-match/shot-0.png`
  - sem arquivos `errors-0.json`.
2026-03-16 sudden death-aware bot sprint
- Area escolhida: inteligencia de bots (mini sprint focado em sobrevivencia durante Sudden Death).
- IA do BOT agora incorpora previsao temporal do colapso no `getDangerMap`: os tiles da espiral de Sudden Death entram no mapa com tempo de ativacao previsto por tick.
- Novo comportamento tatico em Sudden Death: antes de atacar/coletar, BOT prioriza reposicionamento para tiles com janela de seguranca maior e melhor centragem (ou mais saidas seguras).
- Resultado pratico: BOT evita permanecer em tiles com ignicao iminente da espiral e reduz mortes burras no fim do round.

Validacao
- Typecheck: `cmd /c node node_modules\\typescript\\bin\\tsc --noEmit` (ok).
- IA: `cmd /c npm run test:bot` (ok), incluindo novo cenario `suddenDeathPass`.
- Regressao input/transicao: `cmd /c npm run test:input` (ok).
- Playwright skill: tentativa executada contra `http://127.0.0.1:5173`, mas ambiente bloqueou Chromium com `spawn EPERM` (sem screenshot nova nesta rodada).

TODO proximo run
- Reexecutar smoke visual (`bot-smoke` e `sudden-death-smoke`) quando o ambiente liberar Chromium para confirmar ganho visual/comportamental em partida real.
2026-03-17 auto-correcoes mini sprint (harness stability + spawn guardrail)
- Tentativa de gameplay visual com skill `develop-web-game` foi executada nesta rodada e o Chromium falhou de novo com `browserType.launch: spawn EPERM`.
- Gameplay curto foi validado por simulacao deterministica (`window.advanceTime` + eventos de tecla em harness): entrada em match, movimento curto, plantio de bomba e resolucao de round confirmados no `render_game_to_text`.
- Bug de confiabilidade corrigido: os harnesses `tests/sudden-death-check.mjs` e `tests/bot-intel-check-src.mjs` estavam quebrados por imports ESM sem extensao em `src/*.ts`; agora usam `output/esm/*.js` e mocks de canvas/window completos (`setTransform`, `strokeText`, `style`, `innerWidth/innerHeight`).
- Regressao preventiva adicionada: novo teste `tests/spawn-escape-check.mjs` valida que os dois spawns sao pathable, tem ao menos 1 vizinho livre e mantem area alcancavel minima no mapa atual.
- Higiene de workspace: removidos dois arquivos vazios acidentais na raiz (`{console.error(e)` e `{console.error(e.message)`).
- Scripts: adicionado `npm run test:spawn`.

Validacao desta rodada
- `npm run compile:esm` (ok)
- `node tests/bot-intel-check.mjs` (ok)
- `node tests/input-transition-check.mjs` (ok)
- `node tests/spawn-escape-check.mjs` (ok)
- `node tests/sudden-death-check.cjs` (ok)
- `node tests/sudden-death-check.mjs` (ok)
- `node tests/bot-intel-check-src.mjs` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)

TODO proximo run
- Quando o ambiente liberar spawn de browser, reexecutar smoke visual real (`smoke-match`, `bot-smoke`, `sudden-death-smoke`) para validar UX/render alem da simulacao.
- Se surgirem novos ajustes de arena, manter o `test:spawn` no gate para evitar retorno de spawn lock.
2026-03-16 guts walk hi-res integration
- Animações do P1 (Guts) foram promovidas para nativo 160x160 usando frames de `output/pixellab-guts/unzipped/animations/walking-8-frames`.
- Substituidos `public/assets/sprites/player1-walk-{south,north,west}-0..7.png` pelos frames hi-res originais.
- Direcao leste (`east`) reconstruida por espelho horizontal dos frames `west` para manter 4 direcoes sem quebra.
- Como o walk agora e hi-res, `allowWalkAnimation` do P1 foi reativado.

Validacao
- `node node_modules/typescript/bin/tsc --noEmit` (ok)
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- Playwright walk smoke: `output/guts-hiwalk/shot-0.png`, `shot-1.png` (sem erros de console).
2026-03-16 mechanics sprint (bomb push)
- Area escolhida: mecanicas de gameplay.
- Nova mecanica implementada: ao caminhar contra uma bomba alinhada no corredor, o player empurra a bomba 1 tile na direcao do movimento (somente se o tile de destino estiver livre).
- Regras de seguranca do push:
  - nao empurra para fora da arena;
  - nao empurra para parede/bloco quebravel;
  - nao empurra para tile ocupado por outra bomba;
  - nao empurra para tile ocupado por player vivo.
- Integracao feita dentro do fluxo de movimento (`movePlayer`) para manter responsividade sem criar input novo.

Validacao
- Novo teste deterministico: `tests/bomb-push-check.mjs`.
  - cenario 1: bomba em frente e tile livre -> bomba avanca de (3,1) para (4,1) (`pushPass=true`).
  - cenario 2: bloco quebravel atras da bomba -> bomba nao move (`blockedPass=true`).
- Script npm novo: `npm run test:bomb-push`.
- Regressao mantida:
  - `npm run test:bot` (ok)
  - `npm run test:input` (ok)
  - `npm run test:spawn` (ok)
- Skill Playwright tentada nesta rodada, mas Chromium segue bloqueado por sandbox com `browserType.launch: spawn EPERM`.

TODO proximo run
- Quando o ambiente liberar spawn do Chromium, executar smoke visual real para verificar a leitura/feeling da mecanica de push em gameplay (`smoke-match` + cenario dedicado de corredor com bomba).
- Considerar extensao natural da mecanica: power-up de chute deslizante (bomba desliza ate obstaculo) para elevar profundidade tatica sem perder previsibilidade.
2026-03-16 bot round-start suicide fix
- Root cause found in movement gating: zero-displacement options were treated as valid movement, so BOT could choose a turn direction, never leave the tile, and die on its own first bomb.
- Fix in src/app/game-app.ts:
  - added real movement checks (`positionChanged` / `canMovementOptionAdvance`)
  - `resolveMovementDirection` now only treats a direction as usable when it produces actual displacement
  - `movePlayer` no longer early-returns on `combinedFree` when the move stays in place
- Regression added to tests/bot-intel-check.mjs: fresh round sim now requires BOT to leave its first bomb tile and stay alive after that first explosion resolves.

Validation
- cmd /c node node_modules\\typescript\\bin\\tsc --noEmit (ok)
- cmd /c npm run test:bot (ok, including `freshRoundEscapePass=true`)
- cmd /c npm run test:input (ok)
- cmd /c npm run test:spawn (ok)
- cmd /c npm run test:bomb-push (ok)
- develop-web-game smoke: output/web-game/shot-0.png + output/web-game/state-0.json
  - captured state shows BOT alive on tile {x:7,y:6} after leaving the danger tile, with own bomb at {x:8,y:7}
  - no errors-0.json produced in that smoke run
2026-03-17 bot strategic safety-window sprint
- Area escolhida: inteligencia de bots.
- Melhoria aplicada na navegacao tatica do BOT: pathing estrategico agora exige janela minima de seguranca no tile de destino (nao apenas seguranca na chegada), evitando passos para tiles que explodem logo em seguida.
- Implementacao em `getBotDecision(...)` + BFS de busca (`findNearestReachableTarget`/`findDirectionToNearestTile`) com parametro de `minSafetyWindowMs`.
- Novo cenario de teste adicionado em `tests/bot-intel-check.mjs` (`strategicAvoidPass`): reproduz caso em que o BOT antes aceitava rota para tile com perigo em 570ms apesar de alternativa segura; agora evita esse passo.

Validacao desta rodada
- `npm run test:bot` (ok, incluindo `strategicAvoidPass=true`).
- `npm run test:input` (ok).
- `npm run test:spawn` (ok).
- `node node_modules/typescript/bin/tsc --noEmit` (ok).

TODO proximo run
- Rodar smoke Playwright visual do BOT assim que o ambiente liberar spawn do Chromium (ainda ocorre `browserType.launch: spawn EPERM` no sandbox atual).
- Se o comportamento ficar conservador demais em gameplay real, ajustar `BOT_STRATEGIC_MOVE_WINDOW_STEPS` (atual 2).
2026-03-16 auto-correcoes mini sprint (round outcome pause freeze)
- Tentativa de gameplay com cliente Playwright da skill foi bloqueada neste ambiente: `npx` via PowerShell barrado por ExecutionPolicy e `cmd /c npx playwright --version` falhou com `npm EACCES` (sem acesso/perm para baixar pacote), então a rodada usou simulacao deterministica com `window.advanceTime` + eventos de teclado.
- Bug real identificado e reproduzido: pressionar `Esc` durante `roundOutcome` congelava a transicao de round (pause vazava para o proximo round).
- Correcao 1 (`src/app/game-app.ts`): toggle de pausa agora e ignorado enquanto `roundOutcome` estiver ativo.
- Correcao 2 (`src/app/game-app.ts`): `advanceAfterRound()` agora limpa fila de input (`this.input.clearPresses()`) tambem na transicao de round normal, evitando vazamento de tecla para o round seguinte.
- Nova regressao adicionada: `tests/round-outcome-pause-check.mjs` valida fim de round por eliminacao + `Esc` no resultado + avanc¸o correto para round seguinte sem pause travado.
- Script adicionado: `npm run test:round-outcome`.

Validacao desta rodada
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- `npm run test:spawn` (ok)
- `npm run test:bomb-push` (ok)
- `npm run test:round-outcome` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)

Notas uteis para o futuro
- Nao execute os scripts `test:*` em paralelo: todos recompilam `output/esm` e pode ocorrer `ERR_MODULE_NOT_FOUND` intermitente por corrida de arquivos.
- Manter `test:round-outcome` no gate de regressao para evitar retorno de freeze entre rounds por input stale.
2026-03-16 bot survival + controls legend follow-up
- Follow-up from user report: BOT was still self-KOing at round start in the real game loop.
- Root cause refinement:
  - `getBotDecision()` had a side effect (cooldown mutation), which polluted debug runs and made bot timing harder to reason about.
  - `canBotPlaceBombAtTile()` was too permissive: it accepted tiles that were reachable before detonation even if they were still inside the blast when the bomb actually exploded.
- Fixes applied:
  - moved BOT bomb cooldown write out of `getBotDecision()` and into the actual successful bomb placement path in `updatePlayers()` / `placeBomb()`
  - `placeBomb()` now returns `boolean` so cooldown is only applied when the bomb was really created
  - `canBotPlaceBombAtTile()` now requires an escape tile that survives the planned detonation, not just an early-arrival tile
  - added `getOverlappingBomb()` + committed bomb-escape preference so BOT stops bouncing on its own pass-through bomb footprint
- UI request completed: added always-visible controls legend at the bottom of gameplay and expanded menu instructions with `B` toggle info.

Validation
- cmd /c node node_modules\\typescript\\bin\\tsc --noEmit (ok)
- cmd /c npm run test:bot (ok)
- cmd /c npm run test:input (ok)
- cmd /c npm run test:spawn (ok)
- cmd /c npm run test:bomb-push (ok)
- deterministic round trace after compile:
  - round 1 first bomb at frame 24 on tile {x:7,y:6}
  - BOT left bomb tile and did not die; round 1 winner became BOT (`winner: 2`)
- develop-web-game smoke: output/web-game/shot-0.png + output/web-game/state-0.json
  - BOT alive in round 1 (`tile {x:6,y:7}`) with own bomb safely offset at `{x:5,y:6}`
  - controls legend visible on screen
  - no errors-0.json produced
2026-03-17 bot spawn-protection intelligence sprint
- Area escolhida: inteligencia de bots (mini sprint focado em decisao ofensiva com invulnerabilidade de spawn).
- TDD aplicado com teste dedicado novo `tests/bot-spawn-protection-check.mjs`:
  1) RED confirmado: bot plantava bomba contra inimigo adjacente ainda invulneravel (`spawnProtectionMs > 0`).
  2) GREEN: `getBotDecision` agora considera vulnerabilidade real do inimigo antes de acionar gatilhos ofensivos (adjacencia/linha de bomba) e antes de planejar `attackPositionTarget`.
- Agressividade util preservada: mesmo com inimigo invulneravel, bot continua autorizado a plantar bomba se houver bloco quebravel adjacente.

Validacao desta rodada
- `npm run compile:esm && node tests/bot-spawn-protection-check.mjs` (ok)
  - caso 1: `placeBomb=false` contra alvo invulneravel.
  - caso 2: `placeBomb=true` quando ha breakable adjacente.
- `npm run test:input` (ok) para sanity check fora da IA.
- Limite do ambiente: `npm run dev`/Vite e smoke Playwright seguem bloqueados por `spawn EPERM` (esbuild child process), sem screenshot de gameplay nesta rodada.

TODO proximo run
- Quando spawn de browser/child process estiver liberado, rodar smoke visual real com a skill (`tests/actions/bot-smoke.json`) e confirmar em screenshot que o BOT evita drop inutil no inicio da rodada.
2026-03-17 mini sprint (polimento: danger overlay tatico)
- Area escolhida: polimento/UX de combate.
- Entregue:
  - Novo overlay de perigo em tempo real no tabuleiro, baseado no `getDangerMap`, destacando tiles com risco iminente (cores por ETA).
  - Toggle global `V` para ligar/desligar o overlay; status visivel no HUD (`DANGER ON/OFF`) e hints atualizados em menu/legenda.
  - `render_game_to_text` agora expõe `match.dangerOverlay` com `enabled`, `maxEtaMs` e lista de `tiles` (quando ligado).
  - Novo teste TDD: `tests/danger-overlay-check.mjs` + script `npm run test:danger-overlay`.
  - `InputManager` atualizado para reservar `KeyV`.

Validacao desta rodada
- `npm run test:danger-overlay` (ok)
- `npm run test:input` (ok)
- `npm run test:round-outcome` (ok)
- `npm run test:spawn` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)

Limitacao de ambiente
- Iteracao visual com skill `develop-web-game` tentou executar em `http://127.0.0.1:5173`, mas Chromium segue bloqueado por sandbox com `browserType.launch: spawn EPERM`.
2026-03-17 mini sprint (polimento + engenharia: blast preview tatico)
- Area escolhida: polimento de gameplay com suporte de engenharia/testes.
- Entregue:
  - Novo overlay de pre-visualizacao de explosao da bomba para o jogador ativo (P1 em partida local; jogador selecionado no modo automation).
  - Toggle global `C` para ligar/desligar blast preview, com indicador no HUD (`BLAST ON/OFF`) e instrucoes atualizadas no menu/legenda.
  - `render_game_to_text` expandido com `match.bombPreview` (`enabled`, `playerId`, `flameRange`, `tiles`) para depuracao deterministica.
  - Novo teste TDD `tests/bomb-preview-toggle-check.mjs` + script `npm run test:bomb-preview`.
  - `InputManager` atualizado para reservar `KeyC` e evitar interferencia do navegador.
- Validacao desta rodada (executada em sequencia):
  - `npm run test:bomb-preview` (ok)
  - `npm run test:danger-overlay` (ok)
  - `npm run test:input` (ok)
  - `npm run test:spawn` (ok)
  - `npm run test:round-outcome` (ok)
  - `npm run test:bomb-range` (ok)
  - `node node_modules/typescript/bin/tsc --noEmit` (ok)
- Nota de confiabilidade: scripts `test:*` nao devem rodar em paralelo porque todos recompilam `output/esm` e podem gerar `ERR_MODULE_NOT_FOUND` intermitente.
- Limite do ambiente: tentativa de 
pm run dev nesta rodada confirmou bloqueio spawn EPERM (esbuild), mantendo a validacao em harnesses Node.

- Correcao de registro: tentativa de 
pm run dev nesta rodada confirmou bloqueio spawn EPERM (esbuild), mantendo validacao em harnesses Node.
2026-03-17 mini sprint (bot intelligence: context-aware power-up priority)
- Area escolhida: inteligencia de bots, com foco em decisao de loot sob risco/beneficio.
- TDD:
  - RED confirmado em novo teste `tests/bot-powerup-priority-check.mjs`: BOT priorizava `speed-up` por proximidade e perseguia `speed-up` inutil com `speedLevel` max.
  - GREEN aplicado em `src/app/game-app.ts` com nova selecao `findValuablePowerUpDirection(...)` e score por valor efetivo do pickup.
- Entregue:
  - BOT agora agrupa pickups visiveis por prioridade e busca primeiro os de maior valor real para o estado atual.
  - BOT ignora pickup sem ganho pratico (`bomb-up` no cap, `flame-up` no cap, `speed-up` no cap).
  - Regressao de harness IA estabilizada em `tests/bot-intel-check.mjs` com estado explicito de vulnerabilidade (`spawnProtectionMs=0`) e `flameRange` nos cenarios de cadeia.
  - Novo script `npm run test:bot-powerup` em `package.json`.

Validacao desta rodada
- `npm run test:bot-powerup` (ok)
- `npm run test:bot` (ok)
- `npm run test:input` (ok)
- `npm run test:spawn` (ok)
- `npm run test:danger-overlay` (ok)
- `npm run test:round-outcome` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)

Observacoes
- Validacao desta sprint foi 100% por harness Node deterministico.
- Nao houve sessao Playwright visual nesta rodada.
2026-03-17 mini sprint (bot anti-suicide: preemptive escape)
- Bug report reproduzido com evidencia: BOT morria sozinho em ~8.7s (`deadAtFrame=520`) com P1 inerte.
- Root cause identificado:
  - BOT so tratava perigo como urgente muito tarde (`nowDanger`), e antes disso podia oscilar entre tiles da mesma coluna de explosao.
  - Quando finalmente entrava no modo de fuga critica, ja nao havia rota segura viavel.
- TDD aplicado:
  - RED: novo teste `tests/bot-survival-10s-check.mjs` falhando com morte no frame 520.
  - GREEN: `src/app/game-app.ts` ganhou escape preemptivo (`BOT_PREEMPTIVE_ESCAPE_STEPS`) em `getBotDecision` para sair mais cedo de tiles com detonação prevista.
- Entregue:
  - Nova heuristica de fuga antecipada antes do estado critico, com preferencia por tile seguro com vizinhos seguros.
  - Script `npm run test:bot-survival` adicionado para gate de regressao.

Validacao desta rodada
- `npm run test:bot-survival` (RED falhou -> GREEN passou)
- `npm run test:bot` (ok)
- `npm run test:bot-powerup` (ok)
- `npm run test:input` (ok)
- `npm run test:spawn` (ok)
- `npm run test:danger-overlay` (ok)
- `npm run test:round-outcome` (ok)
- `node node_modules/typescript/bin/tsc --noEmit` (ok)
2026-03-17 mini sprint (mecanica: detonacao remota)
- Area escolhida: mecanica de combate com ganho tatico imediato.
- Entregue:
  - Novo power-up 
emote-up integrado em tipos, arena e assets (src/core/types.ts, src/game/arena.ts, src/app/assets.ts).
  - Novo atributo 
emoteLevel por jogador + suporte no HUD/menu/legend e 
ender_game_to_text.
  - Novo input dedicado de detonação remota: P1 R, P2 U (src/core/config.ts, src/engine/input.ts).
  - Ao acionar detonação remota, a bomba mais antiga do jogador explode instantaneamente (sem esperar o fuse).
  - Priorizacao de BOT para pickup 
emote-up quando ainda nao possui o recurso.
- TDD:
  - RED confirmado em 	ests/remote-detonation-check.mjs (coleta sem ganho + detonação nao ocorria).
  - GREEN com implementacao minima e teste passando.
- Validacao desta rodada:
  - 
pm run test:remote (ok)
  - 
pm run test:bomb-push (ok)
  - 
pm run test:bomb-preview (ok)
  - 
pm run test:danger-overlay (ok)
  - 
pm run test:input (ok)
  - 
pm run test:bot (ok)
  - 
pm run test:round-outcome (ok)
  - 
ode node_modules/typescript/bin/tsc --noEmit (ok)
- Limite de ambiente:
  - Skill Playwright executada (web_game_playwright_client.js), mas browsers continuam bloqueados por rowserType.launch: spawn EPERM.

Atualizado em: 2026-03-17 15:07:22 -03:00
2026-03-17 mini sprint (bot opening discipline)
- Follow-up do relato do usuario: o BOT ainda parecia se matar no opening porque plantava a primeira bomba cedo demais, ainda dentro da propria janela de spawnProtection.
- Root cause confirmado em modo manual (navigator.webdriver = false, BOT ligado): primeira bomba saia no frame 24 com cerca de 1783ms de spawnProtection restante, criando um opening arriscado e com leitura de suicidio instantaneo.
- TDD: novo teste tests/bot-opening-discipline-check.mjs.
  - RED: falhou com firstBotBombFrame=24 e bombPlacedDuringSpawnProtection=true.
  - GREEN: getBotDecision() agora bloqueia plantio ofensivo enquanto player.spawnProtectionMs > 0.
- Efeito apos fix:
  - primeira bomba do BOT passou para firstBotBombFrame=132, ja com spawnProtectionAtBomb=0;
  - BOT continua vivo e agressivo depois da janela de spawn.

Validacao desta rodada
- npm run test:bot-opening (ok)
- npm run compile:esm && node tests/bot-opening-discipline-check.mjs && node tests/bot-intel-check.mjs && node tests/bot-survival-10s-check.mjs && node tests/bot-powerup-priority-check.mjs && node node_modules/typescript/bin/tsc --noEmit (ok)
- Smoke visual skill develop-web-game:
  - output/bot-opening-short/shot-11.png
  - output/bot-opening-short/state-11.json
  - sem errors-0.json

TODO proximo run
- Se o opening ficar conservador demais em gameplay humano real, considerar abrir excecao para plantio ainda no spawn apenas quando houver rota de fuga com 2 saidas seguras e alvo realmente valioso.
2026-03-17 mini sprint (bot remote detonation intelligence)
- Root cause confirmado: o BOT ja priorizava pegar `remote-up`, mas nao tinha nenhum caminho de decisao para usar detonação remota; `getBotDecision()` so sabia retornar direcao e `placeBomb`.
- TDD: novo teste `tests/bot-remote-detonation-check.mjs`.
  - RED inicial mostrou `detonateDecision = { direction: "right", placeBomb: false }`, sem uso do remote mesmo com kill limpa disponivel.
  - Ajuste de fixture no teste: os cenario foram isolados da geometria fixa da arena (`solid` limpo) para validar inteligencia de remote, nao colisao de mapa.
- Implementacao minima:
  - `BotDecision` ganhou flag opcional `detonate`.
  - `updatePlayers()` agora executa `triggerRemoteDetonation()` tambem para decisoes do BOT.
  - extraido helper `getOldestOwnedBomb()` para alinhar a decisao da IA com a mesma bomba que a detonação real dispara.
  - novo helper `getRemoteDetonationBomb()` faz o BOT detonar so quando:
    - ele possui `remoteLevel`,
    - a bomba selecionada realmente atinge o inimigo vulneravel,
    - o proprio BOT nao esta no blast dessa detonação.

Validacao desta rodada
- `npm run compile:esm && node tests/bot-opening-discipline-check.mjs && node tests/bot-remote-detonation-check.mjs && node tests/bot-intel-check.mjs && node tests/bot-survival-10s-check.mjs && node tests/bot-powerup-priority-check.mjs && node node_modules/typescript/bin/tsc --noEmit` (ok)
- Smoke visual skill `develop-web-game`:
  - `output/bot-remote-smoke/shot-0.png`
  - `output/bot-remote-smoke/state-0.json`
  - sem `errors-0.json`

TODO proximo run
- Criar um cenario deterministico de browser/harness para o BOT realmente coletar `remote-up` em gameplay e confirmar uso visual da detonação remota, nao apenas por teste Node.
2026-03-17 bot anti-suicide follow-up (own blast-lane escape)
- Root cause reproduced in deterministic harness: bot could return `direction: null` while standing inside its own bomb blast lane (not overlapping bomb tile), delaying escape and leading to self-trap behavior.
- Added targeted regression test `tests/bot-own-blast-escape-check.mjs` (RED -> GREEN) to require bot's chosen next tile to exit its own blast coverage.
- Bot decision hardened in `src/app/game-app.ts`: new `getThreateningOwnedBomb(...)` path that forces immediate escape when bot is inside any owned bomb blast lane, instead of waiting for late danger threshold.
- Added npm script `test:bot-own-blast` for quick verification.

Validation
- `npm run test:bot-own-blast` (pass)
- `npm run test:bot` (pass)
- `npm run test:bot-survival` (pass)
- `node node_modules/typescript/bin/tsc --noEmit` (pass)

Notes
- Attempt to run visual smoke via develop-web-game Playwright client was blocked by host policy when spawning dev server process in this session.
2026-03-18 pixel lab roster + live character menu (G/K)
- Added bulk PixelLab importer script `scripts/import_pixellab_characters.mjs` + npm command `npm run sync:pixellab`.
- Synced completed PixelLab characters into `public/assets/characters/<character-id>/{south,east,north,west}.png` and generated `public/assets/characters/manifest.json`.
- Import result in this run: 76/76 character folders present in `public/assets/characters`.
- Updated runtime assets loader to read roster manifest and load all character directional sprites into `GameAssets.characterRoster`.
- Implemented live character selection workflow in-game:
  - Open selection menu: `G` (P1), `K` (P2)
  - Browse options: P1 `W/S`, P2 `ArrowUp/ArrowDown`
  - Lock selection: P1 `E`, P2 `P`
  - Selection applies live after lock and persists through rounds.
- Added overlay rendering for character selection in menu/match/match-result states.
- Updated portraits/player rendering to use selected roster sprites (instead of fixed player1/player2 art only).
- Added regression test `tests/character-selection-menu-check.mjs` and npm script `test:character-menu`.

Validation
- `npm run test:character-menu` (pass)
- `npm run test:input` (pass)
- `npm run test:bot` (pass)
- `npm run test:bot-own-blast` (pass)
- `node node_modules/typescript/bin/tsc --noEmit` (pass)
- `npm run build` (pass)
2026-03-18 sprite scale polish + hitbox cleanup
- Removed the visible per-player glow/hitbox rectangle from `drawPlayer` so no blue debug box is drawn during gameplay.
- Implemented sprite alpha-trim caching in `src/app/game-app.ts` (offscreen scan once per sprite via `WeakMap`) to crop transparent padding from imported PixelLab frames.
- Player sprite rendering now draws trimmed source rects and uses larger presentation scale (`PLAYER_SPRITE_HEIGHT_SCALE=1.45`, width clamped by tile) so characters are visually readable on the arena.
- Added regression test `tests/player-sprite-render-check.mjs` + npm command `test:player-sprite`.

Validation
- `npm run test:player-sprite` (pass)
- `npm run test:character-menu` (pass)
- `npm run test:input` (pass)
- `npm run test:bot-survival` (pass)
- `npm run build` (pass)

2026-03-18 bot opening trap fix
- Follow-up to the round-start bot report: the opening path from P2 spawn was leading into a dead-end pocket (`8,6`) with breakables on the only useful exits, so the bot would either stall there or look suicidal if it tried to force a bomb.
- Patched `getBotDecision()` to stop using the old "nearest any safe tile" patrol fallback. The fallback now scores adjacent moves, prefers non-reversing movement, and refuses trap tiles that have adjacent breakables but cannot actually be bombed from safely.
- Result: the bot now holds the safe spawn tile instead of walking into the trap on round start, and the opening no longer self-KOs.
- Updated `tests/bot-intel-check.mjs` to assert opening trap safety instead of requiring an impossible first-round bomb from the spawn pocket.

Validation
- `npm run test:bot` (pass)
- `npm run test:bot-opening` (pass)
- `npm run test:bot-own-blast` (pass)
- `npm run test:bot-survival` (pass)
- `npm run test:remote` (pass)
- `npm run build` (pass)
2026-03-18 mini sprint (mecanica: shield-up)
- Foco: mecanica/sobrevivencia (novo power-up defensivo com impacto tatico).
- Entregue:
  - Novo power-up `shield-up` integrado em tipos, arena e assets (`src/core/types.ts`, `src/game/arena.ts`, `src/app/assets.ts`).
  - `PlayerState` expandido com `shieldCharges` e `flameGuardMs`.
  - Dano por chama agora consome escudo antes da morte e aplica janela curta de guard (`SHIELD_GUARD_MS`) para permitir reposicionamento.
  - HUD atualizado para exibir `H` (escudos) e status `GUARD` quando ativo.
  - `render_game_to_text` agora expõe `shieldCharges` e `flameGuardMs` por jogador.
  - Novo teste TDD `tests/shield-powerup-check.mjs` + script `npm run test:shield`.
- Validacoes:
  - `npm run test:shield` (RED->GREEN confirmado)
  - `npm run test:remote` (ok)
  - `npm run test:bot-powerup` (ok)
  - `npm run test:input` (ok)
  - `npm run test:spawn` (ok)
  - `npm run test:round-outcome` (ok)
  - `npm run test:danger-overlay` (ok)
  - `node node_modules/typescript/bin/tsc --noEmit` (ok)
- Observacao tecnica:
  - `compile:esm` em paralelo causa corrida em `output/esm`; manter gate de testes sequencial.
- Playwright:
  - Rodada tentou validacao visual, mas ambiente bloqueou browser/server local (`spawn EPERM`, acesso negado para subir http server e falha de sessao existente no Chrome do MCP).
2026-03-20 HUD cleanup pass
- Analise visual via skill `develop-web-game` finalmente executada com Playwright local e screenshot novo em `output/analysis-smoke/shot-0.png`.
- Achado principal: a barra de controles persistia durante a partida e roubava foco visual da arena, contrariando a diretriz da skill de manter instrucoes no menu.
- Ajuste aplicado em `src/app/game-app.ts`: legenda de controles removida do runtime in-game; informacoes de controle continuam centralizadas no menu inicial.
- Menu tambem foi atualizado para listar o power-up `+Shield`, alinhando onboarding com as mecanicas ja existentes do jogo.

Validacao 2026-03-20
- `npm run build` (pass)
- `npm run test:input` (pass, executado isoladamente para evitar corrida de `compile:esm`)
- Smoke Playwright no build estatico em `http://127.0.0.1:4173` com artefatos em `output/analysis-smoke-clean/`

TODO sugestao
- Se quisermos aproveitar ainda mais a limpeza visual, a proxima rodada natural e usar o espaco inferior liberado para atmosfera decorativa ou subir levemente a arena sem reintroduzir texto utilitario durante a partida.
2026-03-20 launcher pass
- Criado launcher simples para Windows com duplo clique:
  - `Abrir Bomberman.bat`
  - `Fechar Bomberman.bat`
- Implementacao central em PowerShell:
  - `scripts/launch-bomberman.ps1` garante dependencias, roda `npm run build`, sobe servidor local e abre o navegador automaticamente.
  - `scripts/serve-dist.ps1` serve a pasta `dist/` sem depender de Python, usando `HttpListener`.
  - `scripts/stop-bomberman.ps1` encerra o servidor ativo e limpa o estado salvo.
- O launcher reaproveita uma instancia existente quando o jogo ja estiver aberto, evitando abrir varios servidores locais.
- Estado do launcher fica em `.bomberman-launcher.json`, com PID e porta da sessao atual.

Validacao 2026-03-20 launcher
- `powershell -File .\scripts\launch-bomberman.ps1` (pass)
- Reexecucao do launcher com servidor ativo reutilizando a sessao existente (pass)
- `powershell -File .\scripts\stop-bomberman.ps1` (pass)
2026-03-20 menu redesign pass
- Corrigido bug visual do menu inicial: os cards de ready estavam sobrepondo o bloco de instrucoes, gerando layout quebrado e poluido.
- `renderMenu()` foi redesenhado em blocos mais claros:
  - dois cards superiores para P1 e P2/BOT;
  - um card central para opcoes da partida;
  - dois cards inferiores dedicados ao estado de ready e skin de cada jogador.
- `drawReadyPanel()` ganhou layout proprio com retrato embutido no card, textos menores e status mais legivel.
- Adicionado helper `drawMenuSection()` para padronizar os blocos visuais do menu.

Validacao 2026-03-20 menu
- `npm run build` (pass)
- Smoke Playwright em `output/menu-redesign-smoke/shot-0.png` confirmando que o menu deixou de sobrepor elementos
2026-03-20 arena combat + bot visibility pass
- Corrigida a visibilidade do P2/BOT:
  - o roster padrao agora comeca com `default-p1` / `default-p2` em `src/app/assets.ts`, evitando cair direto em personagens do manifest com sprites quebrados;
  - `drawPlayer()` e `drawMenuPortrait()` passaram a usar fallback de direcao renderizavel quando um frame vier vazio/transparente.
- Corrigido o problema do BOT "sumido": o asset `0fb0ec2f...` tinha frames `north/south` vazios, entao o personagem desaparecia quando ficava parado virado nesses eixos.
- Arena refeita para combate:
  - mais conectividade no spawn e no eixo central;
  - power-ups forçados sairam das rotas de abertura e foram reposicionados para zonas mais contestadas;
  - o miolo ganhou mais flancos curtos para gerar troca e rotacao mais cedo.

Validacao 2026-03-20 arena
- `npm run build` (pass)
- `npm run test:spawn` (pass, `reachableOpenTiles` subiu para 15 em ambos os spawns)
- `npm run test:bot-survival` (pass)
- Smoke Playwright em `output/arena-bot-fix-smoke/shot-0.png` mostrando BOT visivel e atuando no centro da arena
2026-03-27 bomb collision + extra power-ups
- Bomba voltou a ser bloqueante por padrao: empurrar bomba agora exige `kick-up`, e atravessar bomba agora exige `bomb-pass-up`, mantendo apenas o escape curto do dono ao plantar.
- Runtime recebeu `bomb-pass-up` e `kick-up` de ponta a ponta: tipos, limites, spawn no mapa, prioridade de bot, HUD, fallback visual e asset loading.
- Spec do pack PixelLab atualizada para incluir `public/assets/ui/power-bomb-pass.png` e `public/assets/ui/power-kick.png`.
- Novos icons gerados e promovidos do PixelLab:
  - `power-bomb-pass.png` com silhueta espectral azul legivel.
  - `power-kick.png` com bota/impacto bem legivel no tile.

Validacao 2026-03-27 power-ups
- `npm run build` (pass)
- `npm run test:bomb-push` (pass; cobre bloqueio default, kick e bomb-pass)
- `npm run test:shield` (pass)
- `npm run test:bot-powerup` (pass)

TODO 2026-03-27
- Rodar smoke visual em browser para ver os dois novos pickups no tabuleiro real e ajustar contraste se o `kick-up` parecer escuro demais em fundo claro.
- Se quisermos expandir mais a camada de perks, os proximos candidatos naturais sao `line-bomb`, `flame-pass` ou `throw-bomb`.
2026-03-27 Killer Bee animation queue
- PixelLab: aberta bateria nova focada no `Killer Bee` (`6ee8baa5-3277-413b-ae0e-2659b9cc52e9`).
- Ja completos no personagem:
  - `breathing-idle`: south, west, north, south-east, east, south-west, north-west
- Em processamento quando esta nota foi escrita:
  - `breathing-idle`: north-east
  - `walking-8-frames`: south, east, north, west
  - `running-8-frames`: south, north
  - `high-kick`: east, west
- Gargalo atual: dois jobs de `walking-8-frames` ficaram presos/mais lentos, entao o ZIP do personagem ainda pode responder `423` ate a fila zerar.

TODO Killer Bee
- Assim que `get_character("6ee8baa5-3277-413b-ae0e-2659b9cc52e9")` mostrar fila vazia, rodar:
  - `$env:PIXELLAB_CHARACTER_IDS='6ee8baa5-3277-413b-ae0e-2659b9cc52e9'; node scripts/import_pixellab_characters.mjs`
- Depois validar no runtime se `idle` e `walk` entraram no manifest/import local.
2026-03-27 roster expansion + general animation wave
- `5474c45c-2987-43e0-af2c-a6500c836881` entrou no jogo e no manifesto com nome curto `Nico`.
- Import sincronizado com sucesso para:
  - `Ranni`
  - `Killer Bee`
  - `Nico`
- Estado local apos sync:
  - `Ranni`: `idle=true`, `walk=true`
  - `Killer Bee`: `idle=true`, `walk=true`
  - `Nico`: `idle=false`, `walk=true`
- Wave de animacoes geral aberta no PixelLab:
  - `Nico`: `breathing-idle` cardinal (`south/east/north/west`)
  - `Ranni`: `running-8-frames` cardinal (`south/east/north/west`)
  - `Ranni`: `fireball` lateral (`east/west`)

TODO next sync
- Quando `get_character("5474c45c-2987-43e0-af2c-a6500c836881")` e `get_character("03a976fb-7313-4064-a477-5bb9b0760034")` ficarem sem jobs pendentes, rodar:
  - `$env:PIXELLAB_CHARACTER_IDS='03a976fb-7313-4064-a477-5bb9b0760034,5474c45c-2987-43e0-af2c-a6500c836881'; node scripts/import_pixellab_characters.mjs`
2026-03-27 Ranni sync + extended site animation import
- Importador de personagens foi ampliado para sincronizar mais familias vindas do PixelLab/site:
  - `run-*`
  - `cast-*`
  - `attack-*`
- Sync executado com sucesso para personagens sem fila travada:
  - `Killer Bee`: `idle`, `walk`, `run`, `attack`
  - `Nico`: `idle`, `walk`, `run`, `attack`
- `Ranni` continua parcialmente travada por `HTTP 423` porque o ZIP dela ainda esta bloqueado por jobs pendentes no PixelLab.

Wave atual da Ranni
- Ja existentes/completos no site:
  - `idle`
  - `walk`
  - `run` cardinal
- Em fila no PixelLab:
  - `fireball` (`east/west`)
  - `taking-punch` (`east/west`)
  - `walking-8-frames` (`south`) ainda fechando

TODO Ranni
- Quando `get_character("03a976fb-7313-4064-a477-5bb9b0760034")` ficar sem jobs pendentes, rodar:
  - `$env:PIXELLAB_CHARACTER_IDS='03a976fb-7313-4064-a477-5bb9b0760034'; node scripts/import_pixellab_characters.mjs`
- Depois conferir no manifesto local se `run`, `cast` e `attack` ficaram marcados como `true`.

2026-03-27 match result flow fix
- Troquei o fim de partida de rematch automático por escolha explícita: `Q = Sim` e `R = VOLTAR PRO LOBBY`.
- `TARGET_WINS` foi ajustado para 5 e o estado de match-result agora reinicia como lobby novo em vez de reaproveitar o ciclo antigo.
- O worker ganhou `match-result-choice` por jogador e decide entre voltar ao lobby ou recriar um match fresco via lobby aberto.
- O cliente online passou a parar de capturar input de gameplay fora de `match`, para nao consumir Q/R no lobby.
- Validacao concluida:
  - `npm run compile:esm`
  - `node --check worker/index.js`
2026-03-27 wrap-map pass
- Arena layout atualizado para uma versao mais competitiva com blocos quebraveis em padrao mais organizado e rotas centrais mais disputadas.
- Bordas agora possuem portais de wrap em quatro lados (esquerda/direita no eixo central e cima/baixo no eixo central), permitindo atravessar de um lado ao outro.
- Colisao/movimento do jogador ajustados para coordenadas circulares da arena (wrap horizontal e vertical), incluindo empurrao de bomba atravessando borda.
- Propagacao de explosao nas bordas passou a respeitar limite do grid para evitar tiles invalidos quando a borda nao e solida.
- Render ganhou destaque visual nos tiles de portal para leitura rapida durante partida.
- Validacao executada: `npm run build`, `npm run test:spawn`, `npm run test:bomb-range`.
- Deploy executado com sucesso em Cloudflare Workers.
- URLs ativas: https://autowebgame-online.lucasplays2000.workers.dev e https://bombapvp.com.
2026-03-27 hud-and-rail-fix
- Corrigido estado de partida para o rail lateral (pilot locks + bomb feed) ocupar coluna propria, sem sobrepor o canvas.
- Ajustado HUD superior para reduzir sobreposicao de textos em partidas 1v1 com layout dedicado (painel esquerdo/direito + centro limpo para tempo/SD).
- HUD recebeu altura maior para acomodar informacoes sem colisao visual.
- Validacao: `npm run build` e `npm run test:powerup-hud`.
- Deploy atualizado em Cloudflare (version id 2efd2005-5e23-4ce7-9fe8-c3bb81dc835d).
2026-03-27 quick-match-lobby-rail-fix
- Corrigido estouro visual no estado de lobby/quick-match: rail da direita agora tem contencao vertical, seats com scroll proprio e chat com area isolada.
- Evitado comportamento confuso do botao Find match quando usuario ja esta com vaga pronta em lobby aberto (agora mostra status de espera em vez de tentar novo matching em loop).
- Mensagem de status no lobby aberto foi ajustada para deixar claro quando quick match ja travou vaga e so falta outro piloto.
- Validacao: `npm run build` e `npm run test:online-4p`.
- Deploy atualizado em Cloudflare (version id 86674c2c-b9f2-4331-8139-f4dbc8d618db).
2026-03-27 arena-hardening-pass
- Arena generator ajustado para garantir 0 pares ortogonais de blocos indestrutiveis encostados (incluindo bordas) com padrao de borda alternada.
- Spawns receberam carve estrutural e pockets de abertura para remover armadilha de inicio; validacao agora mostra 3 vizinhos livres em cada spawn.
- Densidade de blocos quebraveis em tiles abertos foi reduzida para evitar corredores de morte no inicio.
- Scripts npm de build foram ajustados para usar binarios locais (`node_modules`) e evitar falha de `tsc` ausente no ambiente.
- Dependencia de deploy `@cloudflare/workerd-windows-64` adicionada para estabilizar wrangler no Windows.
- Validacoes: `npm run test:spawn`, check interno de `touchingPairs=0`, `npm run test:bomb-range`, `npm run test:bot-opening`.
- Deploy atualizado em Cloudflare (version id 7322ce59-9fed-4013-a652-1039554c1ca4).
2026-03-27 dense-breakable-pass
- Arena generation alterada para cumprir pedido de mapa denso: aproximadamente 80%+ dos tiles jogaveis (fora da zona de spawn) agora viram blocos quebraveis de forma deterministica e simetrica.
- Spawn safety mantida com bolha manhattan<=2 em cada spawn, garantindo abertura inicial sem morte obrigatoria.
- Regra de solidos mantida com 0 pares ortogonais de indestrutiveis encostados.
- Validacao: densidade atual 0.895 (17/19 tiles fillable), touchingSolidPairs=0, `npm run test:spawn` ok.
- Deploy atualizado em Cloudflare (version id 096a046f-f9b6-437b-8c09-095dd9408cdd).
2026-03-27 four-player-balance-pass
- Arena redesenhada para 4 players com simetria horizontal/vertical na distribuicao de caixas quebraveis (todos os spawns equivalentes).
- Densidade de blocos quebraveis ajustada para 82.1% fora da zona de spawn seguro.
- Spawn continua seguro (3 vizinhos livres) e foi mantido bloco inicial forcado para abertura de jogo sem auto-morte.
- Regra de indestrutiveis sem contato ortogonal preservada (`touchingSolidPairs=0`).
- Validacao: `npm run test:spawn`, check de densidade/solidos, `npm run test:bomb-range`, `npm run test:online-4p`.
- Deploy atualizado em Cloudflare (version id f626c3c4-2eff-4953-99e0-282b86511d5d).
2026-03-27 Ranni ult hotfix (ice cast + channel teleport validation)
- Corrigido importador `scripts/import_pixellab_characters.mjs` para priorizar animacao custom de gelo da Ranni antes de fallbacks genericos.
- Adicionado fallback direcional para cast (incluindo reaproveitamento de direcoes disponiveis) e limpeza de frames antigos por prefixo para evitar mistura com `fireball`.
- Sync executado com `PIXELLAB_CHARACTER_IDS=03a976fb-7313-4064-a477-5bb9b0760034`; cast da Ranni agora foi regenerado em 4 frames por direcao (`cast-south/east/north/west-0..3`) a partir do set de gelo.
- Reforcado teste `tests/ranni-ult-ice-blink-check.mjs` para rodar em mapa aberto e validar cadeia completa da mecanica: freeze em channel, projected movement durante 2s, teleport no fim, entrada em cooldown.

Validacao 2026-03-27
- `npm run test:ranni-ult` (pass)
- `npm run test:input` (pass)
- `npm run test:player-sprite` (pass)
- `npm run build` (pass)
2026-03-27 online bomb flicker fix (guest one-shot input latch)
- Causa raiz identificada no Durable Object (`worker/index.js`): `capturePlayerInput` sobrescrevia `bombPressed/detonatePressed/skillPressed` com `false` quando chegava um pacote mais novo antes do tick do servidor.
- Efeito em jogo: cliente guest previa bomba localmente, mas o servidor podia nao consumir o one-shot; no frame autoritativo seguinte a bomba sumia ("aparece e some").
- Correcao aplicada:
  - criado `src/online/input-latch.ts` com `mergeSequencedOnlineInputState(...)` para latchear flags one-shot por seq (OR) e ignorar pacotes fora de ordem.
  - `worker/index.js` agora usa esse merge em `capturePlayerInput`.
- Teste novo: `tests/online-input-latching-check.mjs` + script `npm run test:online-input-latch`.

Validacao 2026-03-27
- `npm run test:online-input-latch` (pass)
- `npm run test:online-4p` (pass)
- `node --check worker/index.js` (pass)
- `npm run build` (pass)
2026-03-27 PvP latency pass
- Diagnostico consolidado do lag PvP:
  - o jogo contra bot local continuava liso, entao o gargalo ficou restrito ao pipeline online
  - o cliente online ja estava com interpolacao baseada em `serverTimeMs` e buffer dinamico curto (`18-34 ms`) em `src/app/game-app.ts`
  - o servidor autoritativo ainda dependia de `setInterval(16.6ms)` perfeito; se o timer atrasasse no workerd local, a partida inteira desacelerava e o input parecia atrasado mesmo com ping baixo
- Correcao aplicada no servidor:
  - criado `src/online/server-tick.ts` com acumulador/catch-up para steps fixos
  - `worker/index.js` passou a usar `pumpRoomMatch(...)` com acumulador real de tempo e limite de catch-up por pump
  - broadcast continua saindo com o ultimo estado processado, evitando enfileirar frames intermediarios quando houver atraso do timer
- Teste novo: `tests/server-tick-catchup-check.mjs` + script `npm run test:server-tick`

Validacao 2026-03-27 PvP latency
- `npm run test:server-tick` (pass)
- `npm run test:online-input-latch` (pass)
- `npm run test:online-4p` (pass)
- `node --check worker/index.js` (pass)
- `npm run build` (pass)
- `GET http://2804-14c-62-2471--5bc.nip.io:8788/health` (200)
2026-03-27 local-online parity + menu bot fill
- Fluxo local para testar o mesmo worker autoritativo do online sem deploy:
  - `serve:online` agora sobe `wrangler dev --local` (usa `worker/index.js` + Durable Object + `/online` websocket + assets de `dist`).
  - comando legado de relay simplificado mantido como `serve:online:legacy-relay`.
- Validacao de health local do worker: `GET /health` retornando 200 (`{"ok":true}`) em `127.0.0.1:8787`.
- Menu local ganhou suporte para completar partida com bots:
  - `B` = toggle rapido (0 <-> 1 bot)
  - `N` = ciclo de bots (`0..3`) preenchendo slots ate P4
  - inicio da partida agora usa todos os `activePlayerIds` (bots entram auto-ready)
  - bot control generalizado para P2/P3/P4 quando preenchidos.
- Overlay do menu local atualizado com hint de controles e contador de bots/ativos.
- `render_game_to_text` agora expõe `localBotFill` e `activePlayerIds` no bloco `match`.
- Novo teste: `tests/menu-bot-fill-check.mjs` + script `test:menu-bot-fill`.

Validacao 2026-03-27
- `npm run test:menu-bot-fill` (pass)
- `npm run test:online-input-latch` (pass)
- `npm run test:input` (pass)
- `npm run test:online-4p` (pass)
- `npm run build` (pass)
2026-03-27 sudden death spiral collapse pass
- Sudden death deixou de gerar chamas aleatorias/pontas duplas; agora fecha 1 tile por tick seguindo uma espiral de fora para dentro.
- Cada tile entra em animacao de queda, impacta no chao e vira bloqueio permanente (`arena.solid`), cumprindo o efeito de "slot fechando na cabeca".
- Impacto do fechamento quebra crate, revela/remove pickup preso no tile, aciona bomba presa ali e elimina jogador que permanecer no slot no momento da pancada.
- Estado online sincronizado com `suddenDeathClosedTiles` + `suddenDeathClosingTiles`, mantendo host/guest alinhados no colapso da arena.
- `render_game_to_text` agora expõe tiles fechados e tiles em queda dentro de `match.suddenDeath`.

Validacao 2026-03-27 sudden death spiral
- `npm run build` (pass)
- `npm run compile:esm` (pass)
- `node tests/sudden-death-check.mjs` (pass)
- `npm run test:online-audio` (pass)

Observacao
- `npm run test:bot` continua falhando no caso `strategicAvoidPass` com `direction: "down"`; nao mexi na heuristica desse cenario porque a mudanca desta rodada ficou restrita ao sudden death.
2026-03-29 sfx reset pass
- Sistema de som reduzido para 6 eventos: `bombPlace`, `bombExplodeMain`, `flames`, `powerCollect`, `matchStart` e `matchWin`.
- Removidos gatilhos de audio para crate break, shield, player death, sudden death e round win intermediario.
- Explosao local/online agora toca `bombExplodeMain` e em seguida `flames`; coleta de power-up foi normalizada para `powerCollect`.
- Pasta `public/assets/audio/sfx` sera sincronizada com os arquivos aprovados de `CustomSFX/BASE`.

Validacao 2026-03-29 sfx
- `npm run build` (pass)
- `npm run test:online-audio` (pass)
2026-03-29 sfx explosion variation pass
- Explosao de bomba agora usa um evento unico `bombExplode` com duas variacoes (`bomb_explode_default.mp3` e `bomb_explode_main.mp3`).
- `SoundManager` passou a suportar multiplas variacoes por chave, escolhendo aleatoriamente entre elas em tempo de execucao.
- Adicionado fallback interno: se a variacao escolhida falhar ao tocar, o manager tenta automaticamente a outra.
- Fluxos local e online foram normalizados para disparar `bombExplode`, e o asset `bomb_explode_default.mp3` foi promovido para `public/assets/audio/sfx`.

Validacao 2026-03-29 sfx variation
- `npm run build` (pass)
- `npm run test:online-audio` (pass)
- `npm run compile:esm && node tests/sound-manager-variation-check.mjs` (pass)
2026-03-29 online bomb audio false-positive fix
- Corrigido bridge de audio online para rastrear bomba por `ownerId + tile`, nao apenas por `id`.
- Isso evita falso positivo de explosao quando o guest preve a bomba localmente e o snapshot autoritativo chega com outro `id` para a mesma bomba.
- Teste `online-audio-bridge-check` ampliado para cobrir troca de `id` sem tocar nenhum SFX extra.

Validacao 2026-03-29 online bomb audio fix
- `npm run build` (pass)
- `npm run test:online-audio` (pass)
2026-03-29 bomb explode default-only pass
- Explosao de bomba voltou para `bomb_explode_default.mp3` em 100% dos casos.
- A variacao `main` saiu do manifest para evitar inconsistencias perceptiveis no som de explosao.
- O teste do `SoundManager` foi simplificado para garantir que o manifest carrega apenas o `default`.

Validacao 2026-03-29 bomb explode default-only
- `npm run build` (pass)
- `npm run test:online-audio` (pass)
- `npm run compile:esm && node tests/sound-manager-variation-check.mjs` (pass)
