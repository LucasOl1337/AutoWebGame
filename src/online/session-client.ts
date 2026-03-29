import type { CharacterRosterEntry } from "../app/assets";
import { assetUrl } from "../app/asset-url";
import { ALL_PLAYER_IDS } from "../core/types";
import type { Mode, PlayerId } from "../core/types";
import type {
  LobbyState,
  LobbySummary,
  OnlineGameFrame,
  MatchStartConfig,
  OnlineGameSnapshot,
  OnlineInputState,
  OnlinePresenceEntry,
  OnlineRole,
  OnlineSessionBridge,
  ServerMessage,
} from "./protocol";
import { GrowthTelemetryClient } from "./growth-telemetry";

interface OnlineGameAppBridge {
  attachOnlineSession(session: OnlineSessionBridge): void;
  detachOnlineSession(): void;
  startOnlineMatch(config: MatchStartConfig): void;
  startOfflineBotMatch(botFill?: number): void;
  setOfflinePreferredCharacter(characterIndex: number): void;
  getCurrentMode(): Mode;
  applyOnlineFrame(frame: OnlineGameFrame): void;
  applyOnlineSnapshot(snapshot: OnlineGameSnapshot): void;
  clearOnlinePeer(): void;
  receiveOnlineGuestInput(input: OnlineInputState): void;
}

type ExperienceScreen = "landing" | "lobby-list" | "setup" | "match";
type IdleScreen = "landing" | "lobby-list";

interface SessionElements {
  shell: HTMLDivElement;
  screens: Record<ExperienceScreen, HTMLElement>;
  landingMeta: HTMLParagraphElement;
  landingQuickMatchButton: HTMLButtonElement;
  landingBotMatchButton: HTMLButtonElement;
  landingLobbyButton: HTMLButtonElement;
  landingRoster: HTMLDivElement;
  lobbyListBackButton: HTMLButtonElement;
  lobbyListCreateButton: HTMLButtonElement;
  lobbyListCount: HTMLParagraphElement;
  lobbyListList: HTMLDivElement;
  setupBackButton: HTMLButtonElement;
  setupLeaveButton: HTMLButtonElement;
  setupCopyButton: HTMLButtonElement;
  setupEyebrow: HTMLParagraphElement;
  setupTitle: HTMLHeadingElement;
  setupDescription: HTMLParagraphElement;
  setupRoomMeta: HTMLParagraphElement;
  setupSeatStrip: HTMLDivElement;
  setupPresenceList: HTMLDivElement;
  selectorPortrait: HTMLImageElement;
  selectorName: HTMLParagraphElement;
  selectorNote: HTMLParagraphElement;
  selectorGrid: HTMLDivElement;
  setupPrimaryButton: HTMLButtonElement;
  setupPrimaryHint: HTMLParagraphElement;
  matchViewport: HTMLDivElement;
  matchCode: HTMLSpanElement;
  matchStatus: HTMLParagraphElement;
  matchCopyButton: HTMLButtonElement;
  matchLeaveButton: HTMLButtonElement;
  matchRoster: HTMLDivElement;
  matchChatLog: HTMLDivElement;
  matchChatInput: HTMLInputElement;
  matchChatSend: HTMLButtonElement;
  status: HTMLParagraphElement;
}

const LOBBY_MAX_PLAYERS = 4;
const DEFAULT_LOBBY_TITLE = "BOMBA PVP";

export class OnlineSessionClient implements OnlineSessionBridge {
  public role: OnlineRole | null = null;
  public roomCode: string | null = null;

  private readonly app: OnlineGameAppBridge;
  private readonly roster: CharacterRosterEntry[];
  private readonly elements: SessionElements;
  private readonly canvasObserver: MutationObserver;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private clientId: string | null = null;
  private lobbies: LobbySummary[] = [];
  private currentLobby: LobbyState | null = null;
  private pendingAutoJoinRoom: string | null;
  private reconnectAttempts = 0;
  private quickMatchSearching = false;
  private quickMatchQueuedCount = 0;
  private onlineUsers = 0;
  private onlinePlayers: OnlinePresenceEntry[] = [];
  private preferredCharacterIndex = 0;
  private idleScreen: IdleScreen = "landing";
  private autoClaimRoomCode: string | null = null;
  private readonly telemetry: GrowthTelemetryClient;
  private observedMatchWinner: PlayerId | null = null;

  constructor(root: HTMLElement, app: OnlineGameAppBridge, roster: CharacterRosterEntry[]) {
    this.app = app;
    this.roster = roster;
    this.pendingAutoJoinRoom = this.readRoomFromLocation();
    this.preferredCharacterIndex = this.readPreferredCharacterIndex();
    this.telemetry = new GrowthTelemetryClient();
    this.elements = this.render(root);
    this.canvasObserver = new MutationObserver(() => this.mountCanvas(root));
    this.canvasObserver.observe(root, { childList: true });
    this.mountCanvas(root);
    this.bindEvents();
    this.renderAll();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
    this.telemetry.trackLandingView();
    this.setStatus("Conectando ao lobby global...");
    this.connect();
  }

  public sendGuestInput(input: OnlineInputState, inputSeq: number): void {
    if (this.role !== "guest") {
      return;
    }
    this.send({ type: "guest-input", input, inputSeq, sentAtMs: Date.now() });
  }

  public sendHostSnapshot(snapshot: OnlineGameSnapshot): void {
    if (this.role !== "host") {
      return;
    }
    this.send({ type: "host-snapshot", snapshot });
  }

  public sendMatchResultChoice(choice: "rematch" | "lobby"): boolean {
    if (this.role !== "guest") {
      return false;
    }
    return this.send({ type: "match-result-choice", choice });
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/online`);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      if (this.currentLobby?.roomCode) {
        this.pendingAutoJoinRoom = this.currentLobby.roomCode;
      }
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      this.socket = null;
      this.role = null;
      this.roomCode = null;
      this.currentLobby = null;
      this.quickMatchSearching = false;
      this.pendingAutoJoinRoom = null;
      this.app.detachOnlineSession();
      this.renderAll();
      this.setStatus("Conexao perdida. Reconectando...");
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      this.setStatus("Erro de conexao. Tentando novamente...");
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    const delayMs = Math.min(2500, 400 + this.reconnectAttempts * 300);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private bindEvents(): void {
    this.elements.landingQuickMatchButton.addEventListener("click", () => {
      this.telemetry.track("quick_match_clicked", {
        context: { screen: this.getScreen() },
        payload: { characterIndex: this.preferredCharacterIndex },
      });
      this.startQuickMatch();
    });
    this.elements.landingBotMatchButton.addEventListener("click", () => {
      this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
      this.app.startOfflineBotMatch(3);
      this.setStatus("Partida contra bots iniciada.");
      this.renderAll();
    });
    this.elements.landingLobbyButton.addEventListener("click", () => {
      this.idleScreen = "lobby-list";
      this.telemetry.track("lobby_list_opened", {
        context: { screen: "landing" },
      });
      this.renderAll();
    });
    this.elements.lobbyListBackButton.addEventListener("click", () => {
      this.idleScreen = "landing";
      this.renderAll();
    });
    this.elements.lobbyListCreateButton.addEventListener("click", () => {
      this.telemetry.track("lobby_create_clicked", {
        context: { screen: "lobby-list" },
      });
      if (!this.send({ type: "create-lobby", title: DEFAULT_LOBBY_TITLE })) {
        this.setStatus("Nao foi possivel criar a sala agora.");
        return;
      }
      this.setStatus("Criando um lobby novo...");
    });
    this.elements.setupBackButton.addEventListener("click", () => {
      if (this.currentLobby) {
        this.leaveCurrentLobby();
        return;
      }
      if (this.quickMatchSearching) {
        this.quickMatchSearching = false;
        this.send({ type: "quick-match-cancel" });
      }
      this.pendingAutoJoinRoom = null;
      this.idleScreen = "landing";
      this.renderAll();
    });
    this.elements.setupLeaveButton.addEventListener("click", () => {
      if (this.currentLobby) {
        this.leaveCurrentLobby();
        return;
      }
      if (this.quickMatchSearching) {
        this.quickMatchSearching = false;
        this.send({ type: "quick-match-cancel" });
        this.renderAll();
      }
    });
    this.elements.setupCopyButton.addEventListener("click", () => {
      void this.copyInvite();
    });
    this.elements.setupPrimaryButton.addEventListener("click", () => {
      this.handleSetupPrimaryAction();
    });
    this.elements.matchCopyButton.addEventListener("click", () => {
      void this.copyInvite();
    });
    this.elements.matchLeaveButton.addEventListener("click", () => {
      this.leaveCurrentLobby();
    });
    this.elements.matchChatSend.addEventListener("click", () => {
      this.sendChat();
    });
    this.elements.matchChatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.sendChat();
      }
    });
  }

  private startQuickMatch(): void {
    if (this.quickMatchSearching) {
      return;
    }
    this.idleScreen = "landing";
    this.quickMatchSearching = true;
    this.renderAll();
    if (!this.send({ type: "quick-match", characterIndex: this.preferredCharacterIndex })) {
      this.quickMatchSearching = false;
      this.renderAll();
      this.setStatus("Quick match indisponivel. Reconectando...");
      return;
    }
    this.setStatus("Buscando uma sala aberta...");
  }

  private handleSetupPrimaryAction(): void {
    const lobby = this.currentLobby;
    if (!lobby || lobby.status !== "open") {
      return;
    }

    if (!lobby.selfSeat) {
      const firstFreeSeat = this.getFirstAvailableSeat(lobby);
      if (!firstFreeSeat) {
        this.setStatus("Essa sala lotou antes da entrada.");
        this.renderAll();
        return;
      }
      this.telemetry.track("seat_claim_clicked", {
        context: { roomCode: lobby.roomCode, screen: "setup" },
        payload: { seat: firstFreeSeat, characterIndex: this.preferredCharacterIndex },
      });
      this.autoClaimRoomCode = lobby.roomCode;
      this.send({ type: "claim-seat", seat: firstFreeSeat, characterIndex: this.preferredCharacterIndex });
      this.setStatus(`Entrando na vaga P${firstFreeSeat}...`);
      return;
    }

    const selfSeat = lobby.seats[lobby.selfSeat];
    if (!selfSeat.ready) {
      this.telemetry.track("ready_clicked", {
        context: { roomCode: lobby.roomCode, screen: "setup" },
        payload: { seat: lobby.selfSeat },
      });
      this.send({ type: "set-ready", ready: true });
      this.setStatus("Tudo certo. Sua vaga foi marcada como pronta.");
    }
  }

  private async copyInvite(): Promise<void> {
    if (!this.currentLobby) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.buildInviteUrl(this.currentLobby.roomCode));
      this.telemetry.track("invite_copied", {
        context: { roomCode: this.currentLobby.roomCode, screen: this.getScreen() },
      });
      this.setStatus("Convite copiado.");
    } catch {
      this.setStatus("Nao foi possivel copiar o convite.");
    }
  }

  private leaveCurrentLobby(): void {
    this.telemetry.track("lobby_left", {
      context: { roomCode: this.currentLobby?.roomCode ?? null, screen: this.getScreen() },
    });
    this.send({ type: "leave-lobby" });
  }

  private sendChat(): void {
    if (!this.currentLobby) {
      return;
    }
    const body = this.elements.matchChatInput.value.trim();
    if (!body) {
      return;
    }
    if (!this.send({ type: "chat-send", body })) {
      this.setStatus("Chat indisponivel no momento.");
      return;
    }
    this.telemetry.track("chat_sent", {
      context: { roomCode: this.currentLobby.roomCode, screen: this.getScreen() },
      payload: { length: body.length },
    });
    this.elements.matchChatInput.value = "";
  }

  private handleMessage(rawMessage: unknown): void {
    if (typeof rawMessage !== "string") {
      return;
    }

    let message: ServerMessage;
    try {
      message = JSON.parse(rawMessage) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case "hello":
        this.clientId = message.clientId;
        this.lobbies = message.lobbies;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
        this.quickMatchQueuedCount = message.quickMatchQueued;
        this.quickMatchSearching = message.searchingQuickMatch;
        if (this.pendingAutoJoinRoom) {
          this.send({ type: "join-lobby", roomCode: this.pendingAutoJoinRoom });
          this.setStatus("Entrando no lobby...");
        } else if (this.quickMatchSearching) {
          this.setStatus("Buscando uma sala aberta...");
        } else {
          this.setStatus("Escolha partida rapida ou entre em um lobby.");
        }
        this.renderAll();
        break;
      case "lobby-list":
        this.lobbies = message.lobbies;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
        this.renderAll();
        break;
      case "lobby-joined":
        this.role = message.role;
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.pendingAutoJoinRoom = null;
        this.quickMatchSearching = false;
        this.syncPreferredCharacterFromLobby();
        this.app.attachOnlineSession(this);
        this.updateLocation(message.lobby.roomCode);
        this.maybeAutoClaimSeat();
        this.telemetry.track("lobby_joined", {
          context: { roomCode: message.lobby.roomCode, screen: "setup" },
          payload: {
            occupantCount: message.lobby.occupantCount,
            selfSeat: message.lobby.selfSeat,
          },
        });
        this.setStatus("Sala carregada. Revise o personagem e entre pronto.");
        this.renderAll();
        break;
      case "lobby-updated":
        if (this.currentLobby?.status === "playing" && message.lobby.status === "open") {
          this.app.clearOnlinePeer();
        }
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.syncPreferredCharacterFromLobby();
        this.maybeAutoClaimSeat();
        this.renderAll();
        break;
      case "lobby-left":
        this.role = null;
        this.roomCode = null;
        this.currentLobby = null;
        this.pendingAutoJoinRoom = null;
        this.quickMatchSearching = false;
        this.autoClaimRoomCode = null;
        this.updateLocation(null);
        this.app.detachOnlineSession();
        this.renderAll();
        this.setStatus("Voce voltou para a entrada do jogo.");
        break;
      case "match-started":
        this.role = message.config.role;
        this.roomCode = message.config.roomCode;
        this.pendingAutoJoinRoom = null;
        this.quickMatchSearching = false;
        if (this.currentLobby) {
          this.currentLobby = {
            ...this.currentLobby,
            status: "playing",
          };
        }
        this.syncPreferredCharacterFromMatchConfig(message.config);
        this.app.startOnlineMatch(message.config);
        this.observedMatchWinner = null;
        this.telemetry.track("match_started", {
          context: { roomCode: message.config.roomCode, screen: "match" },
          payload: {
            localPlayerId: message.config.localPlayerId,
            activePlayerCount: message.config.activePlayerIds.length,
          },
        });
        this.renderAll();
        this.setStatus("Partida iniciada.");
        break;
      case "guest-input":
        this.app.receiveOnlineGuestInput(message.input);
        break;
      case "host-snapshot":
        this.app.applyOnlineSnapshot(message.snapshot);
        this.maybeTrackMatchEnded(message.snapshot.matchWinner, message.snapshot.roundNumber);
        break;
      case "host-frame":
        this.app.applyOnlineFrame(message.frame);
        this.maybeTrackMatchEnded(message.frame.matchWinner, message.frame.roundNumber);
        break;
      case "chat-message":
        if (this.currentLobby && this.currentLobby.roomCode === message.roomCode) {
          this.currentLobby.chat = [...this.currentLobby.chat, message.entry].slice(-40);
        }
        break;
      case "quick-match-state":
        this.quickMatchQueuedCount = message.queued;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
        this.quickMatchSearching = message.searching;
        this.renderAll();
        break;
      case "peer-left":
        if (this.currentLobby) {
          this.currentLobby = {
            ...this.currentLobby,
            status: "open",
          };
        }
        this.app.clearOnlinePeer();
        this.renderAll();
        this.setStatus("Um jogador saiu da sala.");
        break;
      case "error":
        this.quickMatchSearching = false;
        this.renderAll();
        this.setStatus(message.message);
        break;
      default:
        break;
    }
  }

  private maybeAutoClaimSeat(): void {
    const lobby = this.currentLobby;
    if (!lobby || lobby.status !== "open" || lobby.selfSeat) {
      if (!lobby || lobby.selfSeat) {
        this.autoClaimRoomCode = null;
      }
      return;
    }
    const firstFreeSeat = this.getFirstAvailableSeat(lobby);
    if (!firstFreeSeat) {
      return;
    }
    if (this.autoClaimRoomCode === lobby.roomCode) {
      return;
    }
    this.autoClaimRoomCode = lobby.roomCode;
    this.send({ type: "claim-seat", seat: firstFreeSeat, characterIndex: this.preferredCharacterIndex });
    this.setStatus(`Entrando automaticamente na vaga P${firstFreeSeat}...`);
  }

  private getFirstAvailableSeat(lobby: LobbySummary): PlayerId | null {
    for (const playerId of ALL_PLAYER_IDS) {
      if (!lobby.seats[playerId].clientId) {
        return playerId;
      }
    }
    return null;
  }

  private render(root: HTMLElement): SessionElements {
    const shell = document.createElement("div");
    shell.className = "experience-shell";

    const landing = document.createElement("section");
    landing.className = "experience-screen experience-screen--landing";

    const landingHero = document.createElement("div");
    landingHero.className = "experience-hero";

    const landingCopy = document.createElement("div");
    landingCopy.className = "experience-hero__copy";
    landingCopy.innerHTML = `
      <p class="experience-kicker">Arena online</p>
      <h1>BOMBA PVP</h1>
      <p class="experience-hero__lead">Entre, escolha um bomber e entenda o jogo em segundos.</p>
    `;

    const landingMeta = document.createElement("p");
    landingMeta.className = "experience-hero__meta";

    const landingActions = document.createElement("div");
    landingActions.className = "experience-actions";

    const landingQuickMatchButton = document.createElement("button");
    landingQuickMatchButton.className = "experience-button experience-button--primary";
    landingQuickMatchButton.type = "button";
    landingQuickMatchButton.textContent = "Partida rapida";

    const landingBotMatchButton = document.createElement("button");
    landingBotMatchButton.className = "experience-button experience-button--secondary";
    landingBotMatchButton.type = "button";
    landingBotMatchButton.textContent = "Partida contra bots";

    const landingLobbyButton = document.createElement("button");
    landingLobbyButton.className = "experience-button experience-button--secondary";
    landingLobbyButton.type = "button";
    landingLobbyButton.textContent = "Entrar em lobby";

    landingActions.append(landingQuickMatchButton, landingBotMatchButton, landingLobbyButton);
    landingCopy.append(landingMeta, landingActions);

    const landingRoster = document.createElement("div");
    landingRoster.className = "experience-hero__art";

    landingHero.append(landingCopy, landingRoster);
    landing.append(landingHero);

    const lobbyList = document.createElement("section");
    lobbyList.className = "experience-screen experience-screen--lobbies";

    const lobbyHeader = document.createElement("div");
    lobbyHeader.className = "experience-panel__header";

    const lobbyListBackButton = document.createElement("button");
    lobbyListBackButton.className = "experience-button experience-button--ghost";
    lobbyListBackButton.type = "button";
    lobbyListBackButton.textContent = "Voltar";

    const lobbyListCreateButton = document.createElement("button");
    lobbyListCreateButton.className = "experience-button experience-button--primary";
    lobbyListCreateButton.type = "button";
    lobbyListCreateButton.textContent = "Criar lobby";

    const lobbyTitleWrap = document.createElement("div");
    lobbyTitleWrap.className = "experience-panel__title";
    lobbyTitleWrap.innerHTML = `
      <p class="experience-kicker">Salas abertas</p>
      <h2>Escolha um lobby para entrar</h2>
    `;

    lobbyHeader.append(lobbyListBackButton, lobbyTitleWrap, lobbyListCreateButton);

    const lobbyListCount = document.createElement("p");
    lobbyListCount.className = "experience-room-list__count";

    const lobbyListList = document.createElement("div");
    lobbyListList.className = "experience-room-list";

    lobbyList.append(lobbyHeader, lobbyListCount, lobbyListList);

    const setup = document.createElement("section");
    setup.className = "experience-screen experience-screen--setup";

    const setupHeader = document.createElement("div");
    setupHeader.className = "experience-panel__header";

    const setupBackButton = document.createElement("button");
    setupBackButton.className = "experience-button experience-button--ghost";
    setupBackButton.type = "button";
    setupBackButton.textContent = "Voltar";

    const setupHeaderCopy = document.createElement("div");
    setupHeaderCopy.className = "experience-panel__title";

    const setupEyebrow = document.createElement("p");
    setupEyebrow.className = "experience-kicker";
    const setupTitle = document.createElement("h2");
    const setupDescription = document.createElement("p");
    setupDescription.className = "experience-panel__lead";
    const setupRoomMeta = document.createElement("p");
    setupRoomMeta.className = "experience-panel__meta";

    setupHeaderCopy.append(setupEyebrow, setupTitle, setupDescription, setupRoomMeta);

    const setupHeaderActions = document.createElement("div");
    setupHeaderActions.className = "experience-panel__actions";

    const setupCopyButton = document.createElement("button");
    setupCopyButton.className = "experience-button experience-button--secondary";
    setupCopyButton.type = "button";
    setupCopyButton.textContent = "Copiar convite";

    const setupLeaveButton = document.createElement("button");
    setupLeaveButton.className = "experience-button experience-button--ghost";
    setupLeaveButton.type = "button";
    setupLeaveButton.textContent = "Sair";

    setupHeaderActions.append(setupCopyButton, setupLeaveButton);
    setupHeader.append(setupBackButton, setupHeaderCopy, setupHeaderActions);

    const setupSeatStrip = document.createElement("div");
    setupSeatStrip.className = "experience-seat-strip";

    const setupGrid = document.createElement("div");
    setupGrid.className = "experience-setup-grid";

    const setupCharacter = document.createElement("section");
    setupCharacter.className = "experience-panel experience-panel--character";

    const selectorSummary = document.createElement("div");
    selectorSummary.className = "experience-character-summary";

    const selectorPortrait = document.createElement("img");
    selectorPortrait.className = "experience-character-summary__portrait";
    selectorPortrait.alt = "Personagem selecionado";
    selectorPortrait.width = 96;
    selectorPortrait.height = 96;

    const selectorSummaryCopy = document.createElement("div");
    selectorSummaryCopy.className = "experience-character-summary__copy";

    const selectorName = document.createElement("p");
    selectorName.className = "experience-character-summary__name";

    const selectorNote = document.createElement("p");
    selectorNote.className = "experience-character-summary__note";

    selectorSummaryCopy.append(selectorName, selectorNote);
    selectorSummary.append(selectorPortrait, selectorSummaryCopy);

    const selectorGrid = document.createElement("div");
    selectorGrid.className = "experience-character-grid";

    setupCharacter.append(selectorSummary, selectorGrid);

    const setupControls = document.createElement("section");
    setupControls.className = "experience-panel experience-panel--controls";
    setupControls.innerHTML = `
      <p class="experience-kicker">Comandos</p>
      <h3>Jogue com WASD ou com as setas</h3>
      <div class="experience-controls">
        <div class="experience-controls__group">
          <span class="experience-controls__label">Mover</span>
          <div class="experience-key-columns">
            <div class="experience-key-cluster">
              <span class="experience-key experience-key--solo">W</span>
              <div class="experience-key-row">
                <span class="experience-key">A</span>
                <span class="experience-key">S</span>
                <span class="experience-key">D</span>
              </div>
            </div>
            <div class="experience-key-cluster">
              <span class="experience-key experience-key--solo">&uarr;</span>
              <div class="experience-key-row">
                <span class="experience-key">&larr;</span>
                <span class="experience-key">&darr;</span>
                <span class="experience-key">&rarr;</span>
              </div>
            </div>
          </div>
        </div>
        <div class="experience-controls__group">
          <span class="experience-controls__label">Acoes</span>
          <div class="experience-action-keys">
            <div class="experience-action-card">
              <span class="experience-key experience-key--action">Q</span>
              <strong>Soltar bomba</strong>
            </div>
            <div class="experience-action-card">
              <span class="experience-key experience-key--wide">Espaco</span>
              <strong>Ultimate do personagem</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    const setupPresenceList = document.createElement("div");
    setupPresenceList.className = "experience-presence";

    const setupFooter = document.createElement("div");
    setupFooter.className = "experience-setup__footer";

    const setupPrimaryButton = document.createElement("button");
    setupPrimaryButton.className = "experience-button experience-button--primary";
    setupPrimaryButton.type = "button";
    setupPrimaryButton.textContent = "Pronto para jogar";

    const setupPrimaryHint = document.createElement("p");
    setupPrimaryHint.className = "experience-setup__hint";

    setupFooter.append(setupPrimaryButton, setupPrimaryHint);
    setupControls.append(setupPresenceList, setupFooter);

    setupGrid.append(setupCharacter, setupControls);
    setup.append(setupHeader, setupSeatStrip, setupGrid);

    const match = document.createElement("section");
    match.className = "experience-screen experience-screen--match";

    const matchOverlay = document.createElement("div");
    matchOverlay.className = "experience-match__overlay";

    const matchCode = document.createElement("span");
    matchCode.className = "experience-match__code";

    const matchStatus = document.createElement("p");
    matchStatus.className = "experience-match__status";

    const matchActions = document.createElement("div");
    matchActions.className = "experience-match__actions";

    const matchCopyButton = document.createElement("button");
    matchCopyButton.className = "experience-button experience-button--secondary";
    matchCopyButton.type = "button";
    matchCopyButton.textContent = "Convite";

    const matchLeaveButton = document.createElement("button");
    matchLeaveButton.className = "experience-button experience-button--ghost";
    matchLeaveButton.type = "button";
    matchLeaveButton.textContent = "Sair da sala";

    matchActions.append(matchCopyButton, matchLeaveButton);
    matchOverlay.append(matchCode, matchStatus, matchActions);

    const matchLayout = document.createElement("div");
    matchLayout.className = "experience-match__layout";

    const matchInfoRail = document.createElement("aside");
    matchInfoRail.className = "experience-match__rail experience-match__rail--info";
    matchInfoRail.innerHTML = `
      <p class="experience-kicker">Sala</p>
      <h3>BOMBA PVP</h3>
      <p class="experience-match__rail-copy">Acompanhe quem esta jogando e mantenha os comandos importantes sempre a vista.</p>
    `;

    const matchRoster = document.createElement("div");
    matchRoster.className = "experience-match__roster";
    matchInfoRail.append(matchRoster);

    const matchViewport = document.createElement("div");
    matchViewport.className = "experience-match__viewport";

    const matchChatRail = document.createElement("aside");
    matchChatRail.className = "experience-match__rail experience-match__rail--chat";

    const matchChatHeading = document.createElement("div");
    matchChatHeading.className = "experience-match__chat-heading";
    matchChatHeading.innerHTML = `
      <p class="experience-kicker">Chat da sala</p>
      <h3>Fale com quem esta jogando</h3>
    `;

    const matchChatLog = document.createElement("div");
    matchChatLog.className = "experience-match__chat-log";

    const matchChatComposer = document.createElement("div");
    matchChatComposer.className = "experience-match__chat-composer";

    const matchChatInput = document.createElement("input");
    matchChatInput.className = "experience-match__chat-input";
    matchChatInput.type = "text";
    matchChatInput.maxLength = 280;
    matchChatInput.placeholder = "Escreva uma mensagem";
    matchChatInput.autocomplete = "off";

    const matchChatSend = document.createElement("button");
    matchChatSend.className = "experience-button experience-button--primary";
    matchChatSend.type = "button";
    matchChatSend.textContent = "Enviar";

    matchChatComposer.append(matchChatInput, matchChatSend);
    matchChatRail.append(matchChatHeading, matchChatLog, matchChatComposer);

    matchLayout.append(matchInfoRail, matchViewport, matchChatRail);
    match.append(matchOverlay, matchLayout);

    const status = document.createElement("p");
    status.className = "experience-status";

    shell.append(landing, lobbyList, setup, match, status);
    root.prepend(shell);

    return {
      shell,
      screens: {
        landing,
        "lobby-list": lobbyList,
        setup,
        match,
      },
      landingMeta,
      landingQuickMatchButton,
      landingBotMatchButton,
      landingLobbyButton,
      landingRoster,
      lobbyListBackButton,
      lobbyListCreateButton,
      lobbyListCount,
      lobbyListList,
      setupBackButton,
      setupLeaveButton,
      setupCopyButton,
      setupEyebrow,
      setupTitle,
      setupDescription,
      setupRoomMeta,
      setupSeatStrip,
      setupPresenceList,
      selectorPortrait,
      selectorName,
      selectorNote,
      selectorGrid,
      setupPrimaryButton,
      setupPrimaryHint,
      matchViewport,
      matchCode,
      matchStatus,
      matchCopyButton,
      matchLeaveButton,
      matchRoster,
      matchChatLog,
      matchChatInput,
      matchChatSend,
      status,
    };
  }

  private renderAll(): void {
    this.renderLanding();
    this.renderLobbyList();
    this.renderCharacterSelector();
    this.renderSetup();
    this.renderMatch();
    this.renderMatchRoster();
    this.renderMatchChat();
    this.renderShellState();
  }

  private renderShellState(): void {
    const screen = this.getScreen();
    this.telemetry.trackScreenView(screen, this.currentLobby?.roomCode ?? null);
    this.elements.shell.dataset.screen = screen;
    for (const [key, node] of Object.entries(this.elements.screens) as Array<[ExperienceScreen, HTMLElement]>) {
      const active = key === screen;
      node.dataset.active = active ? "true" : "false";
      node.hidden = !active;
    }
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  private getScreen(): ExperienceScreen {
    if (this.currentLobby?.status === "playing") {
      return "match";
    }
    const appMode = this.app.getCurrentMode();
    if (appMode === "match" || appMode === "match-result") {
      return "match";
    }
    if (this.currentLobby || this.quickMatchSearching || this.pendingAutoJoinRoom) {
      return "setup";
    }
    return this.idleScreen;
  }

  private renderLanding(): void {
    const queuedLabel = this.quickMatchQueuedCount === 1
      ? "1 sala aberta agora"
      : `${this.quickMatchQueuedCount} salas abertas agora`;
    this.elements.landingMeta.textContent = this.quickMatchSearching
      ? "Procurando a melhor sala para voce entrar."
      : `${queuedLabel} | ${this.onlineUsers} jogadores online`;
    this.elements.landingQuickMatchButton.disabled = this.quickMatchSearching;
    this.elements.landingBotMatchButton.disabled = this.quickMatchSearching;
    this.elements.landingQuickMatchButton.textContent = this.quickMatchSearching
      ? "Buscando partida..."
      : "Partida rapida";
    this.elements.landingRoster.replaceChildren(
      ...this.roster.slice(0, 3).map((entry, index) => {
        const card = document.createElement("div");
        card.className = "experience-hero__portrait";
        if (index === (this.preferredCharacterIndex % Math.max(1, this.roster.length))) {
          card.dataset.selected = "true";
        }

        const image = document.createElement("img");
        image.src = assetUrl(`/assets/characters/${entry.id}/south.png`);
        image.alt = entry.name;
        image.width = 128;
        image.height = 128;

        const label = document.createElement("span");
        label.textContent = entry.name;

        card.append(image, label);
        return card;
      }),
    );
  }

  private renderLobbyList(): void {
    this.elements.lobbyListCount.textContent = this.lobbies.length === 0
      ? "Nenhum lobby aberto no momento."
      : `${this.lobbies.length} lobbies publicos disponiveis`;
    this.elements.lobbyListList.replaceChildren();

    if (this.lobbies.length === 0) {
      const empty = document.createElement("div");
      empty.className = "experience-room-list__empty";
      empty.textContent = "Nenhuma sala aberta agora. Crie um lobby novo ou volte para partida rapida.";
      this.elements.lobbyListList.appendChild(empty);
      return;
    }

    for (const lobby of this.lobbies) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "experience-room-card";
      card.addEventListener("click", () => {
        this.idleScreen = "lobby-list";
        this.pendingAutoJoinRoom = lobby.roomCode;
        this.telemetry.track("lobby_join_clicked", {
          context: { roomCode: lobby.roomCode, screen: "lobby-list" },
          payload: { occupantCount: lobby.occupantCount },
        });
        if (!this.send({ type: "join-lobby", roomCode: lobby.roomCode })) {
          this.setStatus("Nao foi possivel entrar no lobby agora.");
          return;
        }
        this.renderAll();
        this.setStatus(`Entrando em ${lobby.title}...`);
      });

      const title = document.createElement("strong");
      title.textContent = this.getLobbyDisplayTitle(lobby);

      const meta = document.createElement("span");
      meta.textContent = `${lobby.roomCode} | ${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} jogadores`;

      const status = document.createElement("span");
      status.className = "experience-room-card__status";
      status.textContent = lobby.status === "playing" ? "Ao vivo" : "Pronto para entrar";

      const occupants = document.createElement("div");
      occupants.className = "experience-room-card__occupants";
      occupants.append(
        ...ALL_PLAYER_IDS.map((playerId) => {
          const seat = lobby.seats[playerId];
          const pill = document.createElement("span");
          pill.className = "experience-room-card__occupant";
          pill.textContent = seat.clientId ? `P${playerId}` : `P${playerId} livre`;
          if (seat.clientId) {
            pill.dataset.filled = "true";
          }
          return pill;
        }),
      );

      card.append(title, meta, status, occupants);
      this.elements.lobbyListList.appendChild(card);
    }
  }

  private renderSetup(): void {
    const lobby = this.currentLobby;
    this.elements.setupCopyButton.hidden = !lobby;
    this.elements.setupLeaveButton.hidden = !lobby;
    this.elements.setupBackButton.textContent = lobby ? "Inicio" : "Voltar";

    if (!lobby) {
      this.elements.setupEyebrow.textContent = this.quickMatchSearching ? "Partida rapida" : "Entrando no lobby";
      this.elements.setupTitle.textContent = this.quickMatchSearching ? "Buscando sala" : "Carregando sala";
      this.elements.setupDescription.textContent = "Escolha seu bomber enquanto preparamos a proxima arena.";
      this.elements.setupRoomMeta.textContent = this.quickMatchSearching
        ? "Voce entra automaticamente na primeira vaga livre."
        : "Reconectando ou entrando por convite.";
      this.elements.setupSeatStrip.replaceChildren(this.buildSeatStripPlaceholder());
      this.renderPresenceList(this.quickMatchSearching);
      this.elements.setupPrimaryButton.textContent = this.quickMatchSearching ? "Buscando..." : "Aguardando...";
      this.elements.setupPrimaryButton.disabled = true;
      this.elements.setupPrimaryHint.textContent = "Os comandos abaixo ja funcionam assim que a sala abrir.";
      return;
    }

    const selfSeatId = lobby.selfSeat;
    const selfSeat = selfSeatId ? lobby.seats[selfSeatId] : null;
    this.elements.setupEyebrow.textContent = lobby.status === "playing" ? "Partida ao vivo" : "Setup da sala";
    this.elements.setupTitle.textContent = this.getLobbyDisplayTitle(lobby);
    this.elements.setupDescription.textContent = "Escolha seu personagem e entre na partida sem atrito.";
    this.elements.setupRoomMeta.textContent = `${lobby.roomCode} | ${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} jogadores`;
    this.elements.setupSeatStrip.replaceChildren(...this.buildSeatStrip(lobby));
    this.renderPresenceList(lobby.status === "open" && lobby.occupantCount < LOBBY_MAX_PLAYERS);

    if (!selfSeatId) {
      const firstFreeSeat = this.getFirstAvailableSeat(lobby);
      this.elements.setupPrimaryButton.textContent = firstFreeSeat
        ? `Entrar na vaga P${firstFreeSeat}`
        : "Sala cheia";
      this.elements.setupPrimaryButton.disabled = !firstFreeSeat;
      this.elements.setupPrimaryHint.textContent = firstFreeSeat
        ? "A entrada na vaga livre acontece com um clique."
        : "A sala ficou cheia antes da sua entrada.";
      return;
    }

    if (selfSeat?.ready) {
      this.elements.setupPrimaryButton.textContent = "Pronto";
      this.elements.setupPrimaryButton.disabled = true;
      this.elements.setupPrimaryHint.textContent = lobby.occupantCount < 2
        ? "Sua vaga esta pronta. Falta mais gente para iniciar."
        : "Tudo certo. A partida comeca assim que o servidor iniciar o match.";
      return;
    }

    this.elements.setupPrimaryButton.textContent = "Pronto para jogar";
    this.elements.setupPrimaryButton.disabled = false;
    this.elements.setupPrimaryHint.textContent = "Seu personagem escolhido ja sera usado na vaga atual.";
  }

  private buildSeatStripPlaceholder(): HTMLElement {
    const placeholder = document.createElement("div");
    placeholder.className = "experience-seat-pill";
    placeholder.textContent = "Preparando sala...";
    return placeholder;
  }

  private buildSeatStrip(lobby: LobbySummary): HTMLElement[] {
    return ALL_PLAYER_IDS.map((playerId) => {
      const seat = lobby.seats[playerId];
      const pill = document.createElement("div");
      pill.className = "experience-seat-pill";
      if (seat.ready) {
        pill.dataset.ready = "true";
      }
      if (seat.clientId && seat.clientId === this.clientId) {
        pill.dataset.self = "true";
      }
      const occupant = seat.clientId ? (seat.displayName || `P${playerId}`) : "Livre";
      pill.textContent = `P${playerId} | ${occupant}`;
      return pill;
    });
  }

  private renderPresenceList(showPresence: boolean): void {
    this.elements.setupPresenceList.replaceChildren();
    this.elements.setupPresenceList.hidden = !showPresence;
    if (!showPresence) {
      return;
    }

    const heading = document.createElement("div");
    heading.className = "experience-presence__header";

    const title = document.createElement("span");
    title.className = "experience-controls__label";
    title.textContent = "Jogadores online";

    const meta = document.createElement("strong");
    meta.textContent = `${this.onlineUsers} conectados agora`;

    heading.append(title, meta);

    const list = document.createElement("div");
    list.className = "experience-presence__list";
    const players = this.getPresenceEntries();
    list.append(
      ...players.map((entry) => {
        const item = document.createElement("div");
        item.className = "experience-presence__item";
        if (entry.clientId === this.clientId) {
          item.dataset.self = "true";
        }

        const playerId = document.createElement("strong");
        playerId.textContent = this.formatPresenceLabel(entry.clientId);

        const status = document.createElement("span");
        status.textContent = entry.clientId === this.clientId ? "Voce esta online" : "Disponivel para entrar";

        item.append(playerId, status);
        return item;
      }),
    );

    this.elements.setupPresenceList.append(heading, list);
  }

  private renderCharacterSelector(): void {
    const selected = this.getCharacter(this.preferredCharacterIndex);
    this.elements.selectorPortrait.src = assetUrl(`/assets/characters/${selected.id}/south.png`);
    this.elements.selectorName.textContent = selected.name;

    const lobby = this.currentLobby;
    if (lobby?.selfSeat) {
      const selfSeat = lobby.seats[lobby.selfSeat];
      this.elements.selectorNote.textContent = selfSeat.ready
        ? "Voce ja esta pronto. O personagem continua aplicado nessa sala."
        : "Esse personagem sera aplicado assim que voce ficar pronto.";
    } else if (this.quickMatchSearching) {
      this.elements.selectorNote.textContent = "Seu bomber entra automaticamente na primeira vaga livre encontrada.";
    } else {
      this.elements.selectorNote.textContent = "Escolha agora e entre no setup com tudo explicado na mesma tela.";
    }

    this.elements.selectorGrid.replaceChildren(
      ...this.roster.map((entry, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "experience-character-option";
        if (index === this.preferredCharacterIndex) {
          option.dataset.selected = "true";
        }

        const portrait = document.createElement("img");
        portrait.className = "experience-character-option__portrait";
        portrait.alt = entry.name;
        portrait.src = assetUrl(`/assets/characters/${entry.id}/south.png`);
        portrait.width = 56;
        portrait.height = 56;

        const copy = document.createElement("div");
        copy.className = "experience-character-option__copy";

        const name = document.createElement("strong");
        name.textContent = entry.name;

        const hint = document.createElement("span");
        hint.textContent = entry.defaultSlot ? `Default P${entry.defaultSlot}` : "Selecionavel";

        copy.append(name, hint);
        option.append(portrait, copy);
        option.addEventListener("click", () => {
          this.updatePreferredCharacter(index);
        });
        return option;
      }),
    );
  }

  private updatePreferredCharacter(nextIndex: number): void {
    this.preferredCharacterIndex = this.wrapCharacterIndex(nextIndex);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
    this.telemetry.track("character_selected", {
      context: { roomCode: this.currentLobby?.roomCode ?? null, screen: this.getScreen() },
      payload: {
        characterIndex: this.preferredCharacterIndex,
        characterId: this.getCharacter(this.preferredCharacterIndex).id,
      },
    });
    this.renderAll();

    if (this.currentLobby?.selfSeat && this.currentLobby.status === "open") {
      this.send({ type: "set-character", characterIndex: this.preferredCharacterIndex });
    }
  }

  private syncPreferredCharacterFromLobby(): void {
    const selfSeat = this.currentLobby?.selfSeat;
    if (!selfSeat) {
      return;
    }
    const seat = this.currentLobby?.seats[selfSeat];
    if (!seat) {
      return;
    }
    this.preferredCharacterIndex = this.wrapCharacterIndex(seat.characterIndex);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
  }

  private syncPreferredCharacterFromMatchConfig(config: MatchStartConfig): void {
    const selected = config.characterSelections[config.localPlayerId] ?? this.preferredCharacterIndex;
    this.preferredCharacterIndex = this.wrapCharacterIndex(selected);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
  }

  private renderMatch(): void {
    const lobby = this.currentLobby;
    this.elements.matchCode.textContent = lobby ? `Sala ${lobby.roomCode}` : "Arena";
    this.elements.matchStatus.textContent = lobby
      ? `${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} jogadores na partida`
      : "Partida ao vivo";
    this.elements.matchCopyButton.disabled = !lobby;
    this.elements.matchLeaveButton.disabled = !lobby;
  }

  private renderMatchRoster(): void {
    const lobby = this.currentLobby;
    this.elements.matchRoster.replaceChildren();
    if (!lobby) {
      return;
    }
    this.elements.matchRoster.append(
      ...ALL_PLAYER_IDS.map((playerId) => {
        const seat = lobby.seats[playerId];
        const card = document.createElement("div");
        card.className = "experience-match__seat";
        if (seat.ready) {
          card.dataset.ready = "true";
        }

        const title = document.createElement("strong");
        title.textContent = `P${playerId}`;

        const body = document.createElement("span");
        body.textContent = seat.clientId ? (seat.displayName || "Jogador conectado") : "Vaga livre";

        card.append(title, body);
        return card;
      }),
    );
  }

  private renderMatchChat(): void {
    this.elements.matchChatLog.replaceChildren();
    const entries = this.currentLobby?.chat ?? [];
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "experience-match__chat-empty";
      empty.textContent = "O chat aparece aqui durante a sala e a partida.";
      this.elements.matchChatLog.appendChild(empty);
    } else {
      for (const entry of entries.slice(-24)) {
        const item = document.createElement("div");
        item.className = "experience-match__chat-entry";
        if (entry.system) {
          item.dataset.system = "true";
        } else if (entry.authorClientId && entry.authorClientId === this.clientId) {
          item.dataset.self = "true";
        }

        const meta = document.createElement("div");
        meta.className = "experience-match__chat-meta";
        meta.textContent = entry.authorLabel;

        const body = document.createElement("p");
        body.className = "experience-match__chat-body";
        body.textContent = entry.body;

        item.append(meta, body);
        this.elements.matchChatLog.appendChild(item);
      }
      this.elements.matchChatLog.scrollTop = this.elements.matchChatLog.scrollHeight;
    }

    const chatEnabled = Boolean(this.currentLobby);
    this.elements.matchChatInput.disabled = !chatEnabled;
    this.elements.matchChatSend.disabled = !chatEnabled;
  }

  private getPresenceEntries(): OnlinePresenceEntry[] {
    if (this.onlinePlayers.length > 0) {
      return [...this.onlinePlayers].sort((left, right) => {
        if (left.clientId === this.clientId) {
          return -1;
        }
        if (right.clientId === this.clientId) {
          return 1;
        }
        return left.clientId.localeCompare(right.clientId);
      });
    }
    return this.clientId ? [{ clientId: this.clientId }] : [];
  }

  private formatPresenceLabel(clientId: string): string {
    const compact = clientId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const suffix = compact.slice(-4) || compact;
    return `ID ${suffix}`;
  }

  private mountCanvas(root: HTMLElement): void {
    const canvas = root.querySelector("canvas");
    if (!canvas || canvas.parentElement === this.elements.matchViewport) {
      return;
    }
    this.elements.matchViewport.replaceChildren(canvas);
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  private getCharacter(index: number): CharacterRosterEntry {
    const total = this.roster.length || 1;
    const safeIndex = ((index % total) + total) % total;
    return this.roster[safeIndex] ?? {
      id: "default-p1",
      name: "Pilot",
      size: null,
      sprites: {
        up: null,
        down: null,
        left: null,
        right: null,
        idle: { up: [], down: [], left: [], right: [] },
        walk: { up: [], down: [], left: [], right: [] },
        run: { up: [], down: [], left: [], right: [] },
        cast: { up: [], down: [], left: [], right: [] },
        attack: { up: [], down: [], left: [], right: [] },
        death: { up: [], down: [], left: [], right: [] },
      },
    };
  }

  private getLobbyDisplayTitle(lobby: LobbySummary | LobbyState): string {
    return lobby.title === "BOMBA" ? DEFAULT_LOBBY_TITLE : lobby.title;
  }

  private wrapCharacterIndex(index: number): number {
    const total = Math.max(1, this.roster.length);
    return ((index % total) + total) % total;
  }

  private readPreferredCharacterIndex(): number {
    if (typeof window === "undefined") {
      return 0;
    }
    const stored = window.localStorage.getItem("mistbridge-preferred-character-index");
    const value = Number(stored);
    if (Number.isNaN(value)) {
      return 0;
    }
    return this.wrapCharacterIndex(value);
  }

  private persistPreferredCharacterIndex(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("mistbridge-preferred-character-index", String(this.preferredCharacterIndex));
  }

  private setStatus(message: string): void {
    this.elements.status.textContent = message;
  }

  private send(payload: object): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private buildInviteUrl(roomCode: string): string {
    return this.telemetry.buildInviteUrl(roomCode);
  }

  private maybeTrackMatchEnded(matchWinner: PlayerId | null, roundNumber: number): void {
    if (!matchWinner || this.observedMatchWinner === matchWinner) {
      return;
    }
    this.observedMatchWinner = matchWinner;
    this.telemetry.track("match_ended", {
      context: { roomCode: this.currentLobby?.roomCode ?? null, screen: "match" },
      payload: {
        winner: matchWinner,
        roundNumber,
        localWon: this.currentLobby?.selfSeat === matchWinner,
      },
    });
  }

  private updateLocation(roomCode: string | null): void {
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set("room", roomCode);
    } else {
      url.searchParams.delete("room");
    }
    window.history.replaceState({}, "", url);
  }

  private readRoomFromLocation(): string | null {
    const roomCode = new URL(window.location.href).searchParams.get("room");
    if (!roomCode) {
      return null;
    }
    const normalized = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    return normalized || null;
  }
}
