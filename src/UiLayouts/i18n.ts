export type SiteLanguage = "pt" | "en";

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
    quickMatch: string;
    quickMatchBusy: string;
    botMatch: string;
    enterLobby: string;
    feedback: string;
    searching: string;
    meta: (queuedRooms: number, onlineUsers: number) => string;
    feedbackTitle: string;
    feedbackPrompt: string;
    feedbackPlaceholder: string;
    feedbackSend: string;
    feedbackCancel: string;
    feedbackSending: string;
    feedbackThanks: string;
    feedbackError: string;
  };
  lobbies: {
    kicker: string;
    title: string;
    create: string;
    emptyCount: string;
    count: (count: number) => string;
    emptyBody: string;
    entering: (title: string) => string;
    joinUnavailable: string;
    roomStatusLive: string;
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
    description: string;
    roomMeta: (roomCode: string, count: number, max: number) => string;
    roomFull: string;
    roomFilledBeforeEnter: string;
    enterSeat: (playerId: number) => string;
    enterHint: string;
    readyDisabledSolo: string;
    readyDisabledQueue: string;
    readyButton: string;
    readyHint: string;
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
    botMatchStarted: string;
    createLobbyUnavailable: string;
    creatingLobby: string;
    quickMatchUnavailable: string;
    searchingRoom: string;
    roomFilledBeforeEnter: string;
    enteringSeat: (playerId: number) => string;
    readyMarked: string;
    inviteCopied: string;
    inviteCopyFailed: string;
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
    arenaRebooting: string;
    doubleKo: string;
    noPoints: string;
    matchWinner: (name: string) => string;
    matchComplete: string;
    rematchSummary: string;
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
      lead: "Entre, escolha um bomber e entenda o jogo em segundos.",
      quickMatch: "Partida rapida",
      quickMatchBusy: "Buscando partida...",
      botMatch: "Partida contra bots",
      enterLobby: "Entrar em lobby",
      feedback: "Dar feedback",
      searching: "Procurando a melhor sala para voce entrar.",
      meta: (queuedRooms, onlineUsers) => `${queuedRooms} salas abertas agora | ${onlineUsers} jogadores online`,
      feedbackTitle: "Conte o que achou",
      feedbackPrompt: "Escreva qualquer coisa que possa melhorar o jogo. Pode ser curta ou detalhada.",
      feedbackPlaceholder: "Ex: a navegação da home ficou boa, mas eu senti falta de um atalho para voltar...",
      feedbackSend: "Enviar feedback",
      feedbackCancel: "Cancelar",
      feedbackSending: "Enviando...",
      feedbackThanks: "Feedback enviado.",
      feedbackError: "Nao foi possivel enviar agora.",
    },
    lobbies: {
      kicker: "Salas abertas",
      title: "Escolha um lobby para entrar",
      create: "Criar lobby",
      emptyCount: "Nenhum lobby aberto no momento.",
      count: (count) => `${count} lobbies publicos disponiveis`,
      emptyBody: "Nenhuma sala aberta agora. Crie um lobby novo ou volte para partida rapida.",
      entering: (title) => `Entrando em ${title}...`,
      joinUnavailable: "Nao foi possivel entrar no lobby agora.",
      roomStatusLive: "Ao vivo",
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
      description: "Escolha seu personagem e entre na partida sem atrito.",
      roomMeta: (roomCode, count, max) => `${roomCode} | ${count}/${max} jogadores`,
      roomFull: "Sala cheia",
      roomFilledBeforeEnter: "A sala ficou cheia antes da sua entrada.",
      enterSeat: (playerId) => `Entrar na vaga P${playerId}`,
      enterHint: "A entrada na vaga livre acontece com um clique.",
      readyDisabledSolo: "Sua vaga esta pronta. Falta mais gente para iniciar.",
      readyDisabledQueue: "Tudo certo. A partida comeca assim que o servidor iniciar o match.",
      readyButton: "Pronto para jogar",
      readyHint: "Seu personagem escolhido ja sera usado na vaga atual.",
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
      botMatchStarted: "Partida contra bots iniciada.",
      createLobbyUnavailable: "Nao foi possivel criar a sala agora.",
      creatingLobby: "Criando um lobby novo...",
      quickMatchUnavailable: "Quick match indisponivel. Reconectando...",
      searchingRoom: "Entrando na melhor sala disponivel...",
      roomFilledBeforeEnter: "Essa sala lotou antes da entrada.",
      enteringSeat: (playerId) => `Entrando na vaga P${playerId}...`,
      readyMarked: "Tudo certo. Sua vaga foi marcada como pronta.",
      inviteCopied: "Convite copiado.",
      inviteCopyFailed: "Nao foi possivel copiar o convite.",
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
      pausedSubtitle: "Pressione Esc para continuar.",
      arenaRebooting: "Arena reiniciando...",
      doubleKo: "Dois nucleos explodiram.",
      noPoints: "Nenhum ponto foi marcado.",
      matchWinner: (name) => `${name} venceu a partida!`,
      matchComplete: "Partida encerrada",
      rematchSummary: "Proxima partida iniciando automaticamente...",
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
      lead: "Jump in, pick a bomber, and understand the game in seconds.",
      quickMatch: "Quick match",
      quickMatchBusy: "Finding match...",
      botMatch: "Match vs bots",
      enterLobby: "Enter lobby",
      feedback: "Leave feedback",
      searching: "Looking for the best room for you.",
      meta: (queuedRooms, onlineUsers) => `${queuedRooms} open rooms right now | ${onlineUsers} players online`,
      feedbackTitle: "Tell us what you think",
      feedbackPrompt: "Write anything that could improve the game. Short or detailed is fine.",
      feedbackPlaceholder: "Example: the home flow feels good, but I wanted a faster way back...",
      feedbackSend: "Send feedback",
      feedbackCancel: "Cancel",
      feedbackSending: "Sending...",
      feedbackThanks: "Feedback sent.",
      feedbackError: "Could not send feedback right now.",
    },
    lobbies: {
      kicker: "Open rooms",
      title: "Choose a lobby to join",
      create: "Create lobby",
      emptyCount: "No open lobbies right now.",
      count: (count) => `${count} public lobbies available`,
      emptyBody: "No room is open right now. Create a new lobby or go back to quick match.",
      entering: (title) => `Joining ${title}...`,
      joinUnavailable: "Could not join the lobby right now.",
      roomStatusLive: "Live",
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
      description: "Pick your character and get into the match without friction.",
      roomMeta: (roomCode, count, max) => `${roomCode} | ${count}/${max} players`,
      roomFull: "Room full",
      roomFilledBeforeEnter: "The room filled before you could join.",
      enterSeat: (playerId) => `Join seat P${playerId}`,
      enterHint: "Joining the first open slot takes one click.",
      readyDisabledSolo: "Your seat is ready. More players are still needed to start.",
      readyDisabledQueue: "All set. The match starts as soon as the server launches it.",
      readyButton: "Ready to play",
      readyHint: "Your selected character will be used in this seat.",
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
      botMatchStarted: "Bot match started.",
      createLobbyUnavailable: "Could not create a room right now.",
      creatingLobby: "Creating a new lobby...",
      quickMatchUnavailable: "Quick match is unavailable. Reconnecting...",
      searchingRoom: "Joining the best available room...",
      roomFilledBeforeEnter: "That room filled up before you could enter.",
      enteringSeat: (playerId) => `Joining seat P${playerId}...`,
      readyMarked: "All set. Your seat is now marked ready.",
      inviteCopied: "Invite copied.",
      inviteCopyFailed: "Could not copy the invite.",
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
      pausedSubtitle: "Press Esc to resume.",
      arenaRebooting: "Arena rebooting...",
      doubleKo: "Both cores overloaded.",
      noPoints: "No points awarded.",
      matchWinner: (name) => `${name} wins the match!`,
      matchComplete: "Match complete",
      rematchSummary: "Next match starting automatically...",
      rematchYes: "Yes",
      backToLobby: "Back to lobby",
      choiceLocked: "Choice locked",
      pressToSelect: (keyLabel) => `Press ${keyLabel} to select`,
    },
  },
};

export function getStoredSiteLanguage(): SiteLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
  return normalizeSiteLanguage(stored);
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
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, language);
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
