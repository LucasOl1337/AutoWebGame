# Arquitetura Inicial - AutoWebGame

## Objetivo

Construir um webapp de jogo 2D inspirado em Bomberman com:
- partida em arena baseada em grid;
- movimentacao simples, bombas, explosoes em cruz e blocos destrutiveis;
- foco inicial em gameplay local para 1 jogador;
- arquitetura pequena, modular e facil de testar.

## Recomendacao de stack

### Linguagens

- TypeScript: linguagem principal para jogo e UI.
- HTML5: shell da aplicacao.
- CSS: layout, menu e HUD.

### Runtime e build

- Vite: dev server rapido, build simples e boa experiencia para iterar.
- Canvas 2D API: render inicial. Evita overhead de engine no MVP.

### Teste e validacao

- Playwright client da skill `develop-web-game`: validacao visual e interacoes automatizadas.
- `window.render_game_to_text`: espelho textual do estado do jogo.
- `window.advanceTime(ms)`: stepping deterministico para os testes.

## Por que essa combinacao

- Canvas 2D + TypeScript e o melhor ponto de partida para um Bomberman-like: mapa em grid, colisao simples, sprites 2D e loop controlado.
- Vite reduz setup e facilita subir o jogo cedo.
- Evitamos engine pesada no inicio. Se o projeto crescer, ainda podemos migrar partes para PixiJS sem reescrever regras de jogo se o core estiver desacoplado.

## Estrutura de pastas sugerida

```text
AutoWebGame/
  docs/
    architecture.md
  public/
    assets/
      audio/
      fonts/
      sprites/
      tiles/
      ui/
  src/
    app/
      bootstrap.ts
      game-app.ts
    core/
      config.ts
      constants.ts
      types.ts
      math/
      utils/
    engine/
      game-loop.ts
      input.ts
      renderer.ts
      scene-manager.ts
      time-step.ts
    game/
      entities/
        player.ts
        bomb.ts
        flame.ts
        block.ts
        enemy.ts
      systems/
        movement-system.ts
        collision-system.ts
        bomb-system.ts
        flame-system.ts
        powerup-system.ts
        round-system.ts
      map/
        grid.ts
        level-generator.ts
        tile-defs.ts
      rules/
        explosion.ts
        win-loss.ts
      state/
        game-state.ts
        save-state.ts
    scenes/
      boot-scene.ts
      menu-scene.ts
      gameplay-scene.ts
      game-over-scene.ts
    ui/
      hud.ts
      overlays.ts
      screens/
    debug/
      render-game-to-text.ts
      debug-flags.ts
    styles/
      main.css
    main.ts
  tests/
    smoke/
    fixtures/
    actions/
  progress.md
  package.json
  tsconfig.json
  vite.config.ts
```

## Divisao de modulos

### `core/`

Responsavel por tipos compartilhados, constantes do grid, configuracao global, helpers matematicos e funcoes puras.

### `engine/`

Infra do jogo, sem regra de negocio:
- loop principal;
- leitura de input;
- integracao com canvas;
- controle de cena;
- stepping deterministico.

### `game/`

Regra de negocio do Bomberman-like:
- entidades;
- sistemas;
- mapa e tiles;
- regras de explosao, morte, rodada e power-ups.

### `scenes/`

Fluxo de telas:
- boot/preload;
- menu inicial;
- gameplay;
- fim de partida/restart.

### `ui/`

HUD e overlays fora da logica central:
- vidas;
- quantidade de bombas;
- alcance de explosao;
- mensagens de pause/game over.

### `debug/`

Adaptadores obrigatorios para automacao:
- `render_game_to_text`;
- flags de debug;
- info de hitbox, grid e estado da partida.

## Modelo tecnico inicial

### Representacao do mapa

- Grid ortogonal fixo, por exemplo 13x11.
- Cada celula tem um tipo:
  - indestrutivel;
  - destrutivel;
  - vazia;
  - power-up oculto.

### Entidades do MVP

- Player
- Bomb
- Flame
- BreakableBlock
- SolidWall
- Door ou goal opcional para fase seguinte

### Ordem de update recomendada

1. Ler input
2. Atualizar intencao de movimento
3. Resolver colisao
4. Atualizar timers de bomba
5. Propagar explosoes
6. Aplicar dano e destruicao
7. Revelar power-ups
8. Avaliar vitoria/derrota
9. Renderizar

## Escopo de MVP recomendado

### Fase 1

- menu inicial simples;
- um mapa fixo;
- movimentacao do player;
- colocar bomba;
- explosao em cruz;
- blocos destrutiveis;
- morte ao encostar na chama;
- restart.

### Fase 2

- power-ups de alcance e capacidade de bombas;
- um tipo simples de inimigo;
- porta de saida ou condicao de vitoria;
- audio basico.

### Fase 3

- mais fases;
- geracao de mapa por seeds;
- multiplayer local no teclado;
- IA melhor;
- persistencia de progresso.

## Assets

### Politica inicial

- Comecar com placeholder art original para validar gameplay.
- Evitar copiar arte, personagens ou audio do Bomberman original.
- Consolidar dimensoes desde cedo para evitar retrabalho:
  - tile base: 16x16 ou 24x24;
  - sprites de personagem alinhados ao mesmo grid;
  - atlas separado por categoria.

### Estrutura de assets

- `public/assets/tiles/`: piso, paredes, blocos quebraveis, porta.
- `public/assets/sprites/`: player, inimigos, bomba, chama, power-ups.
- `public/assets/ui/`: botoes, logo, icones HUD.
- `public/assets/audio/`: explosao, colocar bomba, pickup, morte, musica.

### Ordem de producao

1. Placeholder colorido e legivel
2. Tileset base do mapa
3. Sprites do player e bomba
4. FX de chama e destruicao
5. UI e audio

## MCPs recomendados

### Essenciais para desenvolvimento

- Playwright skill/client: validar fluxo de jogo, capturar screenshot, inspecionar console e estado textual.

### Opcionais para arte e conteudo

- Pixellab `create_character`: gerar personagem original estilo arcade para placeholder.
- Pixellab `create_tiles_pro` ou `create_topdown_tileset`: gerar tiles de piso, parede e bloco no mesmo estilo.
- Pixellab `create_map_object`: criar objetos isolados como bomba, crate, power-ups e porta.

### Como usar MCPs sem travar o projeto

- MCPs entram como aceleradores de conteudo visual, nao como dependencia do runtime.
- O jogo deve funcionar com assets locais em `public/assets`.
- Toda geracao via MCP deve ser convertida em arquivo versionado no repositorio.

## Convencoes de engenharia

- Separar regra de jogo de renderizacao.
- Preferir funcoes puras para explosao, colisao e validacao de celula.
- Guardar coordenadas de grid e coordenadas em pixel de forma explicita.
- Evitar estado global solto; centralizar em `game-state`.
- Documentar formatos-chave de estado para testes automatizados.

## Contratos de debug obrigatorios

### `window.render_game_to_text()`

Retorna JSON curto com:
- modo atual;
- dimensoes do grid;
- posicao do player;
- bombas ativas e timers;
- chamas ativas;
- blocos destrutiveis restantes;
- inimigos visiveis;
- power-ups visiveis;
- flags de vitoria/derrota;
- nota de coordenadas: origem no canto superior esquerdo, `x` cresce para a direita e `y` para baixo.

### `window.advanceTime(ms)`

Permite avancar a simulacao em passos deterministas para automacao e testes.

## Primeira implementacao sugerida

1. Scaffold com Vite + TypeScript
2. Canvas centralizado e resize
3. Cena de menu
4. Cena gameplay com grid fixo
5. Player andando por tile com colisao
6. Bombas com timer
7. Explosao e destruicao de blocos
8. Hooks de debug
9. Script Playwright de smoke test

## Decisoes recomendadas para agora

- Escolher TypeScript em vez de JavaScript puro.
- Escolher Canvas 2D em vez de engine externa.
- Escolher placeholder assets no MVP.
- Escolher single-player primeiro.
- Escolher mapa fixo antes de procedural.
