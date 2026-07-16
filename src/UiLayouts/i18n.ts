export type SiteLanguage = "pt" | "en";

import { readLocalStorageItem, writeLocalStorageItem } from "./browser-storage";

export const SITE_LANGUAGE_STORAGE_KEY = "bomba-site-language";

export interface SiteCopy {
  language: {
    portuguese: string;
    english: string;
  };
  common: {
    back: string;
    home: string;
    start: string;
    loading: string;
    waiting: string;
    live: string;
    ready: string;
    leader: string;
    room: string;
    arena: string;
    players: (count: number, max: number) => string;
    credits: (count: number) => string;
  };
  landing: {
    kicker: string;
    lead: string;
    commercialProof: string[];
    quickMatch: string;
    quickMatchBusy: string;
    botMatch: string;
    enterLobby: string;
    feedback: string;
    searching: string;
    meta: (queuedRooms: number, onlineUsers: number) => string;
    releaseBadge: string;
    releaseTitle: string;
    releaseItems: readonly string[];
    feedbackTitle: string;
    feedbackPrompt: string;
    feedbackPlaceholder: string;
    feedbackSend: string;
    feedbackCancel: string;
    feedbackSending: string;
    feedbackThanks: string;
    feedbackError: string;
    feedbackTimeout: string;
    feedbackEmpty: string;
    feedbackCharactersRemaining: (remaining: number) => string;
    feedbackCharactersOverLimit: (overLimitBy: number, maxLength: number) => string;
    feedbackTooLong: (maxLength: number) => string;
    billingKicker: string;
    billingTitleReady: string;
    billingTitlePending: string;
    billingTitlePaid: string;
    billingTitleUnavailable: string;
    billingStatusLoading: string;
    billingStatusVisitor: string;
    billingStatusFree: string;
    billingStatusPending: string;
    billingStatusPaid: string;
    billingStatusUnavailable: string;
    billingHintVisitor: string;
    billingHintReady: string;
    billingHintPending: string;
    billingHintPaid: string;
    billingHintUnavailable: string;
    billingCtaReady: string;
    billingCtaCreateAccount: string;
    billingCtaPending: string;
    billingCtaPaid: string;
    billingCtaUnavailable: string;
    billingCtaLoading: string;
    billingRequiresAccount: string;
    billingCheckoutError: string;
    billingCheckoutAlreadyActive: string;
    returnBriefKicker: string;
    returnBriefEntryTitle: (mode: string) => string;
    returnBriefEntryBody: (characterName: string) => string;
    returnBriefWinTitle: string;
    returnBriefLossTitle: (winnerLabel: string) => string;
    returnBriefResultBody: (roundNumber: number, roomLabel: string) => string;
    returnBriefRoom: (roomCode: string) => string;
    returnBriefOnlineMatch: string;
    returnModeQuickMatch: string;
    returnModeEndless: string;
    returnModeBotMatch: string;
    returnModeLobby: string;
    botIntensityTitle: string;
    botIntensityHint: string;
    botIntensityOptionLabel: (botCount: number) => string;
    botIntensityOptionDetail: (botCount: number) => string;
    arenaThemeTitle: string;
    arenaThemeHint: string;
    arenaThemeActive: string;
    arenaThemeSummary: (themeId: string, fallback: string) => string;
    localControlsTitle: string;
    localControlsHint: string;
    localControlsMove: string;
    localControlsBomb: string;
    localControlsRemote: string;
    localControlsUltimate: string;
  };
  lobbies: {
    kicker: string;
    title: string;
    create: string;
    joinCodeTitle: string;
    joinCodeHint: string;
    joinCodeUnavailableHint: string;
    joinCodePlaceholder: string;
    joinCodeButton: string;
    joinCodeEmpty: string;
    emptyCount: string;
    count: (count: number) => string;
    emptyBody: string;
    entering: (title: string) => string;
    joinUnavailable: string;
    roomStatusLive: string;
    roomStatusFull: string;
    roomStatusOpen: string;
    freeSeat: (playerId: number) => string;
    filledSeat: (playerId: number) => string;
  };
  setup: {
    kickerQuickMatch: string;
    kickerLoading: string;
    kickerLive: string;
    kickerRoom: string;
    titleQuickMatch: string;
    titleLoading: string;
    loadingDescription: string;
    loadingMetaQuickMatch: string;
    loadingMetaInvite: string;
    loadingPrimarySearching: string;
    loadingPrimaryWaiting: string;
    loadingHint: string;
    loadingOnlineReady: (count: number) => string;
    loadingOnlineWaiting: string;
    loadingQueueStatus: (count: number) => string;
    loadingAutoRoom: string;
    loadingInviteRoom: (roomCode: string) => string;
    loadingEndlessRoom: string;
    loadingCharacterLocked: string;
    loadingCancelSearch: string;
    loadingBackHome: string;
    loadingCancelHint: string;
    loadingBackHomeHint: string;
    description: string;
    roomMeta: (roomCode: string, count: number, max: number) => string;
    roomFull: string;
    roomFilledBeforeEnter: string;
    enterSeat: (playerId: number) => string;
    enterHint: string;
    readyDisabledSolo: string;
    readyWaitingFor: (players: string, count: number) => string;
    readyStarting: string;
    readyButton: string;
    readyHint: string;
    reconnectingHint: string;
    startButton: string;
    forceStartButton: string;
    startHint: string;
    startDisabledNeedPlayers: string;
    forceStartHint: string;
    forceStartDisabledNeedReady: string;
    preparingRoom: string;
    leaveRoom: string;
    copyInvite: string;
  };
  character: {
    readyNote: string;
    pendingNote: string;
    quickMatchNote: string;
    defaultNote: string;
    surpriseAction: string;
    selectable: string;
    defaultSlot: (slot: number) => string;
  };
  controls: {
    kicker: string;
    title: string;
    move: string;
    actions: string;
    bomb: string;
    ultimate: string;
  };
  presence: {
    title: string;
    count: (count: number) => string;
    self: string;
    available: string;
    youLabel: (idLabel: string) => string;
    id: (suffix: string) => string;
  };
  match: {
    invite: string;
    leave: string;
    infoKicker: string;
    infoTitle: string;
    infoCopy: string;
    chatKicker: string;
    chatTitle: string;
    chatEmpty: string;
    chatPlaceholder: string;
    send: string;
    seatOpen: string;
    seatConnected: string;
    liveStatus: string;
    offlineStatus: string;
  };
  status: {
    connecting: string;
    disconnected: string;
    connectionError: string;
    botMatchStarted: (botCount: number) => string;
    createLobbyUnavailable: string;
    creatingLobby: string;
    quickMatchUnavailable: string;
    searchingRoom: string;
    roomFilledBeforeEnter: string;
    enteringSeat: (playerId: number) => string;
    readyMarked: string;
    lobbyActionUnavailable: string;
    inviteCopied: string;
    inviteCopyFailed: string;
    inviteCopyManual: (roomCode: string) => string;
    chatUnavailable: string;
    enteringLobby: string;
    chooseStart: string;
    lobbyLoaded: string;
    returnedHome: string;
    matchStarted: string;
    peerLeft: string;
    creditRewarded: (total: number) => string;
    autoEnteringSeat: (playerId: number) => string;
  };
  canvas: {
    pausedTitle: string;
    pausedSubtitle: string;
    roundStartTitle: (round: number) => string;
    roundStartSubtitle: string;
    arenaRebooting: string;
    doubleKo: string;
    noPoints: string;
    roundWinner: (name: string) => string;
    doubleKoTitle: string;
    timeoutTitle: string;
    matchWinner: (name: string) => string;
    matchComplete: string;
    rematchSummary: string;
    localResultActions: string;
    scoreSummary: (score: string) => string;
    nextRoundCue: (seconds: number) => string;
    matchResultCue: (seconds: number) => string;
    nextMatchCue: (seconds: number) => string;
    rematchYes: string;
    backToLobby: string;
    choiceLocked: string;
    pressToSelect: (keyLabel: string) => string;
  };
}

export const SITE_COPY: Record<SiteLanguage, SiteCopy> = {
  pt: {
    language: {
      portuguese: "PT",
      english: "EN",
    },
    common: {
      back: "Voltar",
      home: "Inicio",
      start: "Pronto para jogar",
      loading: "Carregando",
      waiting: "Aguardando",
      live: "Ao vivo",
      ready: "Pronto",
      leader: "Lider",
      room: "Sala",
      arena: "Arena",
      players: (count, max) => `${count}/${max} jogadores`,
      credits: (count) => `${count} credito${count === 1 ? "" : "s"}`,
    },
    landing: {
      kicker: "Arena online",
      lead: "Arena bomber de navegador para rounds curtos: escolha um personagem, entre no lobby online ou teste contra bots antes de comprar o acesso fundador.",
      commercialProof: [
        "Partida jogavel no browser",
        "Lobby online com quick match",
        "Compra vinculada a conta segura",
      ],
      quickMatch: "Jogar partida rapida",
      quickMatchBusy: "Buscando partida...",
      botMatch: "Testar contra bots",
      enterLobby: "Ver lobbies abertos",
      feedback: "Enviar feedback",
      searching: "Procurando a melhor sala para voce entrar.",
      meta: (queuedRooms, onlineUsers) => `${queuedRooms} salas abertas agora | ${onlineUsers} jogadores online`,
    releaseBadge: "v0.4.4 no ar",
      releaseTitle: "Novidades do patch",
      releaseItems: [
        "Escolha 1, 2 ou 3 bots antes da partida local.",
        "Aviso de rodada, DANGER e pickup recente aparecem no combate.",
        "Convites, lobby, teclado e salvamento local ficaram mais resistentes.",
      ],
      feedbackTitle: "Conte o que achou",
      feedbackPrompt: "Escreva qualquer coisa que possa melhorar o jogo. Pode ser curta ou detalhada.",
      feedbackPlaceholder: "Ex: a navegação da home ficou boa, mas eu senti falta de um atalho para voltar...",
      feedbackSend: "Enviar feedback",
      feedbackCancel: "Cancelar",
      feedbackSending: "Enviando...",
      feedbackThanks: "Feedback enviado.",
      feedbackError: "Nao foi possivel enviar agora.",
      feedbackTimeout: "O envio demorou demais. Seu texto foi preservado; tente novamente.",
      feedbackEmpty: "Escreva alguma coisa antes de enviar.",
      feedbackCharactersRemaining: (remaining) => `${remaining} ${remaining === 1 ? "caractere restante" : "caracteres restantes"}.`,
      feedbackCharactersOverLimit: (overLimitBy, maxLength) => `Remova ${overLimitBy} ${overLimitBy === 1 ? "caractere" : "caracteres"} para enviar. Limite: ${maxLength}.`,
      feedbackTooLong: (maxLength) => `Feedback precisa ter ate ${maxLength} caracteres.`,
      billingKicker: "Early access",
      billingTitleReady: "Plano fundador",
      billingTitlePending: "Checkout iniciado",
      billingTitlePaid: "Acesso fundador ativo",
      billingTitleUnavailable: "Venda controlada em preparo",
      billingStatusLoading: "Verificando status do plano...",
      billingStatusVisitor: "Crie uma conta com e-mail para vincular a compra.",
      billingStatusFree: "Conta gratuita pronta para upgrade.",
      billingStatusPending: "Checkout pendente de confirmacao.",
      billingStatusPaid: "Plano pago confirmado.",
      billingStatusUnavailable: "Checkout ainda nao configurado neste ambiente.",
      billingHintVisitor: "A compra fica ligada ao seu username e libera acesso quando o webhook confirmar.",
      billingHintReady: "O checkout abre em uma pagina externa configurada pelo dono.",
      billingHintPending: "Assim que o pagamento for confirmado, o webhook muda seu acesso automaticamente.",
      billingHintPaid: "Seu acesso pago ja pode ser usado para liberar recursos comerciais.",
      billingHintUnavailable: "Configure BILLING_CHECKOUT_URL e BILLING_WEBHOOK_SECRET no Worker para vender.",
      billingCtaReady: "Abrir checkout",
      billingCtaCreateAccount: "Criar conta para comprar",
      billingCtaPending: "Continuar checkout",
      billingCtaPaid: "Plano ativo",
      billingCtaUnavailable: "Checkout indisponivel",
      billingCtaLoading: "Abrindo...",
      billingRequiresAccount: "Crie uma conta com e-mail antes de abrir o checkout.",
      billingCheckoutError: "Nao foi possivel abrir o checkout agora.",
      billingCheckoutAlreadyActive: "Seu acesso pago ja esta ativo.",
      returnBriefKicker: "Ultima sessao",
      returnBriefEntryTitle: (mode) => `Ultimo atalho: ${mode}`,
      returnBriefEntryBody: (characterName) => `Seu personagem ativo era ${characterName}. A selecao fica pronta para a proxima entrada.`,
      returnBriefWinTitle: "Sua ultima partida terminou em vitoria",
      returnBriefLossTitle: (winnerLabel) => `Ultima partida vencida por ${winnerLabel}`,
      returnBriefResultBody: (roundNumber, roomLabel) => `Round ${roundNumber} em ${roomLabel}. Escolha uma entrada abaixo para jogar de novo.`,
      returnBriefRoom: (roomCode) => `sala ${roomCode}`,
      returnBriefOnlineMatch: "partida online",
      returnModeQuickMatch: "partida rapida",
      returnModeEndless: "partida infinita",
      returnModeBotMatch: "partida contra bots",
      returnModeLobby: "lobby manual",
      botIntensityTitle: "Intensidade local",
      botIntensityHint: "Escolha quantos bots entram antes de comecar.",
      botIntensityOptionLabel: (botCount) => {
        if (botCount === 1) {
          return "Duelo";
        }
        if (botCount === 2) {
          return "Pressao";
        }
        return "Caos";
      },
      botIntensityOptionDetail: (botCount) => {
        if (botCount === 1) {
          return "1 bot rival";
        }
        if (botCount === 2) {
          return "2 bots no mapa";
        }
        return "3 bots, sala cheia";
      },
      arenaThemeTitle: "Tema da arena",
      arenaThemeHint: "Escolha o visual antes de entrar contra bots. A pagina recarrega com os assets certos.",
      arenaThemeActive: "ativo",
      arenaThemeSummary: (themeId, fallback) => {
        const summaries: Record<string, string> = {
          "tournament-clean": "Pedra clara e limpa para ler rotas e explosoes rapido.",
          "arcane-citadel": "Fortaleza azul-cinza com runas discretas e rotas frias.",
          "verdant-ruins": "Ruinas com musgo e pedra quente para uma arena de aventura.",
          "skyfoundry-bastion": "Muralha metalica com rotas ambar e silhuetas pesadas.",
          "royal-marble": "Marmore claro, estrutura azul-marinho e detalhes dourados contidos.",
          "glacier-sanctum": "Santuario gelado de baixo ruido, com selos frios e crates quentes.",
          "obsidian-garden": "Arena vulcanica escura com pontos jade e alto contraste.",
        };
        return summaries[themeId] ?? fallback;
      },
      localControlsTitle: "Antes da primeira bomba",
      localControlsHint: "Objetivo: seja o último bomber vivo. A partida contra bots usa o personagem selecionado ao lado.",
      localControlsMove: "Mover pelo labirinto",
      localControlsBomb: "Colocar bomba",
      localControlsRemote: "Detonar bomba remota",
      localControlsUltimate: "Ativar a ultimate do personagem",
    },
    lobbies: {
      kicker: "Salas abertas",
      title: "Escolha um lobby para entrar",
      create: "Criar lobby",
      joinCodeTitle: "Entrar por codigo",
      joinCodeHint: "Cole um codigo de 6 caracteres ou convite para entrar automaticamente. Se digitar, pressione Enter.",
      joinCodeUnavailableHint: "Reconectando ao lobby. A entrada por codigo volta em instantes.",
      joinCodePlaceholder: "Codigo ou link da sala",
      joinCodeButton: "Entrar",
      joinCodeEmpty: "Cole um codigo ou convite valido para entrar.",
      emptyCount: "Nenhum lobby aberto no momento.",
      count: (count) => `${count} lobbies publicos disponiveis`,
      emptyBody: "Nenhuma sala aberta agora. Crie um lobby novo ou volte para partida rapida.",
      entering: (title) => `Entrando em ${title}...`,
      joinUnavailable: "Nao foi possivel entrar no lobby agora.",
      roomStatusLive: "Ao vivo",
      roomStatusFull: "Sala cheia",
      roomStatusOpen: "Pronto para entrar",
      freeSeat: (playerId) => `P${playerId} livre`,
      filledSeat: (playerId) => `P${playerId}`,
    },
    setup: {
      kickerQuickMatch: "Partida rapida",
      kickerLoading: "Entrando no lobby",
      kickerLive: "Partida ao vivo",
      kickerRoom: "Setup da sala",
      titleQuickMatch: "Buscando sala",
      titleLoading: "Carregando sala",
      loadingDescription: "Escolha seu bomber enquanto preparamos a proxima arena.",
      loadingMetaQuickMatch: "Voce entra em uma sala existente ou cria uma nova automaticamente.",
      loadingMetaInvite: "Reconectando ou entrando por convite.",
      loadingPrimarySearching: "Buscando...",
      loadingPrimaryWaiting: "Aguardando...",
      loadingHint: "Os comandos abaixo ja funcionam assim que a sala abrir.",
      loadingOnlineReady: (count) => `${count} jogadores online detectados`,
      loadingOnlineWaiting: "Conectando ao lobby global",
      loadingQueueStatus: (count) => `${count} na fila de partida rapida`,
      loadingAutoRoom: "Criando ou encontrando sala publica",
      loadingInviteRoom: (roomCode) => `Entrando por convite ${roomCode}`,
      loadingEndlessRoom: "Entrando na arena infinita ao vivo",
      loadingCharacterLocked: "Personagem escolhido ja reservado",
      loadingCancelSearch: "Cancelar busca",
      loadingBackHome: "Voltar ao inicio",
      loadingCancelHint: "Cancela a fila e mantem seu personagem escolhido para a proxima tentativa.",
      loadingBackHomeHint: "Volta para o inicio sem trocar personagem ou configuracao local.",
      description: "Escolha seu personagem e entre na partida sem atrito.",
      roomMeta: (roomCode, count, max) => `${roomCode} | ${count}/${max} jogadores`,
      roomFull: "Sala cheia",
      roomFilledBeforeEnter: "A sala ficou cheia antes da sua entrada.",
      enterSeat: (playerId) => `Entrar na vaga P${playerId}`,
      enterHint: "A entrada na vaga livre acontece com um clique.",
      readyDisabledSolo: "Sua vaga esta pronta. Falta mais gente para iniciar.",
      readyWaitingFor: (players, count) => count === 1
        ? `Ainda precisa marcar pronto: ${players}.`
        : `Ainda precisam marcar pronto: ${players}.`,
      readyStarting: "Todos estao prontos. Iniciando partida...",
      readyButton: "Pronto para jogar",
      readyHint: "Seu personagem escolhido ja sera usado na vaga atual.",
      reconnectingHint: "Reconectando ao lobby. A acao volta assim que o backend responder.",
      startButton: "Comecar partida",
      forceStartButton: "Forcar inicio",
      startHint: "Como lider da sala, voce pode iniciar assim que houver 2 ou mais jogadores.",
      startDisabledNeedPlayers: "O lider so pode iniciar quando a sala tiver pelo menos 2 jogadores.",
      forceStartHint: "Todos os jogadores atuais estao prontos. Qualquer pessoa pode forcar o inicio.",
      forceStartDisabledNeedReady: "Para forcar o inicio com menos de 4 jogadores, todos os ocupantes precisam estar prontos.",
      preparingRoom: "Preparando sala...",
      leaveRoom: "Sair",
      copyInvite: "Copiar convite",
    },
    character: {
      readyNote: "Voce ja esta pronto. O personagem continua aplicado nessa sala.",
      pendingNote: "Esse personagem sera aplicado assim que voce ficar pronto.",
      quickMatchNote: "Partida rapida so te coloca em uma sala. O inicio continua sendo decidido dentro do lobby.",
      defaultNote: "Escolha agora e entre no setup com tudo explicado na mesma tela.",
      surpriseAction: "Surpreenda-me",
      selectable: "Selecionavel",
      defaultSlot: (slot) => `Default P${slot}`,
    },
    controls: {
      kicker: "Comandos",
      title: "Jogue com WASD ou com as setas",
      move: "Mover",
      actions: "Acoes",
      bomb: "Soltar bomba",
      ultimate: "Ultimate do personagem",
    },
    presence: {
      title: "Jogadores online",
      count: (count) => `${count} conectados agora`,
      self: "Voce esta online",
      available: "Disponivel para entrar",
      youLabel: (idLabel) => `Voce | ${idLabel}`,
      id: (suffix) => `ID ${suffix}`,
    },
    match: {
      invite: "Convite",
      leave: "Sair da partida",
      infoKicker: "Sala",
      infoTitle: "BOMBA PVP",
      infoCopy: "Ganhe 2 rounds para ser campeao. Se alguem sair, o bomber dela cai e a partida continua.",
      chatKicker: "Chat da sala",
      chatTitle: "Fale com quem esta jogando",
      chatEmpty: "O chat aparece aqui durante a sala e a partida.",
      chatPlaceholder: "Escreva uma mensagem",
      send: "Enviar",
      seatOpen: "Vaga livre",
      seatConnected: "Jogador conectado",
      liveStatus: "Partida ao vivo",
      offlineStatus: "Partida contra bots",
    },
    status: {
      connecting: "Conectando ao lobby global...",
      disconnected: "Conexao perdida. Reconectando...",
      connectionError: "Erro de conexao. Tentando novamente...",
      botMatchStarted: (botCount) => `Partida contra ${botCount} ${botCount === 1 ? "bot" : "bots"} iniciada.`,
      createLobbyUnavailable: "Nao foi possivel criar a sala agora.",
      creatingLobby: "Criando um lobby novo...",
      quickMatchUnavailable: "Quick match indisponivel. Reconectando...",
      searchingRoom: "Entrando na melhor sala disponivel...",
      roomFilledBeforeEnter: "Essa sala lotou antes da entrada.",
      enteringSeat: (playerId) => `Entrando na vaga P${playerId}...`,
      readyMarked: "Tudo certo. Sua vaga foi marcada como pronta.",
      lobbyActionUnavailable: "Conexao do lobby indisponivel. Reconectando...",
      inviteCopied: "Convite copiado.",
      inviteCopyFailed: "Nao foi possivel copiar o convite.",
      inviteCopyManual: (roomCode) => `Nao foi possivel copiar. Compartilhe o codigo ${roomCode}.`,
      chatUnavailable: "Chat indisponivel no momento.",
      enteringLobby: "Entrando no lobby...",
      chooseStart: "Escolha partida rapida, bots ou entre em um lobby.",
      lobbyLoaded: "Sala carregada. Revise o personagem e entre pronto.",
      returnedHome: "Voce voltou para a entrada do jogo.",
      matchStarted: "Partida iniciada.",
      peerLeft: "Um jogador saiu. O bomber dele foi eliminado.",
      creditRewarded: (total) => `Voce ganhou +1 credito. Total: ${total}.`,
      autoEnteringSeat: (playerId) => `Entrando automaticamente na vaga P${playerId}...`,
    },
    canvas: {
      pausedTitle: "PAUSADO",
      pausedSubtitle: "Esc: continuar",
      roundStartTitle: (round) => `RODADA ${round}`,
      roundStartSubtitle: "Objetivo: elimine os rivais com bombas e seja o ultimo bomber vivo. Primeiro a 2 vitorias.",
      arenaRebooting: "Ponto garantido. Arena reiniciando...",
      doubleKo: "Ninguem pontua.",
      noPoints: "Nenhum ponto foi marcado.",
      roundWinner: (name) => `${name} venceu a rodada.`,
      doubleKoTitle: "Eliminacao simultanea.",
      timeoutTitle: "Tempo esgotado.",
      matchWinner: (name) => `${name} venceu a partida!`,
      matchComplete: "Partida encerrada",
      rematchSummary: "Proxima partida iniciando automaticamente...",
      localResultActions: "Enter/Espaco: jogar novamente | Esc: voltar ao menu",
      scoreSummary: (score) => `Placar: ${score}`,
      nextRoundCue: (seconds) => `Proxima rodada em ${seconds}s`,
      matchResultCue: (seconds) => `Resultado final em ${seconds}s`,
      nextMatchCue: (seconds) => `Nova partida em ${seconds}s`,
      rematchYes: "Sim",
      backToLobby: "Voltar ao lobby",
      choiceLocked: "Escolha travada",
      pressToSelect: (keyLabel) => `Pressione ${keyLabel} para escolher`,
    },
  },
  en: {
    language: {
      portuguese: "PT",
      english: "EN",
    },
    common: {
      back: "Back",
      home: "Home",
      start: "Ready to play",
      loading: "Loading",
      waiting: "Waiting",
      live: "Live",
      ready: "Ready",
      leader: "Leader",
      room: "Room",
      arena: "Arena",
      players: (count, max) => `${count}/${max} players`,
      credits: (count) => `${count} credit${count === 1 ? "" : "s"}`,
    },
    landing: {
      kicker: "Online arena",
      lead: "Browser bomber arena for short competitive rounds: pick a character, join the online lobby, or test against bots before buying founder access.",
      commercialProof: [
        "Playable in the browser",
        "Online lobby with quick match",
        "Purchase tied to a secure account",
      ],
      quickMatch: "Play quick match",
      quickMatchBusy: "Finding match...",
      botMatch: "Try vs bots",
      enterLobby: "View open lobbies",
      feedback: "Send feedback",
      searching: "Looking for the best room for you.",
      meta: (queuedRooms, onlineUsers) => `${queuedRooms} open rooms right now | ${onlineUsers} players online`,
    releaseBadge: "v0.4.4 live",
      releaseTitle: "Patch highlights",
      releaseItems: [
        "Choose 1, 2, or 3 bots before a local match.",
        "Round cue, DANGER, and recent pickup feedback now show in combat.",
        "Invites, lobby actions, keyboard flow, and local saves are more resilient.",
      ],
      feedbackTitle: "Tell us what you think",
      feedbackPrompt: "Write anything that could improve the game. Short or detailed is fine.",
      feedbackPlaceholder: "Example: the home flow feels good, but I wanted a faster way back...",
      feedbackSend: "Send feedback",
      feedbackCancel: "Cancel",
      feedbackSending: "Sending...",
      feedbackThanks: "Feedback sent.",
      feedbackError: "Could not send feedback right now.",
      feedbackTimeout: "Sending took too long. Your text was preserved; try again.",
      feedbackEmpty: "Write something before sending.",
      feedbackCharactersRemaining: (remaining) => `${remaining} ${remaining === 1 ? "character" : "characters"} remaining.`,
      feedbackCharactersOverLimit: (overLimitBy, maxLength) => `Remove ${overLimitBy} ${overLimitBy === 1 ? "character" : "characters"} to send. Limit: ${maxLength}.`,
      feedbackTooLong: (maxLength) => `Feedback must be ${maxLength} characters or fewer.`,
      billingKicker: "Early access",
      billingTitleReady: "Founder plan",
      billingTitlePending: "Checkout started",
      billingTitlePaid: "Founder access active",
      billingTitleUnavailable: "Controlled sales in setup",
      billingStatusLoading: "Checking plan status...",
      billingStatusVisitor: "Create an email account to attach the purchase.",
      billingStatusFree: "Free account ready for upgrade.",
      billingStatusPending: "Checkout waiting for confirmation.",
      billingStatusPaid: "Paid plan confirmed.",
      billingStatusUnavailable: "Checkout is not configured in this environment.",
      billingHintVisitor: "The purchase attaches to your username and unlocks access after the webhook confirms it.",
      billingHintReady: "Checkout opens on an external page configured by the owner.",
      billingHintPending: "When payment is confirmed, the webhook updates your access automatically.",
      billingHintPaid: "Your paid access can now unlock commercial features.",
      billingHintUnavailable: "Set BILLING_CHECKOUT_URL and BILLING_WEBHOOK_SECRET on the Worker to sell.",
      billingCtaReady: "Open checkout",
      billingCtaCreateAccount: "Create account to buy",
      billingCtaPending: "Continue checkout",
      billingCtaPaid: "Plan active",
      billingCtaUnavailable: "Checkout unavailable",
      billingCtaLoading: "Opening...",
      billingRequiresAccount: "Create an email account before opening checkout.",
      billingCheckoutError: "Could not open checkout right now.",
      billingCheckoutAlreadyActive: "Your paid access is already active.",
      returnBriefKicker: "Last session",
      returnBriefEntryTitle: (mode) => `Last shortcut: ${mode}`,
      returnBriefEntryBody: (characterName) => `${characterName} was your active character. The selection is ready for the next entry.`,
      returnBriefWinTitle: "Your last match ended in a win",
      returnBriefLossTitle: (winnerLabel) => `Last match won by ${winnerLabel}`,
      returnBriefResultBody: (roundNumber, roomLabel) => `Round ${roundNumber} in ${roomLabel}. Choose an entry below to play again.`,
      returnBriefRoom: (roomCode) => `room ${roomCode}`,
      returnBriefOnlineMatch: "online match",
      returnModeQuickMatch: "quick match",
      returnModeEndless: "endless match",
      returnModeBotMatch: "match vs bots",
      returnModeLobby: "manual lobby",
      botIntensityTitle: "Local intensity",
      botIntensityHint: "Choose how many bots join before starting.",
      botIntensityOptionLabel: (botCount) => {
        if (botCount === 1) {
          return "Duel";
        }
        if (botCount === 2) {
          return "Pressure";
        }
        return "Chaos";
      },
      botIntensityOptionDetail: (botCount) => {
        if (botCount === 1) {
          return "1 rival bot";
        }
        if (botCount === 2) {
          return "2 bots on map";
        }
        return "3 bots, full room";
      },
      arenaThemeTitle: "Arena theme",
      arenaThemeHint: "Choose the board look before entering bots. The page reloads with the right assets.",
      arenaThemeActive: "active",
      arenaThemeSummary: (_themeId, fallback) => fallback,
      localControlsTitle: "Before the first bomb",
      localControlsHint: "Objective: be the last bomber alive. Bot matches use the character selected on the side.",
      localControlsMove: "Move through the maze",
      localControlsBomb: "Place bomb",
      localControlsRemote: "Detonate remote bomb",
      localControlsUltimate: "Activate the character ultimate",
    },
    lobbies: {
      kicker: "Open rooms",
      title: "Choose a lobby to join",
      create: "Create lobby",
      joinCodeTitle: "Join by code",
      joinCodeHint: "Paste a 6-character room code or invite to join automatically. If typing, press Enter.",
      joinCodeUnavailableHint: "Reconnecting to the lobby. Code entry returns in a moment.",
      joinCodePlaceholder: "Room code or invite link",
      joinCodeButton: "Join",
      joinCodeEmpty: "Paste a valid room code or invite to join.",
      emptyCount: "No open lobbies right now.",
      count: (count) => `${count} public lobbies available`,
      emptyBody: "No room is open right now. Create a new lobby or go back to quick match.",
      entering: (title) => `Joining ${title}...`,
      joinUnavailable: "Could not join the lobby right now.",
      roomStatusLive: "Live",
      roomStatusFull: "Room full",
      roomStatusOpen: "Ready to join",
      freeSeat: (playerId) => `P${playerId} open`,
      filledSeat: (playerId) => `P${playerId}`,
    },
    setup: {
      kickerQuickMatch: "Quick match",
      kickerLoading: "Joining lobby",
      kickerLive: "Live match",
      kickerRoom: "Room setup",
      titleQuickMatch: "Finding room",
      titleLoading: "Loading room",
      loadingDescription: "Pick your bomber while we prepare the next arena.",
      loadingMetaQuickMatch: "You join an existing room or create a new one automatically.",
      loadingMetaInvite: "Reconnecting or joining by invite.",
      loadingPrimarySearching: "Searching...",
      loadingPrimaryWaiting: "Waiting...",
      loadingHint: "The controls below already work as soon as the room opens.",
      loadingOnlineReady: (count) => `${count} players online detected`,
      loadingOnlineWaiting: "Connecting to the global lobby",
      loadingQueueStatus: (count) => `${count} in quick match queue`,
      loadingAutoRoom: "Creating or finding a public room",
      loadingInviteRoom: (roomCode) => `Joining invite ${roomCode}`,
      loadingEndlessRoom: "Entering the live endless arena",
      loadingCharacterLocked: "Selected character already reserved",
      loadingCancelSearch: "Cancel search",
      loadingBackHome: "Back to start",
      loadingCancelHint: "Cancels the queue and keeps your selected character for the next try.",
      loadingBackHomeHint: "Returns to start without changing character or local settings.",
      description: "Pick your character and get into the match without friction.",
      roomMeta: (roomCode, count, max) => `${roomCode} | ${count}/${max} players`,
      roomFull: "Room full",
      roomFilledBeforeEnter: "The room filled before you could join.",
      enterSeat: (playerId) => `Join seat P${playerId}`,
      enterHint: "Joining the first open slot takes one click.",
      readyDisabledSolo: "Your seat is ready. More players are still needed to start.",
      readyWaitingFor: (players, count) => count === 1
        ? `Still needs to ready up: ${players}.`
        : `Still need to ready up: ${players}.`,
      readyStarting: "Everyone is ready. Starting match...",
      readyButton: "Ready to play",
      readyHint: "Your selected character will be used in this seat.",
      reconnectingHint: "Reconnecting to the lobby. This action returns when the backend responds.",
      startButton: "Start match",
      forceStartButton: "Force start",
      startHint: "As the room leader, you can start once there are 2 or more players.",
      startDisabledNeedPlayers: "The room leader can only start once at least 2 players are in the room.",
      forceStartHint: "Everyone currently in the room is ready. Any player can force the start.",
      forceStartDisabledNeedReady: "To force start with fewer than 4 players, every occupied seat must be ready.",
      preparingRoom: "Preparing room...",
      leaveRoom: "Leave",
      copyInvite: "Copy invite",
    },
    character: {
      readyNote: "You are already ready. Your character stays applied in this room.",
      pendingNote: "This character will be applied as soon as you ready up.",
      quickMatchNote: "Quick match only places you into a room. Match start is still decided inside the lobby.",
      defaultNote: "Pick now and enter setup with everything explained on one screen.",
      surpriseAction: "Surprise me",
      selectable: "Selectable",
      defaultSlot: (slot) => `Default P${slot}`,
    },
    controls: {
      kicker: "Controls",
      title: "Play with WASD or arrow keys",
      move: "Move",
      actions: "Actions",
      bomb: "Drop bomb",
      ultimate: "Character ultimate",
    },
    presence: {
      title: "Players online",
      count: (count) => `${count} connected right now`,
      self: "You are online",
      available: "Available to join",
      youLabel: (idLabel) => `You | ${idLabel}`,
      id: (suffix) => `ID ${suffix}`,
    },
    match: {
      invite: "Invite",
      leave: "Leave match",
      infoKicker: "Room",
      infoTitle: "BOMBA PVP",
      infoCopy: "Win 2 rounds to become champion. If someone leaves, their bomber drops and the match keeps going.",
      chatKicker: "Room chat",
      chatTitle: "Talk to the players in the match",
      chatEmpty: "Room chat appears here during the lobby and the match.",
      chatPlaceholder: "Write a message",
      send: "Send",
      seatOpen: "Open seat",
      seatConnected: "Connected player",
      liveStatus: "Live match",
      offlineStatus: "Bot match live",
    },
    status: {
      connecting: "Connecting to the global lobby...",
      disconnected: "Connection lost. Reconnecting...",
      connectionError: "Connection error. Trying again...",
      botMatchStarted: (botCount) => `Bot match with ${botCount} ${botCount === 1 ? "bot" : "bots"} started.`,
      createLobbyUnavailable: "Could not create a room right now.",
      creatingLobby: "Creating a new lobby...",
      quickMatchUnavailable: "Quick match is unavailable. Reconnecting...",
      searchingRoom: "Joining the best available room...",
      roomFilledBeforeEnter: "That room filled up before you could enter.",
      enteringSeat: (playerId) => `Joining seat P${playerId}...`,
      readyMarked: "All set. Your seat is now marked ready.",
      lobbyActionUnavailable: "Lobby connection is unavailable. Reconnecting...",
      inviteCopied: "Invite copied.",
      inviteCopyFailed: "Could not copy the invite.",
      inviteCopyManual: (roomCode) => `Could not copy. Share room code ${roomCode}.`,
      chatUnavailable: "Chat is unavailable right now.",
      enteringLobby: "Joining lobby...",
      chooseStart: "Choose quick match, bots, or join a lobby.",
      lobbyLoaded: "Room loaded. Review your character and get ready.",
      returnedHome: "You returned to the game home screen.",
      matchStarted: "Match started.",
      peerLeft: "A player left. Their bomber was eliminated.",
      creditRewarded: (total) => `You earned +1 credit. Total: ${total}.`,
      autoEnteringSeat: (playerId) => `Auto-joining seat P${playerId}...`,
    },
    canvas: {
      pausedTitle: "PAUSED",
      pausedSubtitle: "Esc: resume",
      roundStartTitle: (round) => `ROUND ${round}`,
      roundStartSubtitle: "Objective: eliminate rivals with bombs and be the last bomber alive. First to 2 wins.",
      arenaRebooting: "Point secured. Arena rebooting...",
      doubleKo: "No one scores.",
      noPoints: "No points awarded.",
      roundWinner: (name) => `${name} wins the round.`,
      doubleKoTitle: "Double KO.",
      timeoutTitle: "Time expired.",
      matchWinner: (name) => `${name} wins the match!`,
      matchComplete: "Match complete",
      rematchSummary: "Next match starting automatically...",
      localResultActions: "Enter/Space: play again | Esc: back to menu",
      scoreSummary: (score) => `Score: ${score}`,
      nextRoundCue: (seconds) => `Next round in ${seconds}s`,
      matchResultCue: (seconds) => `Final result in ${seconds}s`,
      nextMatchCue: (seconds) => `New match in ${seconds}s`,
      rematchYes: "Yes",
      backToLobby: "Back to lobby",
      choiceLocked: "Choice locked",
      pressToSelect: (keyLabel) => `Press ${keyLabel} to select`,
    },
  },
};

export function getStoredSiteLanguage(): SiteLanguage | null {
  return normalizeSiteLanguage(readLocalStorageItem(SITE_LANGUAGE_STORAGE_KEY));
}

export function getPathSiteLanguage(pathname?: string): SiteLanguage | null {
  const rawPathname =
    pathname
    ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const [firstSegment] = rawPathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return normalizeSiteLanguage(firstSegment);
}

export function detectSiteLanguage(): SiteLanguage {
  // Domain-based default: bombpvp.com (no 'a') → English, bombapvp.com → Portuguese
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "bombpvp.com" || hostname.endsWith(".bombpvp.com")) {
      return "en";
    }
    if (hostname === "bombapvp.com" || hostname.endsWith(".bombapvp.com")) {
      return "pt";
    }
  }
  if (typeof navigator === "undefined") {
    return "pt";
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  return candidates.some((value) => value.toLowerCase().startsWith("pt")) ? "pt" : "en";
}

export function getInitialSiteLanguage(): SiteLanguage {
  return getPathSiteLanguage() ?? getStoredSiteLanguage() ?? detectSiteLanguage();
}

export function persistSiteLanguage(language: SiteLanguage): void {
  writeLocalStorageItem(SITE_LANGUAGE_STORAGE_KEY, language);
}

export function normalizeSiteLanguage(value: string | null | undefined): SiteLanguage | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("pt")) {
    return "pt";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return null;
}

export function getLocalizedPathname(language: SiteLanguage, pathname?: string): string {
  const rawPathname =
    pathname
    ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const segments = rawPathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length > 0 && normalizeSiteLanguage(segments[0])) {
    segments.shift();
  }
  if (language === "en") {
    segments.unshift("en");
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function buildLocalizedUrl(language: SiteLanguage, href?: string): URL {
  const baseHref =
    href
    ?? (typeof window !== "undefined" ? window.location.href : "https://example.com/");
  const url = new URL(baseHref);
  url.pathname = getLocalizedPathname(language, url.pathname);
  return url;
}

export function applyDocumentLanguage(language: SiteLanguage): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
}
