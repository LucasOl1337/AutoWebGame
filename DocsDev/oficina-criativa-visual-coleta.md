# Oficina Criativa Visual - coleta consolidada

Esta pagina e a mesa de coleta da oficina visual executada em 14 de julho de 2026. Ela separa o que entrou no produto dos arquivos usados apenas durante exploracao e informa onde cada resultado pode ser visto por uma pessoa.

## Resultado

| Entrega | Estado | Onde ver no produto | Arquivos finais | Validacao |
|---|---|---|---|---|
| Portal da arena | Integrada | Launcher em `/game`, no modo Arena PvP e no indice de materiais | `public/Assets/UiLayouts/arena-portal-emblem.webp` | Launcher local e teste do portal |
| Planta de demolicao | Integrada | Fundo do cabecalho do launcher em `/game` | `public/Assets/UiLayouts/launcher-demolition-blueprint.webp` | Launcher local e teste do blueprint |
| Drone Estopim | Integrada | Estado de carregamento ao preparar uma partida | `public/Assets/UiLayouts/bootstrap-drone-estopim.png` | Teste do carregamento visual |
| Selo da arena | Integrada | Indice de materiais do launcher em `/game` | `public/Assets/marketing/hero-arena-sigil.webp` | Verificacao de coleta e inspecao do launcher |
| Bomba extra | Integrada | Power-up de bomba dentro das partidas | `public/Assets/UiLayouts/power-bomb.png` | Loader de assets e teste visual focado |
| Alcance de chama | Integrada | Power-up de alcance dentro das partidas | `public/Assets/UiLayouts/power-flame.png` | Loader de assets e teste visual focado |
| Detonador remoto | Integrada | Power-up remoto dentro das partidas | `public/Assets/UiLayouts/power-remote.png` | Loader de assets e teste visual focado |
| Escudo arcano | Integrada | Power-up de escudo dentro das partidas | `public/Assets/UiLayouts/power-shield.png` | Loader de assets e teste visual focado |
| Caixote Mare de Bronze | Integrada | Partidas com o tema `tidal-foundry` | `public/Assets/TileMaps/themes/tidal-foundry/crate-mare-de-bronze.png` | Biblioteca de temas e teste visual focado |
| Nucleo de ignicao | Integrada | Moldura lateral da arena durante a partida | `public/Assets/ui/arena-ignition-core.webp` | Cliente da sessao e teste visual focado |
| Emblema de vitoria | Integrada | Resultado de round e de partida quando existe vencedor | `public/Assets/UiLayouts/arena-victory-emblem.webp` | Loader, renderer e teste visual focado |
| Animacao de derrota do Nico | Integrada | Quando Nico e derrotado, nas quatro direcoes | `public/Assets/Characters/Animations/5474c45c-2987-43e0-af2c-a6500c836881/death-*.png` | Manifestos aprovados e teste dos 24 quadros |
| Arte do guia | Integrada | Pagina `how-to-play.html` | `public/Assets/UiLayouts/how-to-play-arena-tactical.webp` | Teste da pagina Como jogar |
| Icone do jogo | Integrada | Aba do navegador ao abrir `game.html` | `public/Assets/UiLayouts/favicon-bomba-coroa.png` | Contrato do HTML e teste visual focado |
| Icone PWA | Integrada | Instalacao, atalho e identidade do app | `public/brand/bomba-prism-icon-512.png` e derivados | Contratos da landing e dos icones |
| Rastro Relampago | Integrada | Power-up de velocidade no mapa e no HUD das partidas | `public/Assets/UiLayouts/power-speed-rastro-relampago.png` | Loader de assets, teste visual focado e inspecao em 32 px, 16 px e 8 px |

## O que nao deve ser promovido

Os arquivos de exploracao da oficina foram preservados em `output/oficina-criativa-visual-2026-07-14/`, uma area local ignorada pelo Git. Eles incluem fontes grandes, alternativas A/B, comparacoes antes/depois e capturas de evidencia. Nao sao novas entregas do jogo e nao devem competir com os arquivos finais listados acima.

## Regra de fechamento para proximas oficinas

Uma rodada visual so pode ser declarada concluida quando cada recurso gerado terminar em exatamente um destes estados:

1. **Integrado:** possui arquivo final, consumidor real no produto, local humano para verificacao e teste proporcional ao risco.
2. **Candidato:** permanece na area local de exploracao, com motivo claro para ainda nao entrar.
3. **Descartado:** nao sera usado e pode ser removido da area de exploracao.

Existir em `public/` ou passar em um teste que apenas procura o nome do arquivo nao prova integracao. A coleta deve confirmar a rota ativa e dizer em linguagem humana onde a mudanca aparece.
