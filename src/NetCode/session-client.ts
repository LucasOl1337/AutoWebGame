import type { CharacterRosterEntry } from "../Engine/assets";
import { assetUrl } from "../Engine/asset-url";
import { ALL_PLAYER_IDS } from "../Gameplay/types";
import type { Mode, PlayerId } from "../Gameplay/types";
import {
  applyDocumentLanguage,
  buildLocalizedUrl,
  getInitialSiteLanguage,
  persistSiteLanguage,
  SITE_COPY,
  type SiteLanguage,
} from "../UiLayouts/i18n";
import type { PlayerAccount } from "./account";
import { validateUsername } from "./account";
import type { OnlineSessionState } from "./matchmaking";
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
  setLanguage(language: SiteLanguage): void;
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
  languageSwitcher: HTMLDivElement;
  languageLabel: HTMLSpanElement;
  languagePortugueseButton: HTMLButtonElement;
  languageEnglishButton: HTMLButtonElement;
  screens: Record<ExperienceScreen, HTMLElement>;
  landingMeta: HTMLParagraphElement;
  landingAccountTitle: HTMLParagraphElement;
  landingAccountValue: HTMLParagraphElement;
  landingAccountUsernameInput: HTMLInputElement;
  landingAccountPrimaryButton: HTMLButtonElement;
  landingAccountSecondaryButton: HTMLButtonElement;
  landingAccountHint: HTMLParagraphElement;
  landingQuickMatchButton: HTMLButtonElement;
  landingEndlessButton: HTMLButtonElement;
  landingBotMatchButton: HTMLButtonElement;
  landingLobbyButton: HTMLButtonElement;
  landingFeedbackButton: HTMLButtonElement;
  landingRoster: HTMLDivElement;
  feedbackDialog: HTMLDivElement;
  feedbackTextarea: HTMLTextAreaElement;
  feedbackSendButton: HTMLButtonElement;
  feedbackCancelButton: HTMLButtonElement;
  feedbackStatus: HTMLParagraphElement;
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
  matchStage: HTMLDivElement;
  matchDock: HTMLDivElement;
  matchViewport: HTMLDivElement;
  matchCode: HTMLSpanElement;
  matchStatus: HTMLParagraphElement;
  matchCopyButton: HTMLButtonElement;
  matchLeaveButton: HTMLButtonElement;
  matchInfoToggleButton: HTMLButtonElement;
  matchChatToggleButton: HTMLButtonElement;
  matchInfoPanel: HTMLElement;
  matchChatPanel: HTMLElement;
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
  private endlessMatchStarting = false;
  private quickMatchQueuedCount = 0;
  private onlineUsers = 0;
  private onlinePlayers: OnlinePresenceEntry[] = [];
  private preferredCharacterIndex = 0;
  private idleScreen: IdleScreen = "landing";
  private autoClaimRoomCode: string | null = null;
  private currentAccount: PlayerAccount | null = null;
  private accountRequestPending = false;
  private feedbackDialogOpen = false;
  private feedbackRequestPending = false;
  private matchInfoPanelOpen = true;
  private matchChatPanelOpen = false;
  private statusClearTimer: number | null = null;
  private reconnectingForAccountRefresh = false;
  private realtimeReady = false;
  private currentSessionState: OnlineSessionState | null = null;
  private readonly telemetry: GrowthTelemetryClient;
  private observedMatchWinner: PlayerId | null = null;
  private readonly language: SiteLanguage;

  constructor(root: HTMLElement, app: OnlineGameAppBridge, roster: CharacterRosterEntry[]) {
    this.app = app;
    this.roster = roster;
    this.language = getInitialSiteLanguage();
    applyDocumentLanguage(this.language);
    this.syncLanguageUrl();
    this.app.setLanguage(this.language);
    this.pendingAutoJoinRoom = null;
    this.preferredCharacterIndex = this.readPreferredCharacterIndex();
    this.telemetry = new GrowthTelemetryClient();
    this.elements = this.render(root);
    this.canvasObserver = new MutationObserver(() => this.mountCanvas(root));
    this.canvasObserver.observe(root, { childList: true });
    this.mountCanvas(root);
    this.bindEvents();
    void this.refreshAccountState();
    this.renderAll();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
    this.telemetry.trackLandingView();
    this.setStatus(this.copy.status.connecting);
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

  private get copy() {
    return SITE_COPY[this.language];
  }

  private translate(portuguese: string, english: string): string {
    return this.language === "pt" ? portuguese : english;
  }

  private createPortraitImage(className: string, size: number, alt: string, eager = false): HTMLImageElement {
    const image = document.createElement("img");
    image.className = className;
    image.width = size;
    image.height = size;
    image.loading = eager ? "eager" : "lazy";
    image.decoding = "async";
    image.alt = alt;
    image.draggable = false;
    return image;
  }

  private renderPortrait(image: HTMLImageElement, entry: CharacterRosterEntry): void {
    const baseSrc = assetUrl(`/Assets/Characters/Animations/${entry.id}/south.png`);
    const src = entry.assetVersion
      ? `${baseSrc}?v=${encodeURIComponent(entry.assetVersion)}`
      : baseSrc;
    if (image.getAttribute("src") !== src) {
      image.src = src;
    }
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.realtimeReady = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/online`);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.realtimeReady = true;
      if (this.currentLobby?.roomCode) {
        this.pendingAutoJoinRoom = this.currentLobby.roomCode;
      }
      this.renderAll();
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      const hadActiveOnlineSession = Boolean(this.currentLobby || this.role || this.roomCode);
      const accountRefresh = this.reconnectingForAccountRefresh;
      this.reconnectingForAccountRefresh = false;
      this.realtimeReady = false;
      this.socket = null;
      this.role = null;
      this.roomCode = null;
      this.currentLobby = null;
      this.currentSessionState = null;
      this.quickMatchSearching = false;
      this.endlessMatchStarting = false;
      this.pendingAutoJoinRoom = null;
      if (hadActiveOnlineSession) {
        this.app.detachOnlineSession();
      }
      this.renderAll();
      if (accountRefresh) {
        this.setStatus(this.translate("Atualizando sua conta...", "Refreshing your account..."));
      } else if (hadActiveOnlineSession) {
        this.setStatus(this.copy.status.disconnected);
      } else if (this.isLocalFrontendOnlyHost()) {
        this.setStatus(this.translate("Conectando backend local...", "Connecting local backend..."));
      } else {
        this.setStatus(this.copy.status.disconnected);
      }
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      this.realtimeReady = false;
      if (this.currentLobby || this.role || this.roomCode) {
        this.setStatus(this.copy.status.connectionError);
      } else if (this.isLocalFrontendOnlyHost()) {
        this.setStatus(this.translate("Conectando backend local...", "Connecting local backend..."));
      }
      this.renderAll();
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
    this.elements.languagePortugueseButton.addEventListener("click", () => {
      this.changeLanguage("pt");
    });
    this.elements.languageEnglishButton.addEventListener("click", () => {
      this.changeLanguage("en");
    });
    this.elements.landingQuickMatchButton.addEventListener("click", () => {
      this.telemetry.track("quick_match_clicked", {
        context: { screen: this.getScreen() },
        payload: { characterIndex: this.preferredCharacterIndex },
      });
      this.startQuickMatch();
    });
    this.elements.landingEndlessButton.addEventListener("click", () => {
      this.startEndlessMatch();
    });
    this.elements.landingBotMatchButton.addEventListener("click", () => {
      this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
      this.app.startOfflineBotMatch(3);
      this.setStatus(this.copy.status.botMatchStarted);
      this.renderAll();
    });
    this.elements.landingFeedbackButton.addEventListener("click", () => {
      this.openFeedbackDialog();
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
        this.setStatus(this.copy.status.createLobbyUnavailable);
        return;
      }
      this.setStatus(this.copy.status.creatingLobby);
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
    this.elements.matchInfoToggleButton.addEventListener("click", () => {
      this.matchInfoPanelOpen = true;
      this.matchChatPanelOpen = false;
      this.renderMatchSurfaceState();
    });
    this.elements.matchChatToggleButton.addEventListener("click", () => {
      this.matchInfoPanelOpen = false;
      this.matchChatPanelOpen = true;
      this.renderMatchSurfaceState();
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
    this.elements.landingAccountPrimaryButton.addEventListener("click", () => {
      void this.createQuickAccount();
    });
    this.elements.landingAccountSecondaryButton.addEventListener("click", () => {
      void this.logoutAccount();
    });
    this.elements.landingAccountUsernameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.createQuickAccount();
      }
    });
    this.elements.feedbackCancelButton.addEventListener("click", () => {
      this.closeFeedbackDialog();
    });
    this.elements.feedbackDialog.addEventListener("click", (event) => {
      if (event.target === this.elements.feedbackDialog) {
        this.closeFeedbackDialog();
      }
    });
    this.elements.feedbackSendButton.addEventListener("click", () => {
      void this.submitFeedback();
    });
    this.elements.feedbackTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeFeedbackDialog();
      } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void this.submitFeedback();
      }
    });
  }

  private changeLanguage(language: SiteLanguage): void {
    if (language === this.language) {
      return;
    }
    persistSiteLanguage(language);
    window.location.assign(buildLocalizedUrl(language).toString());
  }

  private startQuickMatch(): void {
    if (this.quickMatchSearching) {
      return;
    }
    this.idleScreen = "landing";
    this.quickMatchSearching = true;
    this.renderAll();
    if (!this.send({ type: "quick-match", characterIndex: this.getPreferredAuthoritativeCharacterIndex() })) {
      this.quickMatchSearching = false;
      this.renderAll();
      this.setStatus(this.copy.status.quickMatchUnavailable);
      return;
    }
    this.setStatus(this.copy.status.searchingRoom);
  }

  private startEndlessMatch(): void {
    if (this.endlessMatchStarting) {
      return;
    }
    this.idleScreen = "landing";
    this.endlessMatchStarting = true;
    this.quickMatchSearching = false;
    this.renderAll();
    if (!this.send({ type: "endless-match", characterIndex: this.getPreferredAuthoritativeCharacterIndex() })) {
      this.endlessMatchStarting = false;
      this.renderAll();
      this.setStatus(this.translate("Modo infinito indisponivel. Reconectando...", "Endless mode is unavailable. Reconnecting..."));
      return;
    }
    this.setStatus(this.translate("Entrando na partida infinita...", "Joining the endless match..."));
  }

  private handleSetupPrimaryAction(): void {
    const lobby = this.currentLobby;
    if (!lobby || lobby.status !== "open") {
      return;
    }

    if (!lobby.selfSeat) {
      const firstFreeSeat = this.getFirstAvailableSeat(lobby);
      if (!firstFreeSeat) {
        this.setStatus(this.copy.status.roomFilledBeforeEnter);
        this.renderAll();
        return;
      }
      this.telemetry.track("seat_claim_clicked", {
        context: { roomCode: lobby.roomCode, screen: "setup" },
        payload: { seat: firstFreeSeat, characterIndex: this.preferredCharacterIndex },
      });
      this.autoClaimRoomCode = lobby.roomCode;
        this.send({ type: "claim-seat", seat: firstFreeSeat, characterIndex: this.getPreferredAuthoritativeCharacterIndex() });
      this.setStatus(this.copy.status.enteringSeat(firstFreeSeat));
      return;
    }

    const selfSeat = lobby.seats[lobby.selfSeat];
    if (!selfSeat.ready) {
      this.telemetry.track("ready_clicked", {
        context: { roomCode: lobby.roomCode, screen: "setup" },
        payload: { seat: lobby.selfSeat },
      });
      this.send({ type: "set-ready", ready: true });
      this.setStatus(this.copy.status.readyMarked);
    }
  }

  private async copyInvite(): Promise<void> {
    if (!this.currentLobby) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.currentLobby.roomCode);
      this.telemetry.track("invite_copied", {
        context: { roomCode: this.currentLobby.roomCode, screen: this.getScreen() },
      });
      this.setStatus(this.copy.status.inviteCopied);
    } catch {
      this.setStatus(this.copy.status.inviteCopyFailed);
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
      this.setStatus(this.copy.status.chatUnavailable);
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
        this.currentAccount = message.account;
        this.applySessionState(message.sessionState);
        this.lobbies = message.lobbies;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
        this.quickMatchQueuedCount = message.quickMatchQueued;
        if (this.pendingAutoJoinRoom) {
          this.send({ type: "join-lobby", roomCode: this.pendingAutoJoinRoom });
          this.setStatus(this.copy.status.enteringLobby);
        } else if (this.quickMatchSearching) {
          this.setStatus(this.copy.status.searchingRoom);
        } else if (this.endlessMatchStarting) {
          this.setStatus(this.translate("Entrando na partida infinita...", "Joining the endless match..."));
        } else {
          this.setStatus(this.copy.status.chooseStart);
        }
        this.renderAll();
        break;
      case "lobby-list":
        this.applySessionState(message.sessionState);
        this.lobbies = message.lobbies;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
        this.renderAll();
        break;
      case "lobby-joined":
        this.applySessionState(message.sessionState);
        this.role = message.role;
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.pendingAutoJoinRoom = null;
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
        this.setStatus(this.copy.status.lobbyLoaded);
        this.renderAll();
        break;
      case "lobby-updated":
        this.applySessionState(message.sessionState);
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
        this.applySessionState(message.sessionState);
        this.role = null;
        this.roomCode = null;
        this.currentLobby = null;
        this.pendingAutoJoinRoom = null;
        this.autoClaimRoomCode = null;
        this.updateLocation(null);
        this.app.detachOnlineSession();
        this.renderAll();
        this.setStatus(this.copy.status.returnedHome);
        break;
      case "match-started":
        this.applySessionState(message.sessionState);
        this.role = message.config.role;
        this.roomCode = message.config.roomCode;
        this.pendingAutoJoinRoom = null;
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
        this.setStatus(this.copy.status.matchStarted);
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
        this.applySessionState(message.sessionState);
        this.quickMatchQueuedCount = message.queued;
        this.onlineUsers = message.onlineUsers;
        this.onlinePlayers = message.onlinePlayers;
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
        this.setStatus(this.copy.status.peerLeft);
        break;
      case "error":
        this.applySessionState(this.currentSessionState);
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
    this.send({ type: "claim-seat", seat: firstFreeSeat, characterIndex: this.getPreferredAuthoritativeCharacterIndex() });
    this.setStatus(this.copy.status.autoEnteringSeat(firstFreeSeat));
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
    const copy = this.copy;
    const shell = document.createElement("div");
    shell.className = "experience-shell";

    const languageSwitcher = document.createElement("div");
    languageSwitcher.className = "experience-language-switcher";

    const languageLabel = document.createElement("span");
    languageLabel.className = "experience-language-switcher__label";
    languageLabel.textContent = this.translate("Idioma", "Language");

    const languagePortugueseButton = document.createElement("button");
    languagePortugueseButton.className = "experience-language-switcher__option";
    languagePortugueseButton.type = "button";
    languagePortugueseButton.textContent = copy.language.portuguese;

    const languageEnglishButton = document.createElement("button");
    languageEnglishButton.className = "experience-language-switcher__option";
    languageEnglishButton.type = "button";
    languageEnglishButton.textContent = copy.language.english;

    languageSwitcher.append(languageLabel, languagePortugueseButton, languageEnglishButton);

    const landing = document.createElement("section");
    landing.className = "experience-screen experience-screen--landing";

    const landingHero = document.createElement("div");
    landingHero.className = "experience-hero";

    const landingCopy = document.createElement("div");
    landingCopy.className = "experience-hero__copy";
    landingCopy.innerHTML = `
      <p class="experience-kicker">${copy.landing.kicker}</p>
      <h1>BOMBA PVP</h1>
      <p class="experience-hero__lead">${copy.landing.lead}</p>
    `;

    const landingMeta = document.createElement("p");
    landingMeta.className = "experience-hero__meta";

    const landingActions = document.createElement("div");
    landingActions.className = "experience-actions";

    const landingActionsPrimary = document.createElement("div");
    landingActionsPrimary.className = "experience-actions__group experience-actions__group--primary";

    const landingActionsSecondary = document.createElement("div");
    landingActionsSecondary.className = "experience-actions__group experience-actions__group--secondary";

    const landingAccountCard = document.createElement("div");
    landingAccountCard.className = "experience-account-card";

    const landingAccountKicker = document.createElement("p");
    landingAccountKicker.className = "experience-kicker";
    landingAccountKicker.textContent = this.translate("Conta opcional", "Optional account");

    const landingAccountTitle = document.createElement("p");
    landingAccountTitle.className = "experience-account__title";

    const landingAccountValue = document.createElement("p");
    landingAccountValue.className = "experience-account__value";

    const landingAccountForm = document.createElement("div");
    landingAccountForm.className = "experience-account__form";

    const landingAccountUsernameInput = document.createElement("input");
    landingAccountUsernameInput.className = "experience-account__input";
    landingAccountUsernameInput.type = "text";
    landingAccountUsernameInput.maxLength = 16;
    landingAccountUsernameInput.placeholder = this.translate("Seu username", "Your username");
    landingAccountUsernameInput.autocomplete = "off";
    landingAccountUsernameInput.spellcheck = false;

    const landingAccountPrimaryButton = document.createElement("button");
    landingAccountPrimaryButton.className = "experience-button experience-button--primary";
    landingAccountPrimaryButton.type = "button";

    const landingAccountSecondaryButton = document.createElement("button");
    landingAccountSecondaryButton.className = "experience-button experience-button--ghost";
    landingAccountSecondaryButton.type = "button";
    landingAccountSecondaryButton.textContent = this.translate("Sair da conta", "Log out");

    landingAccountForm.append(landingAccountUsernameInput, landingAccountPrimaryButton, landingAccountSecondaryButton);

    const landingAccountHint = document.createElement("p");
    landingAccountHint.className = "experience-account__hint";

    landingAccountCard.append(
      landingAccountKicker,
      landingAccountTitle,
      landingAccountValue,
      landingAccountForm,
      landingAccountHint,
    );

    const landingQuickMatchButton = document.createElement("button");
    landingQuickMatchButton.className = "experience-button experience-button--primary";
    landingQuickMatchButton.type = "button";
    landingQuickMatchButton.textContent = copy.landing.quickMatch;

    const landingEndlessButton = document.createElement("button");
    landingEndlessButton.className = "experience-button experience-button--secondary";
    landingEndlessButton.type = "button";
    landingEndlessButton.textContent = this.translate("Partida infinita", "Infinite match");

    const landingBotMatchButton = document.createElement("button");
    landingBotMatchButton.className = "experience-button experience-button--secondary";
    landingBotMatchButton.type = "button";
    landingBotMatchButton.textContent = copy.landing.botMatch;

    const landingLobbyButton = document.createElement("button");
    landingLobbyButton.className = "experience-button experience-button--secondary";
    landingLobbyButton.type = "button";
    landingLobbyButton.textContent = copy.landing.enterLobby;

    const landingFeedbackButton = document.createElement("button");
    landingFeedbackButton.className = "experience-button experience-button--ghost";
    landingFeedbackButton.type = "button";
    landingFeedbackButton.textContent = copy.landing.feedback;

    landingActionsPrimary.append(landingQuickMatchButton, landingLobbyButton);
    landingActionsSecondary.append(landingEndlessButton, landingBotMatchButton, landingFeedbackButton);
    landingActions.append(landingActionsPrimary, landingActionsSecondary);
    landingCopy.append(landingMeta, landingActions, landingAccountCard);

    const landingRoster = document.createElement("div");
    landingRoster.className = "experience-hero__art";

    const feedbackDialog = document.createElement("div");
    feedbackDialog.className = "experience-feedback";
    feedbackDialog.hidden = true;

    const feedbackCard = document.createElement("div");
    feedbackCard.className = "experience-feedback__card";

    const feedbackTitle = document.createElement("p");
    feedbackTitle.className = "experience-feedback__title";
    feedbackTitle.textContent = copy.landing.feedbackTitle;

    const feedbackPrompt = document.createElement("p");
    feedbackPrompt.className = "experience-feedback__prompt";
    feedbackPrompt.textContent = copy.landing.feedbackPrompt;

    const feedbackTextarea = document.createElement("textarea");
    feedbackTextarea.className = "experience-feedback__textarea";
    feedbackTextarea.rows = 6;
    feedbackTextarea.placeholder = copy.landing.feedbackPlaceholder;

    const feedbackStatus = document.createElement("p");
    feedbackStatus.className = "experience-feedback__status";

    const feedbackActions = document.createElement("div");
    feedbackActions.className = "experience-feedback__actions";

    const feedbackCancelButton = document.createElement("button");
    feedbackCancelButton.className = "experience-button experience-button--ghost";
    feedbackCancelButton.type = "button";
    feedbackCancelButton.textContent = copy.landing.feedbackCancel;

    const feedbackSendButton = document.createElement("button");
    feedbackSendButton.className = "experience-button experience-button--primary";
    feedbackSendButton.type = "button";
    feedbackSendButton.textContent = copy.landing.feedbackSend;

    feedbackActions.append(feedbackCancelButton, feedbackSendButton);
    feedbackCard.append(feedbackTitle, feedbackPrompt, feedbackTextarea, feedbackStatus, feedbackActions);
    feedbackDialog.append(feedbackCard);

    landingHero.append(landingCopy, landingRoster);
    landing.append(landingHero);

    const lobbyList = document.createElement("section");
    lobbyList.className = "experience-screen experience-screen--lobbies";

    const lobbyHeader = document.createElement("div");
    lobbyHeader.className = "experience-panel__header";

    const lobbyListBackButton = document.createElement("button");
    lobbyListBackButton.className = "experience-button experience-button--ghost";
    lobbyListBackButton.type = "button";
    lobbyListBackButton.textContent = copy.common.back;

    const lobbyListCreateButton = document.createElement("button");
    lobbyListCreateButton.className = "experience-button experience-button--primary";
    lobbyListCreateButton.type = "button";
    lobbyListCreateButton.textContent = copy.lobbies.create;

    const lobbyTitleWrap = document.createElement("div");
    lobbyTitleWrap.className = "experience-panel__title";
    lobbyTitleWrap.innerHTML = `
      <p class="experience-kicker">${copy.lobbies.kicker}</p>
      <h2>${copy.lobbies.title}</h2>
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
    setupBackButton.textContent = copy.common.back;

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
    setupCopyButton.textContent = copy.setup.copyInvite;

    const setupLeaveButton = document.createElement("button");
    setupLeaveButton.className = "experience-button experience-button--ghost";
    setupLeaveButton.type = "button";
    setupLeaveButton.textContent = copy.setup.leaveRoom;

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

    const selectorPortrait = this.createPortraitImage(
      "experience-character-summary__portrait",
      96,
      this.translate("Personagem selecionado", "Selected character"),
    );

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
      <p class="experience-kicker">${copy.controls.kicker}</p>
      <h3>${copy.controls.title}</h3>
      <div class="experience-controls">
        <div class="experience-controls__group">
          <span class="experience-controls__label">${copy.controls.move}</span>
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
          <span class="experience-controls__label">${copy.controls.actions}</span>
          <div class="experience-action-keys">
            <div class="experience-action-card">
              <span class="experience-key experience-key--action">Q</span>
              <strong>${copy.controls.bomb}</strong>
            </div>
            <div class="experience-action-card">
              <span class="experience-key experience-key--wide">Espaco</span>
              <strong>${copy.controls.ultimate}</strong>
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
    setupPrimaryButton.textContent = copy.setup.readyButton;

    const setupPrimaryHint = document.createElement("p");
    setupPrimaryHint.className = "experience-setup__hint";

    setupFooter.append(setupPrimaryButton, setupPrimaryHint);
    setupControls.append(setupPresenceList, setupFooter);

    setupGrid.append(setupCharacter, setupControls);
    setup.append(setupHeader, setupSeatStrip, setupGrid);

    const match = document.createElement("section");
    match.className = "experience-screen experience-screen--match";

    const matchStage = document.createElement("div");
    matchStage.className = "experience-match__stage";

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
    matchCopyButton.textContent = copy.match.invite;

    const matchLeaveButton = document.createElement("button");
    matchLeaveButton.className = "experience-button experience-button--ghost";
    matchLeaveButton.type = "button";
    matchLeaveButton.textContent = copy.match.leave;

    matchActions.append(matchCopyButton, matchLeaveButton);
    matchOverlay.append(matchCode, matchStatus, matchActions);

    const matchViewport = document.createElement("div");
    matchViewport.className = "experience-match__viewport";

    const matchDock = document.createElement("div");
    matchDock.className = "experience-match__dock";

    const matchDockTabs = document.createElement("div");
    matchDockTabs.className = "experience-match__dock-tabs";

    const matchInfoToggleButton = document.createElement("button");
    matchInfoToggleButton.className = "experience-match__toggle experience-match__toggle--info";
    matchInfoToggleButton.type = "button";
    matchInfoToggleButton.textContent = this.translate("Sala", "Room");

    const matchChatToggleButton = document.createElement("button");
    matchChatToggleButton.className = "experience-match__toggle experience-match__toggle--chat";
    matchChatToggleButton.type = "button";
    matchChatToggleButton.textContent = this.translate("Chat", "Chat");

    const matchInfoRail = document.createElement("aside");
    matchInfoRail.className = "experience-match__panel experience-match__panel--info";

    const matchInfoRailHeader = document.createElement("div");
    matchInfoRailHeader.className = "experience-match__panel-header";
    matchInfoRailHeader.innerHTML = `
      <p class="experience-kicker">${copy.match.infoKicker}</p>
      <h3>${copy.match.infoTitle}</h3>
      <p class="experience-match__rail-copy">${copy.match.infoCopy}</p>
    `;

    const matchRoster = document.createElement("div");
    matchRoster.className = "experience-match__roster";
    matchInfoRail.append(matchInfoRailHeader, matchRoster);

    const matchChatRail = document.createElement("aside");
    matchChatRail.className = "experience-match__panel experience-match__panel--chat";

    const matchChatHeading = document.createElement("div");
    matchChatHeading.className = "experience-match__chat-heading experience-match__panel-header";
    matchChatHeading.innerHTML = `
      <p class="experience-kicker">${copy.match.chatKicker}</p>
      <h3>${copy.match.chatTitle}</h3>
    `;

    const matchChatLog = document.createElement("div");
    matchChatLog.className = "experience-match__chat-log";

    const matchChatComposer = document.createElement("div");
    matchChatComposer.className = "experience-match__chat-composer";

    const matchChatInput = document.createElement("input");
    matchChatInput.className = "experience-match__chat-input";
    matchChatInput.type = "text";
    matchChatInput.maxLength = 280;
    matchChatInput.placeholder = copy.match.chatPlaceholder;
    matchChatInput.autocomplete = "off";

    const matchChatSend = document.createElement("button");
    matchChatSend.className = "experience-button experience-button--primary";
    matchChatSend.type = "button";
    matchChatSend.textContent = copy.match.send;

    matchChatComposer.append(matchChatInput, matchChatSend);
    matchChatRail.append(matchChatHeading, matchChatLog, matchChatComposer);
    matchDockTabs.append(matchInfoToggleButton, matchChatToggleButton);
    matchDock.append(matchDockTabs, matchInfoRail, matchChatRail);

    matchStage.append(
      matchViewport,
      matchOverlay,
      matchDock,
    );
    match.append(matchStage);

    const status = document.createElement("p");
    status.className = "experience-status";

    shell.append(languageSwitcher, landing, feedbackDialog, lobbyList, setup, match, status);
    root.prepend(shell);

    return {
      shell,
      languageSwitcher,
      languageLabel,
      languagePortugueseButton,
      languageEnglishButton,
      screens: {
        landing,
        "lobby-list": lobbyList,
        setup,
        match,
      },
      landingMeta,
      landingAccountTitle,
      landingAccountValue,
      landingAccountUsernameInput,
      landingAccountPrimaryButton,
      landingAccountSecondaryButton,
      landingAccountHint,
      landingQuickMatchButton,
      landingEndlessButton,
      landingBotMatchButton,
      landingLobbyButton,
      landingFeedbackButton,
      landingRoster,
      feedbackDialog,
      feedbackTextarea,
      feedbackSendButton,
      feedbackCancelButton,
      feedbackStatus,
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
      matchStage,
      matchDock,
      matchViewport,
      matchCode,
      matchStatus,
      matchCopyButton,
      matchLeaveButton,
      matchInfoToggleButton,
      matchChatToggleButton,
      matchInfoPanel: matchInfoRail,
      matchChatPanel: matchChatRail,
      matchRoster,
      matchChatLog,
      matchChatInput,
      matchChatSend,
      status,
    };
  }

  private renderAll(): void {
    this.renderLanguageSwitcher();
    this.renderLanding();
    this.renderAccountPanel();
    this.renderFeedbackDialog();
    this.renderLobbyList();
    this.renderCharacterSelector();
    this.renderSetup();
    this.renderMatch();
    this.renderMatchRoster();
    this.renderMatchChat();
    this.renderMatchSurfaceState();
    this.renderShellState();
  }

  private renderMatchSurfaceState(): void {
    const isMatchScreen = this.getScreen() === "match";
    this.elements.matchStage.dataset.infoOpen = isMatchScreen && this.matchInfoPanelOpen ? "true" : "false";
    this.elements.matchStage.dataset.chatOpen = isMatchScreen && this.matchChatPanelOpen ? "true" : "false";
    this.elements.matchDock.hidden = !isMatchScreen;
    this.elements.matchInfoToggleButton.setAttribute(
      "aria-expanded",
      isMatchScreen && this.matchInfoPanelOpen ? "true" : "false",
    );
    this.elements.matchChatToggleButton.setAttribute(
      "aria-expanded",
      isMatchScreen && this.matchChatPanelOpen ? "true" : "false",
    );
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
    if (this.currentSessionState?.kind === "queueing-classic" || this.currentSessionState?.kind === "queueing-endless") {
      return "setup";
    }
    const appMode = this.app.getCurrentMode();
    if (appMode === "match" || appMode === "match-result") {
      return "match";
    }
    if (this.currentLobby || this.quickMatchSearching || this.endlessMatchStarting || this.pendingAutoJoinRoom) {
      return "setup";
    }
    return this.idleScreen;
  }

  private renderLanguageSwitcher(): void {
    this.elements.languageLabel.textContent = this.translate("Idioma", "Language");
    this.elements.languagePortugueseButton.textContent = this.copy.language.portuguese;
    this.elements.languageEnglishButton.textContent = this.copy.language.english;
    this.elements.languagePortugueseButton.dataset.active = this.language === "pt" ? "true" : "false";
    this.elements.languageEnglishButton.dataset.active = this.language === "en" ? "true" : "false";
    this.elements.languagePortugueseButton.disabled = this.language === "pt";
    this.elements.languageEnglishButton.disabled = this.language === "en";
  }

  private applySessionState(nextState: OnlineSessionState | null | undefined): void {
    this.currentSessionState = nextState ?? null;
    this.quickMatchSearching = nextState?.kind === "queueing-classic";
    this.endlessMatchStarting = nextState?.kind === "queueing-endless";
  }

  private renderLanding(): void {
    const copy = this.copy;
    const pendingEntry = this.quickMatchSearching || this.endlessMatchStarting;
    const onlineActionsAvailable = this.realtimeReady;
    const feedbackAvailable = !this.isLocalFrontendOnlyHost();
    this.elements.landingMeta.textContent = this.quickMatchSearching
      ? copy.landing.searching
      : this.endlessMatchStarting
        ? this.translate("Entrando na arena infinita com jogadores e bots.", "Entering the endless arena with players and bots.")
        : onlineActionsAvailable
          ? copy.landing.meta(this.quickMatchQueuedCount, this.onlineUsers)
          : this.isLocalFrontendOnlyHost()
            ? this.translate("Conectando backend local. Contra bots continua funcionando.", "Connecting local backend. Bot matches still work.")
            : this.translate("Online indisponivel no momento. Contra bots continua funcionando.", "Online is unavailable right now. Bot matches still work.");
    this.elements.landingQuickMatchButton.disabled = pendingEntry || !onlineActionsAvailable;
    this.elements.landingEndlessButton.disabled = pendingEntry || !onlineActionsAvailable;
    this.elements.landingBotMatchButton.disabled = pendingEntry;
    this.elements.landingLobbyButton.disabled = pendingEntry || !onlineActionsAvailable;
    this.elements.landingFeedbackButton.disabled = !feedbackAvailable;
    this.elements.landingFeedbackButton.hidden = !feedbackAvailable;
    if (!feedbackAvailable && this.feedbackDialogOpen && !this.feedbackRequestPending) {
      this.feedbackDialogOpen = false;
    }
    this.elements.landingQuickMatchButton.textContent = this.quickMatchSearching
      ? copy.landing.quickMatchBusy
      : copy.landing.quickMatch;
    this.elements.landingEndlessButton.textContent = this.endlessMatchStarting
      ? this.translate("Entrando...", "Joining...")
      : this.translate("Partida infinita", "Infinite match");
    this.renderLandingCharacterPicker();
  }

  private renderFeedbackDialog(): void {
    const copy = this.copy;
    this.elements.feedbackDialog.hidden = !this.feedbackDialogOpen;
    this.elements.feedbackTextarea.disabled = this.feedbackRequestPending;
    this.elements.feedbackSendButton.disabled = this.feedbackRequestPending;
    this.elements.feedbackCancelButton.disabled = this.feedbackRequestPending;
    this.elements.feedbackSendButton.textContent = this.feedbackRequestPending
      ? copy.landing.feedbackSending
      : copy.landing.feedbackSend;
    if (!this.feedbackDialogOpen) {
      this.elements.feedbackStatus.textContent = "";
    }
  }

  private renderAccountPanel(): void {
    const account = this.currentAccount;
    const loggedIn = Boolean(account);
    const onlineActionsAvailable = this.realtimeReady;
    this.elements.landingAccountValue.hidden = !loggedIn;
    this.elements.landingAccountUsernameInput.hidden = loggedIn;
    this.elements.landingAccountPrimaryButton.hidden = loggedIn;
    this.elements.landingAccountSecondaryButton.hidden = !loggedIn;
    this.elements.landingAccountUsernameInput.disabled = this.accountRequestPending || !onlineActionsAvailable;
    this.elements.landingAccountPrimaryButton.disabled = this.accountRequestPending || loggedIn || !onlineActionsAvailable;
    this.elements.landingAccountSecondaryButton.disabled = this.accountRequestPending || !onlineActionsAvailable;
    this.elements.landingAccountUsernameInput.placeholder = this.translate("Seu username", "Your username");

    if (loggedIn && account) {
      this.elements.landingAccountTitle.textContent = this.translate("Conta ativa", "Active account");
      this.elements.landingAccountValue.textContent = account.username;
      this.elements.landingAccountPrimaryButton.textContent = this.translate("Conta salva", "Account saved");
      this.elements.landingAccountHint.textContent = this.translate(
        "Seu perfil ja fica reservado para progresso, personagens e skins quando essas partes entrarem no jogo.",
        "Your profile is already reserved for progression, characters, and skins when those systems ship.",
      );
      return;
    }

    this.elements.landingAccountTitle.textContent = this.translate("Reserve seu nome em um clique", "Reserve your name in one click");
    this.elements.landingAccountValue.textContent = "";
    this.elements.landingAccountPrimaryButton.textContent = this.accountRequestPending
      ? this.translate("Criando...", "Creating...")
      : this.translate("Criar conta", "Create account");
    this.elements.landingAccountHint.textContent = onlineActionsAvailable
      ? this.translate(
        "Continuar como convidado ainda funciona. A conta so adiciona um perfil pessoal para progresso futuro.",
        "Continuing as guest still works. The account only adds a personal profile for future progression.",
      )
      : this.isLocalFrontendOnlyHost()
        ? this.translate(
          "Seu perfil libera assim que o backend local terminar de conectar.",
          "Your profile becomes available as soon as the local backend finishes connecting.",
        )
        : this.translate(
          "Conta e progresso online ficam disponiveis quando o backend local estiver ativo.",
          "Account and online progression become available when the local backend is active.",
        );
  }

  private renderLobbyList(): void {
    const copy = this.copy;
    this.elements.lobbyListCount.textContent = this.lobbies.length === 0
      ? copy.lobbies.emptyCount
      : copy.lobbies.count(this.lobbies.length);
    this.elements.lobbyListList.replaceChildren();

    if (this.lobbies.length === 0) {
      const empty = document.createElement("div");
      empty.className = "experience-room-list__empty";
      empty.textContent = copy.lobbies.emptyBody;
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
          this.setStatus(copy.lobbies.joinUnavailable);
          return;
        }
        this.renderAll();
        this.setStatus(copy.lobbies.entering(this.getLobbyDisplayTitle(lobby)));
      });

      const title = document.createElement("strong");
      title.textContent = this.getLobbyDisplayTitle(lobby);

      const meta = document.createElement("span");
      meta.textContent = copy.setup.roomMeta(lobby.roomCode, lobby.occupantCount, LOBBY_MAX_PLAYERS);

      const status = document.createElement("span");
      status.className = "experience-room-card__status";
      status.textContent = lobby.status === "playing" ? copy.lobbies.roomStatusLive : copy.lobbies.roomStatusOpen;

      const occupants = document.createElement("div");
      occupants.className = "experience-room-card__occupants";
      occupants.append(
        ...ALL_PLAYER_IDS.map((playerId) => {
          const seat = lobby.seats[playerId];
          const pill = document.createElement("span");
          pill.className = "experience-room-card__occupant";
          pill.textContent = seat.clientId ? (seat.displayName || copy.lobbies.filledSeat(playerId)) : copy.lobbies.freeSeat(playerId);
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
    const copy = this.copy;
    const lobby = this.currentLobby;
    this.elements.setupCopyButton.hidden = !lobby;
    this.elements.setupLeaveButton.hidden = !lobby;
    this.elements.setupBackButton.textContent = lobby ? copy.common.home : copy.common.back;

    if (!lobby) {
      this.elements.setupEyebrow.textContent = this.quickMatchSearching
        ? copy.setup.kickerQuickMatch
        : this.endlessMatchStarting
          ? this.translate("Partida infinita", "Infinite match")
          : copy.setup.kickerLoading;
      this.elements.setupTitle.textContent = this.quickMatchSearching
        ? copy.setup.titleQuickMatch
        : this.endlessMatchStarting
          ? this.translate("Entrando na arena", "Joining arena")
          : copy.setup.titleLoading;
      this.elements.setupDescription.textContent = copy.setup.loadingDescription;
      this.elements.setupRoomMeta.textContent = this.quickMatchSearching
        ? copy.setup.loadingMetaQuickMatch
        : this.endlessMatchStarting
          ? this.translate(
            "Essa sala nunca para. Humanos assumem vagas de bots automaticamente.",
            "This room never stops. Humans automatically take over bot seats.",
          )
          : copy.setup.loadingMetaInvite;
      this.elements.setupSeatStrip.replaceChildren(this.buildSeatStripPlaceholder());
      this.renderPresenceList(this.quickMatchSearching || this.endlessMatchStarting);
      this.elements.setupPrimaryButton.textContent = this.quickMatchSearching || this.endlessMatchStarting
        ? this.translate("Entrando...", "Joining...")
        : copy.setup.loadingPrimaryWaiting;
      this.elements.setupPrimaryButton.disabled = true;
      this.elements.setupPrimaryHint.textContent = copy.setup.loadingHint;
      return;
    }

    const selfSeatId = lobby.selfSeat;
    const selfSeat = selfSeatId ? lobby.seats[selfSeatId] : null;
    const isMatchmakingLobby = lobby.roomKind === "matchmaking";
    this.elements.setupEyebrow.textContent = lobby.status === "playing"
      ? copy.setup.kickerLive
      : isMatchmakingLobby
        ? copy.setup.kickerQuickMatch
        : copy.setup.kickerRoom;
    this.elements.setupTitle.textContent = this.getLobbyDisplayTitle(lobby);
    this.elements.setupDescription.textContent = isMatchmakingLobby
      ? this.translate(
        "Voce entrou na fila classica. Assim que mais gente chegar, a partida comeca pelas regras normais.",
        "You entered the classic queue. As soon as more people arrive, the match starts with the standard rules.",
      )
      : copy.setup.description;
    this.elements.setupRoomMeta.textContent = copy.setup.roomMeta(lobby.roomCode, lobby.occupantCount, LOBBY_MAX_PLAYERS);
    this.elements.setupSeatStrip.replaceChildren(...this.buildSeatStrip(lobby));
    this.renderPresenceList(lobby.status === "open" && lobby.occupantCount < LOBBY_MAX_PLAYERS);

    if (!selfSeatId) {
      const firstFreeSeat = this.getFirstAvailableSeat(lobby);
      this.elements.setupPrimaryButton.textContent = firstFreeSeat
        ? copy.setup.enterSeat(firstFreeSeat)
        : copy.setup.roomFull;
      this.elements.setupPrimaryButton.disabled = !firstFreeSeat;
      this.elements.setupPrimaryHint.textContent = firstFreeSeat
        ? copy.setup.enterHint
        : copy.setup.roomFilledBeforeEnter;
      return;
    }

    if (selfSeat?.ready) {
      this.elements.setupPrimaryButton.textContent = copy.common.ready;
      this.elements.setupPrimaryButton.disabled = true;
      this.elements.setupPrimaryHint.textContent = lobby.occupantCount < 2
        ? copy.setup.readyDisabledSolo
        : copy.setup.readyDisabledQueue;
      return;
    }

    this.elements.setupPrimaryButton.textContent = copy.setup.readyButton;
    this.elements.setupPrimaryButton.disabled = false;
    this.elements.setupPrimaryHint.textContent = copy.setup.readyHint;
  }

  private buildSeatStripPlaceholder(): HTMLElement {
    const placeholder = document.createElement("div");
    placeholder.className = "experience-seat-pill";
    placeholder.textContent = this.copy.setup.preparingRoom;
    return placeholder;
  }

  private buildSeatStrip(lobby: LobbySummary): HTMLElement[] {
    const copy = this.copy;
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
      const occupant = seat.occupantType === "bot"
        ? (seat.displayName || "BOT")
        : seat.clientId
          ? (seat.displayName || copy.lobbies.filledSeat(playerId))
          : this.translate("Livre", "Open");
      pill.textContent = `P${playerId} | ${occupant}`;
      return pill;
    });
  }

  private renderPresenceList(showPresence: boolean): void {
    const copy = this.copy;
    this.elements.setupPresenceList.replaceChildren();
    this.elements.setupPresenceList.hidden = !showPresence;
    if (!showPresence) {
      return;
    }

    const heading = document.createElement("div");
    heading.className = "experience-presence__header";

    const title = document.createElement("span");
    title.className = "experience-controls__label";
    title.textContent = copy.presence.title;

    const meta = document.createElement("strong");
    meta.textContent = copy.presence.count(this.onlineUsers);

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
        playerId.textContent = this.formatPresenceLabel(entry);

        const status = document.createElement("span");
        status.textContent = entry.clientId === this.clientId ? copy.presence.self : copy.presence.available;

        item.append(playerId, status);
        return item;
      }),
    );

    this.elements.setupPresenceList.append(heading, list);
  }

  private renderCharacterSelector(): void {
    const copy = this.copy;
    const selected = this.getCharacter(this.preferredCharacterIndex);
    this.renderPortrait(this.elements.selectorPortrait, selected);
    this.elements.selectorName.textContent = selected.name;

    const lobby = this.currentLobby;
    if (lobby?.selfSeat) {
      const selfSeat = lobby.seats[lobby.selfSeat];
      this.elements.selectorNote.textContent = selfSeat.ready
        ? copy.character.readyNote
        : copy.character.pendingNote;
    } else if (this.quickMatchSearching) {
      this.elements.selectorNote.textContent = this.translate(
        "Seu bomber entra automaticamente na primeira vaga livre encontrada.",
        "Your bomber automatically joins the first open seat that is found.",
      );
    } else if (this.endlessMatchStarting) {
      this.elements.selectorNote.textContent = this.translate(
        "Voce entra na sala especial infinita e assume uma vaga de bot.",
        "You enter the special endless room and take over a bot seat.",
      );
    } else {
      this.elements.selectorNote.textContent = copy.character.defaultNote;
    }

    this.elements.selectorGrid.replaceChildren(
      ...this.roster.map((entry, index) => this.createCharacterOptionButton(
        entry,
        index,
        entry.defaultSlot ? copy.character.defaultSlot(entry.defaultSlot) : copy.character.selectable,
      )),
    );
  }

  private renderLandingCharacterPicker(): void {
    const selected = this.getCharacter(this.preferredCharacterIndex);
    const shell = document.createElement("div");
    shell.className = "experience-landing-picker";

    const header = document.createElement("div");
    header.className = "experience-landing-picker__header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "experience-landing-picker__title";

    const kicker = document.createElement("p");
    kicker.className = "experience-kicker";
    kicker.textContent = this.translate("Bomber selecionado", "Selected bomber");

    const title = document.createElement("strong");
    title.textContent = selected.name;

    const note = document.createElement("p");
    note.className = "experience-hero__meta";
    note.textContent = this.translate(
      "Sua escolha ja vale para partida rapida, infinita e contra bots.",
      "Your choice already applies to quick match, endless, and bot matches.",
    );

    titleWrap.append(kicker, title, note);

    const nav = document.createElement("div");
    nav.className = "experience-landing-picker__nav";

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "experience-button experience-button--ghost";
    previousButton.textContent = this.translate("Anterior", "Previous");
    previousButton.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex - 1);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "experience-button experience-button--ghost";
    nextButton.textContent = this.translate("Proximo", "Next");
    nextButton.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex + 1);
    });

    nav.append(previousButton, nextButton);
    header.append(titleWrap, nav);

    const focus = document.createElement("div");
    focus.className = "experience-character-summary experience-character-summary--landing";

    const portrait = this.createPortraitImage("experience-character-summary__portrait", 144, selected.name, true);
    this.renderPortrait(portrait, selected);

    const focusCopy = document.createElement("div");
    focusCopy.className = "experience-character-summary__copy";

    const focusName = document.createElement("p");
    focusName.className = "experience-character-summary__name";
    focusName.textContent = selected.name;

    const focusHint = document.createElement("p");
    focusHint.className = "experience-character-summary__note";
    focusHint.textContent = this.translate(
      "Troque aqui mesmo antes de entrar. O jogo abre ja com esse personagem preparado.",
      "Switch here before entering. The game opens with this character already prepared.",
    );

    focusCopy.append(focusName, focusHint);
    focus.append(portrait, focusCopy);

    const grid = document.createElement("div");
    grid.className = "experience-character-grid experience-character-grid--landing";
    grid.append(
      ...this.getLandingCharacterWindow(6).map((index) => {
        const entry = this.getCharacter(index);
        return this.createCharacterOptionButton(
          entry,
          index,
          index === this.preferredCharacterIndex
            ? this.translate("Selecionado agora", "Selected now")
            : this.translate("Clique para usar", "Click to use"),
        );
      }),
    );

    shell.append(header, focus, grid);
    this.elements.landingRoster.replaceChildren(shell);
  }

  private getLandingCharacterWindow(maxItems: number): number[] {
    if (this.roster.length === 0) {
      return [];
    }

    const desiredCount = Math.min(Math.max(1, maxItems), this.roster.length);
    const startIndex = this.preferredCharacterIndex - Math.floor(desiredCount / 2);
    const indices: number[] = [];
    const seen = new Set<number>();

    for (let offset = 0; indices.length < desiredCount && offset < this.roster.length * 2; offset += 1) {
      const index = this.wrapCharacterIndex(startIndex + offset);
      if (seen.has(index)) {
        continue;
      }
      seen.add(index);
      indices.push(index);
    }

    return indices;
  }

  private createCharacterOptionButton(entry: CharacterRosterEntry, index: number, hintText: string): HTMLButtonElement {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "experience-character-option";
    if (index === this.preferredCharacterIndex) {
      option.dataset.selected = "true";
    }

    const portrait = this.createPortraitImage("experience-character-option__portrait", 56, entry.name);
    this.renderPortrait(portrait, entry);

    const copy = document.createElement("div");
    copy.className = "experience-character-option__copy";

    const name = document.createElement("strong");
    name.textContent = entry.name;

    const hint = document.createElement("span");
    hint.textContent = hintText;

    copy.append(name, hint);
    option.append(portrait, copy);
    option.addEventListener("click", () => {
      this.updatePreferredCharacter(index);
    });
    return option;
  }

  private updatePreferredCharacter(nextIndex: number): void {
    this.preferredCharacterIndex = this.wrapCharacterIndex(nextIndex);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
      this.telemetry.track("character_selected", {
        context: { roomCode: this.currentLobby?.roomCode ?? null, screen: this.getScreen() },
        payload: {
          characterIndex: this.preferredCharacterIndex,
          authoritativeCharacterIndex: this.getPreferredAuthoritativeCharacterIndex(),
          characterId: this.getCharacter(this.preferredCharacterIndex).id,
        },
      });
    this.renderAll();

    if (this.currentLobby?.selfSeat && this.currentLobby.status === "open") {
      this.send({ type: "set-character", characterIndex: this.getPreferredAuthoritativeCharacterIndex() });
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
    this.preferredCharacterIndex = this.findRosterIndexByAuthoritativeCharacterIndex(seat.characterIndex);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
  }

  private syncPreferredCharacterFromMatchConfig(config: MatchStartConfig): void {
    const selected = config.characterSelections[config.localPlayerId] ?? this.getPreferredAuthoritativeCharacterIndex();
    this.preferredCharacterIndex = this.findRosterIndexByAuthoritativeCharacterIndex(selected);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
  }

  private renderMatch(): void {
    const copy = this.copy;
    const lobby = this.currentLobby;
    this.elements.matchCode.textContent = lobby
      ? lobby.roomMode === "endless"
        ? this.translate("Modo infinito", "Endless mode")
        : lobby.roomKind === "matchmaking"
          ? copy.setup.kickerQuickMatch
          : `${copy.common.room} ${lobby.roomCode}`
      : copy.common.arena;
    const botCount = lobby
      ? ALL_PLAYER_IDS.filter((playerId) => lobby.seats[playerId].occupantType === "bot").length
      : 0;
    this.elements.matchStatus.textContent = lobby
      ? lobby.roomMode === "endless"
        ? this.translate(
          `${lobby.occupantCount} jogadores + ${botCount} bots`,
          `${lobby.occupantCount} players + ${botCount} bots`,
        )
        : this.translate(
          `${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} jogadores na partida`,
          `${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} players in match`,
        )
      : copy.match.liveStatus;
    this.elements.matchCopyButton.disabled = !lobby;
    this.elements.matchLeaveButton.disabled = !lobby;
  }

  private renderMatchRoster(): void {
    const copy = this.copy;
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
        if (seat.occupantType === "bot") {
          card.dataset.bot = "true";
        }

        const title = document.createElement("strong");
        title.textContent = `P${playerId}`;

        const body = document.createElement("span");
        body.textContent = seat.occupantType === "bot"
          ? (seat.displayName || "BOT")
          : seat.clientId
            ? (seat.displayName || copy.match.seatConnected)
            : copy.match.seatOpen;

        card.append(title, body);
        return card;
      }),
    );
  }

  private renderMatchChat(): void {
    const copy = this.copy;
    this.elements.matchChatLog.replaceChildren();
    const entries = this.currentLobby?.chat ?? [];
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "experience-match__chat-empty";
      empty.textContent = copy.match.chatEmpty;
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
    return this.clientId ? [{ clientId: this.clientId, displayName: null }] : [];
  }

  private formatPresenceLabel(entry: OnlinePresenceEntry): string {
    if (entry.displayName) {
      return entry.displayName;
    }
    const clientId = entry.clientId;
    const compact = clientId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const suffix = compact.slice(-4) || compact;
    return this.copy.presence.id(suffix);
  }

  private async refreshAccountState(): Promise<void> {
    try {
      const response = await fetch("/api/me", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json() as { account?: PlayerAccount | null };
      this.currentAccount = payload.account ?? null;
      this.renderAll();
    } catch {
      // Account state is optional and must not block gameplay.
    }
  }

  private async createQuickAccount(): Promise<void> {
    if (this.accountRequestPending || this.currentAccount) {
      return;
    }
    const validation = validateUsername(this.elements.landingAccountUsernameInput.value);
    if (!validation.ok) {
      this.setStatus(validation.message ?? this.translate("Username invalido.", "Invalid username."));
      return;
    }

    this.accountRequestPending = true;
    this.renderAll();
    try {
      const response = await fetch("/api/account/quick-create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: validation.username }),
      });
      const payload = await response.json() as { account?: PlayerAccount | null; error?: string };
      if (!response.ok) {
        this.setStatus(payload.error ?? this.translate("Nao foi possivel criar sua conta agora.", "Could not create your account right now."));
        return;
      }
      this.currentAccount = payload.account ?? null;
      this.elements.landingAccountUsernameInput.value = "";
      if (this.currentAccount) {
        this.setStatus(this.translate(`Conta ${this.currentAccount.username} criada.`, `Account ${this.currentAccount.username} created.`));
      }
      this.refreshConnectionForAccountChange();
    } catch {
      this.setStatus(this.translate("Erro ao criar a conta.", "Error creating account."));
    } finally {
      this.accountRequestPending = false;
      this.renderAll();
    }
  }

  private async logoutAccount(): Promise<void> {
    if (this.accountRequestPending || !this.currentAccount) {
      return;
    }
    this.accountRequestPending = true;
    this.renderAll();
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
      });
      if (!response.ok) {
        this.setStatus(this.translate("Nao foi possivel sair da conta agora.", "Could not log out right now."));
        return;
      }
      this.currentAccount = null;
      this.setStatus(this.translate(
        "Conta desconectada. Voce pode continuar jogando como convidado.",
        "Account disconnected. You can keep playing as a guest.",
      ));
      this.refreshConnectionForAccountChange();
    } catch {
      this.setStatus(this.translate("Erro ao sair da conta.", "Error logging out."));
    } finally {
      this.accountRequestPending = false;
      this.renderAll();
    }
  }

  private openFeedbackDialog(): void {
    if (this.feedbackDialogOpen) {
      this.elements.feedbackTextarea.focus();
      return;
    }
    this.feedbackDialogOpen = true;
    this.feedbackRequestPending = false;
    this.telemetry.track("feedback_opened", {
      context: {
        screen: this.getScreen(),
        roomCode: this.currentLobby?.roomCode ?? null,
      },
    });
    this.renderAll();
    window.setTimeout(() => {
      this.elements.feedbackTextarea.focus();
      this.elements.feedbackTextarea.select();
    }, 0);
  }

  private closeFeedbackDialog(): void {
    if (this.feedbackRequestPending) {
      return;
    }
    this.feedbackDialogOpen = false;
    this.renderAll();
  }

  private async submitFeedback(): Promise<void> {
    if (!this.feedbackDialogOpen || this.feedbackRequestPending) {
      return;
    }

    const message = this.elements.feedbackTextarea.value.trim();
    if (!message) {
      this.elements.feedbackStatus.textContent = this.translate("Escreva alguma coisa antes de enviar.", "Write something before sending.");
      return;
    }

    this.feedbackRequestPending = true;
    this.elements.feedbackStatus.textContent = "";
    this.renderAll();
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message,
          screen: this.getScreen(),
          roomCode: this.currentLobby?.roomCode ?? null,
        }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        this.elements.feedbackStatus.textContent = payload.error ?? this.copy.landing.feedbackError;
        return;
      }

      this.telemetry.track("feedback_submitted", {
        context: {
          screen: this.getScreen(),
          roomCode: this.currentLobby?.roomCode ?? null,
        },
        payload: { messageLength: message.length },
      });
      this.elements.feedbackTextarea.value = "";
      this.feedbackDialogOpen = false;
      this.setStatus(this.copy.landing.feedbackThanks);
      this.renderAll();
    } catch {
      this.elements.feedbackStatus.textContent = this.copy.landing.feedbackError;
    } finally {
      this.feedbackRequestPending = false;
      this.renderAll();
    }
  }

  private refreshConnectionForAccountChange(): void {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
      this.connect();
      return;
    }
    this.reconnectingForAccountRefresh = true;
    this.socket.close();
  }

  private mountCanvas(root: HTMLElement): void {
    const canvas = root.querySelector('canvas[data-game-canvas="true"]');
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

  private getPreferredAuthoritativeCharacterIndex(): number {
    return this.getAuthoritativeCharacterIndex(this.preferredCharacterIndex);
  }

  private getAuthoritativeCharacterIndex(rosterIndex: number): number {
    const entry = this.getCharacter(rosterIndex);
    return typeof entry.selectionIndex === "number"
      ? entry.selectionIndex
      : this.wrapCharacterIndex(rosterIndex);
  }

  private findRosterIndexByAuthoritativeCharacterIndex(authoritativeIndex: number): number {
    const rosterIndex = this.roster.findIndex((entry) => entry.selectionIndex === authoritativeIndex);
    return rosterIndex >= 0 ? rosterIndex : this.wrapCharacterIndex(authoritativeIndex);
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
    if (this.statusClearTimer !== null) {
      window.clearTimeout(this.statusClearTimer);
      this.statusClearTimer = null;
    }
    this.elements.status.textContent = message;
    const persistentMessages = new Set([
      this.copy.status.connecting,
      this.copy.status.disconnected,
      this.copy.status.connectionError,
      this.copy.status.searchingRoom,
      this.copy.status.enteringLobby,
      this.translate("Entrando na partida infinita...", "Joining the endless match..."),
      this.translate("Conectando backend local...", "Connecting local backend..."),
      this.translate("Atualizando sua conta...", "Refreshing your account..."),
    ]);
    if (message.length === 0 || persistentMessages.has(message)) {
      return;
    }
    const matchScreen = this.getScreen() === "match";
    const durationMs = matchScreen ? 900 : 2200;
    this.statusClearTimer = window.setTimeout(() => {
      if (this.elements.status.textContent === message) {
        this.elements.status.textContent = "";
      }
      this.statusClearTimer = null;
    }, durationMs);
  }

  private send(payload: object): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private isLocalFrontendOnlyHost(): boolean {
    return (
      window.location.hostname === "127.0.0.1"
      || window.location.hostname === "localhost"
    ) && window.location.port !== "8787";
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
    const url = buildLocalizedUrl(this.language);
    void roomCode;
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
  }

  private syncLanguageUrl(): void {
    const localizedUrl = buildLocalizedUrl(this.language);
    localizedUrl.searchParams.delete("room");
    if (localizedUrl.toString() === window.location.href) {
      return;
    }
    window.history.replaceState({}, "", localizedUrl);
  }

}
