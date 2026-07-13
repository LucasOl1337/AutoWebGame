# QA browser loop

Criado em: 2026-07-08

Regra operacional: cada item so pode ser marcado como passou depois de ser clicado no Chrome. Em falha, corrigir o codigo, recarregar e repetir o mesmo item antes de avancar. Validar desktop e mobile, sem erro novo no console, sem falha de network e sem corte/overflow/ilegibilidade.

## Fila

- [ ] Landing comercial (`/`): topbar, side nav, CTAs, links internos, cards de personagem, cards/links de arena/modos, links legais e estado responsivo.
- [ ] Guia como jogar (`/how-to-play.html`): nav, CTAs, atalhos internos, painel final, footer e estado responsivo.
- [ ] Shell do jogo (`/game`): seletor de idioma, conta rapida/login/logout, billing placeholder, partida rapida, endless, bot match, seletor de intensidade, temas de arena, carrossel/cards de personagens, feedback modal e estado responsivo.
- [ ] Lobby manual (`/game` -> lobby): voltar, criar sala, input/codigo de sala, entrar por Enter/botao, estado vazio/lista de salas e estado responsivo.
- [ ] Setup de sala/personagem (`/game` setup): voltar/sair/copiar convite, seats, grid de personagem, botao primario/pronto/cancelar e estado responsivo.
- [ ] Partida local/canvas (`/game` bot match): canvas, HUD, teclado, pausa/volta de foco, bombas, skill, resultado/rematch/voltar ao lobby e estado responsivo.
- [ ] Partida online/match chrome (`/game` match): copiar convite, sair, fullscreen, painel info, painel chat, input/enviar chat, canvas e estado responsivo.
- [ ] Paginas legais (`/privacy.html`, `/terms.html`): navegacao principal/footer e estado responsivo.

## Historico

- 2026-07-08: Checkpoint criado porque `DocsDev/qa-browser-loop.md` nao existia. Proximo alvo: Landing comercial (`/`).
