![v0.2.0](https://github.com/LucasOl1337/AutoWebGame/releases/download/v0.2.0/v0.2.0-card.png)

# v0.2.0 - Rebrand BOMBA, online e ultimates (22/06/2026)

Release oficial do AutoWebGame no estado atual da linha `main`, consolidando a evolucao desde `v0.1.0` com jogo local, fluxo online via Cloudflare Worker, roster data-driven e habilidades de personagem.

## Novidades

- **Lobby online com Worker:** matchmaking, quick match, entrada manual por lobby e fluxo de rematch usam o backend em `worker/`.
- **Ultimates de personagem:** Killer Bee, Nico, Ranni e Crocodilo Arcano usam habilidades registradas por contrato no runtime.
- **Painel de auto-improvements:** fluxo local de bots e agentes pode ser acionado pelo painel de desenvolvimento in-game.

## Melhorias

- **Rebrand visual para BOMBA:** site, icone, topbar, tela inicial e atmosfera do jogo foram ajustados para a identidade mint-cyan.
- **Audio CustomSFX:** pacote dedicado cobre explosoes, lobby, inicio/fim de partida, powerups e mix de gameplay.
- **Rosters data-driven:** personagens, sprites e temas de arena carregam por manifests e bibliotecas em vez de excecoes soltas.
- **Powerups reduzidos a quatro tipos principais:** HUD, icones e regras ficam mais legiveis durante partidas rapidas.

## Correcoes

- **Audio falso de explosao:** posicionar bomba nao dispara mais som de explosao.
- **Fluxo de rematch online:** resultado de rodada, pausa e rematch ficam sincronizados entre cliente e sessao.
- **Ranni congelada:** invulnerabilidade durante freeze foi corrigida.
- **Latencia PvP online:** ajustes no fluxo online reduziram inconsistencias de entrada e reconciliacao.

## Sistemas

- **Worker authoritative:** estado de sala online e regras de sessao ficam centralizados no backend `worker/`.
- **Broker na porta 8766:** o servico local saiu da porta 8765 para evitar conflito com outro processo.
- **Artefatos codegraph ignorados:** `.codegraph/` foi adicionado ao `.gitignore` para manter snapshots fora da release.
- **Sem CI configurado:** `.github/workflows` ainda nao existe; gates continuam sendo scripts locais do `package.json`.

---

## Notas tecnicas

Base `v0.1.0` -> `main`; tag `v0.2.0` aponta para `1d7b38deb294f67bed7bff278da6875082322d00`. O reparo desta automacao nao move a tag e nao altera `package.json`; ele apenas adiciona artefatos documentais, anexa o card PNG e embute a imagem no topo do GitHub Release oficial existente.
