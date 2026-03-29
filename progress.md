Original prompt: Uma coisa que tá faltando é na nossa tela de início, além da partida rápida e entrar em um lobby, também pode ter o botão partida contra bots, é um sistema que já existe dentro do jogo, então é só você clicar no botão partida contra bots, que aí já vai começar uma partida com bots. Aí pode colocar pra default ter três bots inimigos e é isso mesmo. Agora, além disso, na hora que você clica em partida rápida, às vezes você tá esperando porque não tem mais pessoas na fila, certo? Então coloca pra opção de ficar Coloca a opção para na tela de quando você compra jogar e está esperando mais pessoas, mostrar tipo uma lista de quantas pessoas estão online do lado assim, tipo o ID do jogador, pra ele saber, por exemplo, quantos estão on, se tá só ele, se tem mais gente pra entrar.

- Adicionado CTA `Partida contra bots` na landing e bridge para iniciar partida offline com 3 bots direto do `OnlineSessionClient`.
- Preferência de personagem da casca online agora sincroniza com o `GameApp` offline.
- Estendido o protocolo online para incluir `onlinePlayers` em `hello`, `lobby-list` e `quick-match-state`.
- Setup agora renderiza painel `Jogadores online` durante espera/entrada, com destaque para o próprio cliente.
- Build validado com `npm run build`.
- Testes validados com `npm run test:input-alias` e `npm run test:character-menu`.

TODOs / sugestões:
- Playtestar o botão `Partida contra bots` no browser e confirmar se a transição visual de landing -> match está instantânea e sem estados intermediários estranhos.
- Considerar mostrar nomes mais amigáveis no painel de presença se no futuro houver nickname/login, em vez de IDs curtos.
