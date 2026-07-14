import type { CharacterRosterEntry } from "../Engine/assets";
import {
  ARENA_THEME_LIBRARY,
  DEFAULT_ARENA_THEME_ID,
  getArenaThemeById,
} from "../Arenas/arena-theme-library";
import { buildArenaThemeUrl } from "../Arenas/arena-theme-selection";
import { assetUrl } from "../Engine/asset-url";
import { ALL_PLAYER_IDS } from "../Gameplay/types";
import type { Mode, PlayerId } from "../Gameplay/types";
import {
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "../UiLayouts/browser-storage";
import {
  applyDocumentLanguage,
  buildLocalizedUrl,
  getInitialSiteLanguage,
  persistSiteLanguage,
  SITE_COPY,
  type SiteCopy,
  type SiteLanguage,
} from "../UiLayouts/i18n";
import type { PlayerAccount, UsernameValidationResult } from "./account";
import {
  USERNAME_ALLOWED_PATTERN_SOURCE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from "./account";
import type { PlayerBillingStatus } from "./billing";
import { pickSurpriseCharacterIndex } from "./character-surprise";
import type { OnlineSessionState } from "./matchmaking";
import { isLobbyCardJoinDisabled } from "./lobby-rules";
import { buildReconnectWebSocketUrl } from "./reconnect-session";
import {
  buildRoomInviteUrl,
  copyTextWithFallback,
  formatInviteCopyManualStatus,
  normalizeRoomCode,
  readRoomCodeFromUrl,
  resolveManualLobbyJoinCode,
  resolvePastedLobbyJoinCode,
} from "./room-invite";
export {
  buildRoomInviteUrl,
  copyTextWithFallback,
  formatInviteCopyManualStatus,
  normalizeRoomCode,
  readRoomCodeFromUrl,
  resolveManualLobbyJoinCode,
  resolvePastedLobbyJoinCode,
} from "./room-invite";
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
  returnToMenu(): void;
  getAudioSettings(): { volume: number; muted: boolean };
  setAudioVolume(volume: number): void;
  setAudioMuted(muted: boolean): void;
}

type ExperienceScreen = "landing" | "lobby-list" | "setup" | "match";
type IdleScreen = "landing" | "lobby-list";

interface SessionElements {
  shell: HTMLDivElement;
  rail: HTMLDivElement;
  railItems: Record<ExperienceScreen, HTMLSpanElement>;
  languageSwitcher: HTMLDivElement;
  languageLabel: HTMLSpanElement;
  languagePortugueseButton: HTMLButtonElement;
  languageEnglishButton: HTMLButtonElement;
  screens: Record<ExperienceScreen, HTMLElement>;
  landingMeta: HTMLParagraphElement;
  landingReturnBrief: HTMLDivElement;
  landingReturnBriefKicker: HTMLParagraphElement;
  landingReturnBriefTitle: HTMLParagraphElement;
  landingReturnBriefBody: HTMLParagraphElement;
  landingAccountTitle: HTMLParagraphElement;
  landingAccountValue: HTMLParagraphElement;
  landingAccountUsernameInput: HTMLInputElement;
  landingAccountPrimaryButton: HTMLButtonElement;
  landingAccountSecondaryButton: HTMLButtonElement;
  landingAccountHint: HTMLParagraphElement;
  landingBillingTitle: HTMLParagraphElement;
  landingBillingStatus: HTMLParagraphElement;
  landingBillingButton: HTMLButtonElement;
  landingBillingHint: HTMLParagraphElement;
  landingQuickMatchButton: HTMLButtonElement;
  landingEndlessButton: HTMLButtonElement;
  landingBotMatchButton: HTMLButtonElement;
  landingBotIntensityButtons: HTMLButtonElement[];
  landingArenaThemeLinks: HTMLAnchorElement[];
  landingLobbyButton: HTMLButtonElement;
  landingFeedbackButton: HTMLButtonElement;
  landingAudioMuteButton: HTMLButtonElement;
  landingAudioVolumeInput: HTMLInputElement;
  landingDevLab: HTMLElement;
  landingRoster: HTMLDivElement;
  feedbackDialog: HTMLDivElement;
  feedbackTextarea: HTMLTextAreaElement;
  feedbackCounter: HTMLParagraphElement;
  feedbackSendButton: HTMLButtonElement;
  feedbackCancelButton: HTMLButtonElement;
  feedbackStatus: HTMLParagraphElement;
  lobbyListBackButton: HTMLButtonElement;
  lobbyListCreateButton: HTMLButtonElement;
  lobbyCodeForm: HTMLFormElement;
  lobbyCodeInput: HTMLInputElement;
  lobbyCodeSubmitButton: HTMLButtonElement;
  lobbyCodeHint: HTMLParagraphElement;
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
  selectorSurpriseButton: HTMLButtonElement;
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
  matchFullscreenButton: HTMLButtonElement;
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
const WEBSOCKET_OPEN_READY_STATE = 1;
const SESSION_RETURN_BRIEF_VERSION = 1;
const SESSION_RETURN_BRIEF_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const SESSION_RETURN_BRIEF_STORAGE_KEY = "bomba-session-return-brief";
export const SESSION_RETURN_BRIEF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const BOT_MATCH_FILL_STORAGE_KEY = "bomba-bot-match-fill";
export const BOT_MATCH_FILL_OPTIONS = [1, 2, 3] as const;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_REQUEST_TIMEOUT_MS = 10_000;

export type BotMatchFill = typeof BOT_MATCH_FILL_OPTIONS[number];

const DEFAULT_BOT_MATCH_FILL: BotMatchFill = 3;
const PREFERRED_CHARACTER_STORAGE_KEY = "mistbridge-preferred-character-index";

export type SessionReturnMode = "quick-match" | "endless" | "bot-match" | "lobby";

interface SessionReturnBriefBase {
  version: typeof SESSION_RETURN_BRIEF_VERSION;
  savedAtMs: number;
  characterName: string;
}

export interface SessionEntryReturnBrief extends SessionReturnBriefBase {
  type: "entry";
  mode: SessionReturnMode;
}

export interface SessionMatchResultReturnBrief extends SessionReturnBriefBase {
  type: "match-result";
  roomCode: string | null;
  winner: PlayerId;
  winnerLabel: string;
  selfSeat: PlayerId | null;
  localWon: boolean;
  roundNumber: number;
}

export type SessionReturnBrief = SessionEntryReturnBrief | SessionMatchResultReturnBrief;

export interface SessionReturnBriefView {
  kicker: string;
  title: string;
  body: string;
}

export type SetupLoadingMode = "quick-match" | "endless" | "invite";

export interface SetupLoadingBriefStep {
  label: string;
  text: string;
  state: "ready" | "active" | "pending";
}

export interface SetupLoadingBrief {
  steps: SetupLoadingBriefStep[];
  primaryLabel: string;
  hint: string;
}

export interface SetupLoadingBriefOptions {
  mode: SetupLoadingMode;
  onlineUsers: number;
  queuedCount: number;
  roomCode: string | null;
  realtimeReady: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionReturnMode(value: unknown): value is SessionReturnMode {
  return value === "quick-match" || value === "endless" || value === "bot-match" || value === "lobby";
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isBotMatchFill(value: unknown): value is BotMatchFill {
  return value === 1 || value === 2 || value === 3;
}

export function parseStoredBotMatchFill(raw: string | null | undefined): BotMatchFill {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && isBotMatchFill(parsed)
    ? parsed
    : DEFAULT_BOT_MATCH_FILL;
}

function isFreshSessionReturnBrief(savedAtMs: number, nowMs: number): boolean {
  return savedAtMs <= nowMs + SESSION_RETURN_BRIEF_FUTURE_TOLERANCE_MS
    && nowMs - savedAtMs <= SESSION_RETURN_BRIEF_MAX_AGE_MS;
}

export function parseStoredSessionReturnBrief(raw: string | null, nowMs = Date.now()): SessionReturnBrief | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)
    || parsed.version !== SESSION_RETURN_BRIEF_VERSION
    || typeof parsed.savedAtMs !== "number"
    || !Number.isFinite(parsed.savedAtMs)
    || !isFreshSessionReturnBrief(parsed.savedAtMs, nowMs)
    || typeof parsed.characterName !== "string"
    || parsed.characterName.trim().length === 0
  ) {
    return null;
  }

  const base = {
    version: SESSION_RETURN_BRIEF_VERSION,
    savedAtMs: parsed.savedAtMs,
    characterName: parsed.characterName,
  } satisfies SessionReturnBriefBase;

  if (parsed.type === "entry" && isSessionReturnMode(parsed.mode)) {
    return {
      ...base,
      type: "entry",
      mode: parsed.mode,
    };
  }

  if (parsed.type === "match-result"
    && isPlayerId(parsed.winner)
    && (parsed.selfSeat === null || isPlayerId(parsed.selfSeat))
    && typeof parsed.localWon === "boolean"
    && typeof parsed.roundNumber === "number"
    && Number.isFinite(parsed.roundNumber)
    && parsed.roundNumber >= 1
    && typeof parsed.winnerLabel === "string"
    && parsed.winnerLabel.trim().length > 0
    && (parsed.roomCode === null || typeof parsed.roomCode === "string")
  ) {
    return {
      ...base,
      type: "match-result",
      roomCode: parsed.roomCode,
      winner: parsed.winner,
      winnerLabel: parsed.winnerLabel,
      selfSeat: parsed.selfSeat,
      localWon: parsed.localWon,
      roundNumber: Math.floor(parsed.roundNumber),
    };
  }

  return null;
}

function getSessionReturnModeLabel(copy: SiteCopy, mode: SessionReturnMode): string {
  switch (mode) {
    case "quick-match":
      return copy.landing.returnModeQuickMatch;
    case "endless":
      return copy.landing.returnModeEndless;
    case "bot-match":
      return copy.landing.returnModeBotMatch;
    case "lobby":
      return copy.landing.returnModeLobby;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function formatSessionReturnBrief(
  copy: SiteCopy,
  brief: SessionReturnBrief,
  nowMs = Date.now(),
): SessionReturnBriefView | null {
  if (!isFreshSessionReturnBrief(brief.savedAtMs, nowMs)) {
    return null;
  }

  if (brief.type === "entry") {
    return {
      kicker: copy.landing.returnBriefKicker,
      title: copy.landing.returnBriefEntryTitle(getSessionReturnModeLabel(copy, brief.mode)),
      body: copy.landing.returnBriefEntryBody(brief.characterName),
    };
  }

  const roomLabel = brief.roomCode ? copy.landing.returnBriefRoom(brief.roomCode) : copy.landing.returnBriefOnlineMatch;
  return {
    kicker: copy.landing.returnBriefKicker,
    title: brief.localWon ? copy.landing.returnBriefWinTitle : copy.landing.returnBriefLossTitle(brief.winnerLabel),
    body: copy.landing.returnBriefResultBody(brief.roundNumber, roomLabel),
  };
}

export function canSendLobbyAction(realtimeReady: boolean, socketReadyState: number | null | undefined): boolean {
  return realtimeReady && socketReadyState === WEBSOCKET_OPEN_READY_STATE;
}

type LobbyCardActionTarget = Pick<HTMLButtonElement, "disabled" | "addEventListener">;

export function configureLobbyCardAction(
  card: LobbyCardActionTarget,
  disabled: boolean,
  onJoin: () => void,
): void {
  card.disabled = disabled;
  if (!disabled) {
    card.addEventListener("click", onJoin);
  }
}

export function resolveReconnectRoomCode(
  activeLobbyRoomCode: string | null | undefined,
  roomCode: string | null | undefined,
  pendingAutoJoinRoom: string | null | undefined,
): string | null {
  return activeLobbyRoomCode ?? roomCode ?? pendingAutoJoinRoom ?? null;
}

export function formatLobbyReadyReminder(copy: SiteCopy, lobby: LobbySummary): string {
  const waitingPlayers = ALL_PLAYER_IDS
    .filter((playerId) => {
      const seat = lobby.seats[playerId];
      return (Boolean(seat.clientId) || seat.occupantType === "bot") && !seat.ready;
    })
    .map((playerId) => {
      const displayName = lobby.seats[playerId].displayName?.trim();
      return displayName ? `${displayName} (P${playerId})` : `P${playerId}`;
    });

  if (waitingPlayers.length === 0) {
    return copy.setup.readyStarting;
  }

  return copy.setup.readyWaitingFor(waitingPlayers.join(", "), waitingPlayers.length);
}

export function formatSetupLoadingBrief(copy: SiteCopy, options: SetupLoadingBriefOptions): SetupLoadingBrief {
  const modeStepText = (() => {
    switch (options.mode) {
      case "quick-match":
        return options.queuedCount > 0
          ? copy.setup.loadingQueueStatus(options.queuedCount)
          : copy.setup.loadingAutoRoom;
      case "endless":
        return copy.setup.loadingEndlessRoom;
      case "invite":
        return options.roomCode
          ? copy.setup.loadingInviteRoom(options.roomCode)
          : copy.setup.loadingMetaInvite;
      default: {
        const neverMode: never = options.mode;
        return neverMode;
      }
    }
  })();

  return {
    steps: [
      {
        label: "01",
        text: options.realtimeReady
          ? copy.setup.loadingOnlineReady(options.onlineUsers)
          : copy.setup.loadingOnlineWaiting,
        state: options.realtimeReady ? "ready" : "active",
      },
      {
        label: "02",
        text: modeStepText,
        state: options.realtimeReady ? "active" : "pending",
      },
      {
        label: "03",
        text: copy.setup.loadingCharacterLocked,
        state: "pending",
      },
    ],
    primaryLabel: options.mode === "quick-match"
      ? copy.setup.loadingCancelSearch
      : copy.setup.loadingBackHome,
    hint: options.mode === "quick-match"
      ? copy.setup.loadingCancelHint
      : copy.setup.loadingBackHomeHint,
  };
}

export function formatUsernameInputTitle(language: SiteLanguage): string {
  return language === "pt"
    ? `Use ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres: letras, numeros e underscore.`
    : `Use ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters: letters, numbers, and underscore.`;
}

export function formatUsernameValidationMessage(validation: UsernameValidationResult, language: SiteLanguage): string {
  if (validation.ok) {
    return "";
  }
  switch (validation.reason) {
    case "too-short":
      return language === "pt"
        ? `Use pelo menos ${USERNAME_MIN_LENGTH} caracteres.`
        : `Use at least ${USERNAME_MIN_LENGTH} characters.`;
    case "too-long":
      return language === "pt"
        ? `Use no maximo ${USERNAME_MAX_LENGTH} caracteres.`
        : `Use at most ${USERNAME_MAX_LENGTH} characters.`;
    case "invalid-characters":
      return language === "pt"
        ? "Use apenas letras, numeros e underscore."
        : "Use only letters, numbers, and underscore.";
    default:
      return language === "pt" ? "Username invalido." : "Invalid username.";
  }
}

export function applyUsernameInputConstraints(
  input: Pick<HTMLInputElement, "autocomplete" | "maxLength" | "minLength" | "pattern" | "spellcheck" | "title">,
  language: SiteLanguage,
): void {
  input.minLength = USERNAME_MIN_LENGTH;
  input.maxLength = USERNAME_MAX_LENGTH;
  input.pattern = USERNAME_ALLOWED_PATTERN_SOURCE;
  input.title = formatUsernameInputTitle(language);
  input.autocomplete = "username";
  input.spellcheck = false;
}

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
  private reconnectToken: string | null = null;
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
  private botMatchFill: BotMatchFill = DEFAULT_BOT_MATCH_FILL;
  private idleScreen: IdleScreen = "landing";
  private autoClaimRoomCode: string | null = null;
  private currentAccount: PlayerAccount | null = null;
  private currentBillingStatus: PlayerBillingStatus | null = null;
  private accountRequestPending = false;
  private billingRequestPending = false;
  private billingCheckoutPending = false;
  private feedbackDialogOpen = false;
  private feedbackRequestPending = false;
  private matchInfoPanelOpen = false;
  private matchChatPanelOpen = false;
  private matchChromeVisible = true;
  private matchChromeHideTimer: number | null = null;
  private statusClearTimer: number | null = null;
  private reconnectingForAccountRefresh = false;
  private leaveRequested = false;
  private realtimeReady = false;
  private currentSessionState: OnlineSessionState | null = null;
  private sessionReturnBrief: SessionReturnBrief | null = null;
  private readonly telemetry: GrowthTelemetryClient;
  private observedMatchWinner: PlayerId | null = null;
  private readonly language: SiteLanguage;
  private readonly selectedArenaThemeId: string;

  constructor(
    root: HTMLElement,
    app: OnlineGameAppBridge,
    roster: CharacterRosterEntry[],
    arenaThemeId = DEFAULT_ARENA_THEME_ID,
  ) {
    this.app = app;
    this.roster = roster;
    this.selectedArenaThemeId = getArenaThemeById(arenaThemeId)?.id
      ?? getArenaThemeById(DEFAULT_ARENA_THEME_ID)?.id
      ?? ARENA_THEME_LIBRARY[0].id;
    this.language = getInitialSiteLanguage();
    applyDocumentLanguage(this.language);
    this.pendingAutoJoinRoom = typeof window === "undefined" ? null : readRoomCodeFromUrl(window.location.href);
    this.syncLanguageUrl(this.pendingAutoJoinRoom);
    this.app.setLanguage(this.language);
    this.preferredCharacterIndex = this.readPreferredCharacterIndex();
    this.botMatchFill = this.readBotMatchFill();
    this.sessionReturnBrief = this.readSessionReturnBrief();
    this.telemetry = new GrowthTelemetryClient();
    this.elements = this.render(root);
    this.canvasObserver = new MutationObserver(() => this.mountCanvas(root));
    this.canvasObserver.observe(root, { childList: true });
    this.mountCanvas(root);
    this.bindEvents();
    void this.refreshAccountState();
    void this.refreshBillingStatus();
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

  private isFullscreenSupported(): boolean {
    return typeof document !== "undefined" && typeof this.elements.matchStage.requestFullscreen === "function";
  }

  private isMatchStageFullscreen(): boolean {
    return typeof document !== "undefined" && document.fullscreenElement === this.elements.matchStage;
  }

  private async toggleMatchFullscreen(): Promise<void> {
    if (!this.isFullscreenSupported()) {
      this.setStatus(this.translate("Tela cheia indisponivel neste navegador.", "Fullscreen is unavailable in this browser."));
      return;
    }
    try {
      if (this.isMatchStageFullscreen()) {
        await document.exitFullscreen();
      } else {
        await this.elements.matchStage.requestFullscreen();
      }
    } catch {
      this.setStatus(this.translate("Nao foi possivel abrir a tela cheia agora.", "Could not enter fullscreen right now."));
    } finally {
      this.renderMatchSurfaceState();
      this.refreshMatchChromeAutohide();
    }
  }

  private clearMatchChromeHideTimer(): void {
    if (this.matchChromeHideTimer !== null) {
      window.clearTimeout(this.matchChromeHideTimer);
      this.matchChromeHideTimer = null;
    }
  }

  private shouldAutoHideMatchChrome(): boolean {
    return this.getScreen() === "match"
      && this.isMatchStageFullscreen()
      && !this.matchInfoPanelOpen
      && !this.matchChatPanelOpen;
  }

  private setMatchChromeVisible(visible: boolean): void {
    if (this.matchChromeVisible === visible) {
      return;
    }
    this.matchChromeVisible = visible;
    this.renderMatchSurfaceState();
  }

  private refreshMatchChromeAutohide(): void {
    this.clearMatchChromeHideTimer();
    if (!this.shouldAutoHideMatchChrome()) {
      this.setMatchChromeVisible(true);
      return;
    }
    this.setMatchChromeVisible(true);
    this.matchChromeHideTimer = window.setTimeout(() => {
      if (!this.shouldAutoHideMatchChrome()) {
        this.setMatchChromeVisible(true);
        return;
      }
      this.matchChromeHideTimer = null;
      this.setMatchChromeVisible(false);
    }, 1600);
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
    const socket = new WebSocket(buildReconnectWebSocketUrl(
      `${protocol}//${window.location.host}/online`,
      this.reconnectToken,
    ));
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.reconnectAttempts = 0;
      this.realtimeReady = true;
      if (this.currentLobby?.roomCode) {
        this.pendingAutoJoinRoom = this.currentLobby.roomCode;
      }
      this.renderAll();
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleMessage(event.data);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      const hadActiveOnlineSession = Boolean(this.currentLobby || this.role || this.roomCode);
      const reconnectRoomCode = this.leaveRequested
        ? null
        : resolveReconnectRoomCode(
          this.currentLobby?.roomCode,
          this.roomCode,
          this.pendingAutoJoinRoom,
        );
      const accountRefresh = this.reconnectingForAccountRefresh;
      this.reconnectingForAccountRefresh = false;
      this.leaveRequested = false;
      this.realtimeReady = false;
      this.socket = null;
      this.role = null;
      this.roomCode = null;
      this.currentLobby = null;
      this.currentSessionState = null;
      this.quickMatchSearching = false;
      this.endlessMatchStarting = false;
      this.pendingAutoJoinRoom = reconnectRoomCode;
      this.autoClaimRoomCode = null;
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
      if (this.socket !== socket) {
        return;
      }
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
    this.elements.selectorSurpriseButton.addEventListener("click", () => {
      this.surprisePreferredCharacter("setup");
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
      this.rememberSessionEntry("bot-match");
      this.app.startOfflineBotMatch(this.botMatchFill);
      this.setStatus(this.copy.status.botMatchStarted(this.botMatchFill));
      this.renderAll();
    });
    for (const button of this.elements.landingBotIntensityButtons) {
      button.addEventListener("click", () => {
        this.selectBotMatchFill(parseStoredBotMatchFill(button.dataset.botFill));
      });
    }
    for (const link of this.elements.landingArenaThemeLinks) {
      link.addEventListener("click", (event) => {
        if (link.dataset.active === "true") {
          event.preventDefault();
        }
      });
    }
    this.elements.landingFeedbackButton.addEventListener("click", () => {
      this.openFeedbackDialog();
    });
    this.elements.landingAudioMuteButton.addEventListener("click", () => {
      const settings = this.app.getAudioSettings();
      this.app.setAudioMuted(!settings.muted);
      this.renderAudioControls();
    });
    this.elements.landingAudioVolumeInput.addEventListener("input", () => {
      this.app.setAudioVolume(Number(this.elements.landingAudioVolumeInput.value) / 100);
      if (Number(this.elements.landingAudioVolumeInput.value) > 0) {
        this.app.setAudioMuted(false);
      }
      this.renderAudioControls();
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
      this.rememberSessionEntry("lobby");
      this.setStatus(this.copy.status.creatingLobby);
    });
    this.elements.lobbyCodeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.joinLobbyFromCodeEntry();
    });
    this.elements.lobbyCodeInput.addEventListener("paste", (event) => {
      const roomCode = resolvePastedLobbyJoinCode(event.clipboardData?.getData("text"));
      if (!roomCode) {
        return;
      }

      event.preventDefault();
      this.elements.lobbyCodeInput.value = roomCode;
      this.joinLobbyFromCodeEntry();
    });
    this.elements.setupBackButton.addEventListener("click", () => {
      if (this.currentLobby) {
        this.leaveCurrentLobby();
        return;
      }
      this.cancelPendingSetupEntry();
    });
    this.elements.setupLeaveButton.addEventListener("click", () => {
      if (this.currentLobby) {
        this.leaveCurrentLobby();
        return;
      }
      this.cancelPendingSetupEntry();
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
      this.leaveCurrentMatch();
    });
    this.elements.matchFullscreenButton.addEventListener("click", () => {
      this.setMatchChromeVisible(true);
      void this.toggleMatchFullscreen();
    });
    this.elements.matchInfoToggleButton.addEventListener("click", () => {
      if (!this.currentLobby) {
        return;
      }
      this.setActiveMatchPanel(this.matchInfoPanelOpen ? null : "info");
    });
    this.elements.matchChatToggleButton.addEventListener("click", () => {
      if (!this.currentLobby) {
        return;
      }
      this.setActiveMatchPanel(this.matchChatPanelOpen ? null : "chat");
    });
    this.elements.matchViewport.addEventListener("pointerdown", () => {
      this.setMatchChromeVisible(true);
      if (!this.matchInfoPanelOpen && !this.matchChatPanelOpen) {
        this.refreshMatchChromeAutohide();
        return;
      }
      this.setActiveMatchPanel(null);
    });
    this.elements.matchStage.addEventListener("pointermove", () => {
      if (!this.shouldAutoHideMatchChrome()) {
        return;
      }
      this.refreshMatchChromeAutohide();
    });
    this.elements.matchStage.addEventListener("pointerleave", () => {
      if (!this.shouldAutoHideMatchChrome()) {
        return;
      }
      this.clearMatchChromeHideTimer();
      this.matchChromeHideTimer = window.setTimeout(() => {
        if (!this.shouldAutoHideMatchChrome()) {
          this.setMatchChromeVisible(true);
          return;
        }
        this.matchChromeHideTimer = null;
        this.setMatchChromeVisible(false);
      }, 700);
    });
    this.elements.matchStage.addEventListener("focusin", () => {
      if (!this.shouldAutoHideMatchChrome()) {
        return;
      }
      this.refreshMatchChromeAutohide();
    });
    this.elements.matchViewport.addEventListener("dblclick", () => {
      if (this.getScreen() !== "match") {
        return;
      }
      this.setMatchChromeVisible(true);
      void this.toggleMatchFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      this.renderMatchSurfaceState();
      this.refreshMatchChromeAutohide();
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
    this.elements.landingBillingButton.addEventListener("click", () => {
      void this.startBillingCheckout();
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
    this.elements.feedbackDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeFeedbackDialog();
      }
    });
    this.elements.feedbackSendButton.addEventListener("click", () => {
      void this.submitFeedback();
    });
    this.elements.feedbackTextarea.addEventListener("input", () => {
      if (!this.feedbackRequestPending) {
        this.elements.feedbackStatus.textContent = "";
      }
      this.renderFeedbackDialog();
    });
    this.elements.feedbackTextarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
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
    window.location.assign(buildRoomInviteUrl(language, this.currentLobby?.roomCode ?? this.pendingAutoJoinRoom));
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
    this.rememberSessionEntry("quick-match");
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
    this.rememberSessionEntry("endless");
    this.setStatus(this.translate("Entrando na partida infinita...", "Joining the endless match..."));
  }

  private joinLobbyFromCodeEntry(): void {
    const roomCode = resolveManualLobbyJoinCode(this.elements.lobbyCodeInput.value);
    if (!roomCode) {
      this.setStatus(this.copy.lobbies.joinCodeEmpty);
      this.elements.lobbyCodeInput.focus();
      return;
    }

    this.telemetry.track("lobby_code_join_submitted", {
      context: { roomCode, screen: "lobby-list" },
      payload: { entryLength: this.elements.lobbyCodeInput.value.length },
    });
    if (!this.send({ type: "join-lobby", roomCode })) {
      this.setStatus(this.copy.lobbies.joinUnavailable);
      return;
    }
    this.pendingAutoJoinRoom = roomCode;
    this.rememberSessionEntry("lobby");
    this.renderAll();
    this.setStatus(this.copy.lobbies.entering(roomCode));
  }

  private cancelPendingSetupEntry(): void {
    if (this.quickMatchSearching || this.currentSessionState?.kind === "queueing-classic") {
      this.send({ type: "quick-match-cancel" });
    }

    this.applySessionState(null);
    this.quickMatchSearching = false;
    this.endlessMatchStarting = false;
    this.pendingAutoJoinRoom = null;
    this.idleScreen = "landing";
    this.renderAll();
    this.setStatus(this.copy.status.returnedHome);
  }

  private handleSetupPrimaryAction(): void {
    const lobby = this.currentLobby;
    if (!lobby) {
      this.cancelPendingSetupEntry();
      return;
    }
    if (lobby.status !== "open") {
      return;
    }
    if (!this.canSendRealtimeAction()) {
      this.setStatus(this.copy.status.lobbyActionUnavailable);
      this.renderAll();
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
      if (!this.send({ type: "claim-seat", seat: firstFreeSeat, characterIndex: this.getPreferredAuthoritativeCharacterIndex() })) {
        this.setStatus(this.copy.status.lobbyActionUnavailable);
        this.renderAll();
        return;
      }
      this.setStatus(this.copy.status.enteringSeat(firstFreeSeat));
      return;
    }

    const selfSeat = lobby.seats[lobby.selfSeat];
    if (!selfSeat.ready) {
      this.telemetry.track("ready_clicked", {
        context: { roomCode: lobby.roomCode, screen: "setup" },
        payload: { seat: lobby.selfSeat },
      });
      if (!this.send({ type: "set-ready", ready: true })) {
        this.setStatus(this.copy.status.lobbyActionUnavailable);
        this.renderAll();
        return;
      }
      this.setStatus(this.copy.status.readyMarked);
    }
  }

  private async copyInvite(): Promise<void> {
    if (!this.currentLobby) {
      return;
    }
    const roomCode = this.currentLobby.roomCode;
    const inviteUrl = buildRoomInviteUrl(this.language, roomCode);
    try {
      const copied = await copyTextWithFallback(inviteUrl);
      if (!copied) {
        this.setStatus(formatInviteCopyManualStatus(this.copy, roomCode));
        return;
      }
      this.telemetry.track("invite_copied", {
        context: { roomCode, screen: this.getScreen() },
      });
      this.setStatus(this.copy.status.inviteCopied);
    } catch {
      this.setStatus(formatInviteCopyManualStatus(this.copy, roomCode));
    }
  }

  private leaveCurrentLobby(): void {
    this.telemetry.track("lobby_left", {
      context: { roomCode: this.currentLobby?.roomCode ?? null, screen: this.getScreen() },
    });
    if (this.send({ type: "leave-lobby" })) {
      // A close can race the server acknowledgement. Preserve the user's
      // decision to leave instead of automatically rejoining the same room.
      this.leaveRequested = true;
      this.pendingAutoJoinRoom = null;
    }
  }

  private leaveCurrentMatch(): void {
    if (this.currentLobby) {
      this.leaveCurrentLobby();
      return;
    }
    this.matchInfoPanelOpen = false;
    this.matchChatPanelOpen = false;
    this.matchChromeVisible = true;
    this.clearMatchChromeHideTimer();
    this.idleScreen = "landing";
    this.app.returnToMenu();
    this.renderAll();
    this.setStatus(this.copy.status.returnedHome);
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
        this.reconnectToken = message.reconnectToken;
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
        this.leaveRequested = false;
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
        this.leaveRequested = false;
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
        this.setActiveMatchPanel(null);
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
        if (this.pendingAutoJoinRoom) {
          this.pendingAutoJoinRoom = null;
          this.updateLocation(null);
        }
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

    const rail = document.createElement("div");
    rail.className = "experience-rail";

    const railItems = {
      landing: document.createElement("span"),
      "lobby-list": document.createElement("span"),
      setup: document.createElement("span"),
      match: document.createElement("span"),
    } satisfies Record<ExperienceScreen, HTMLSpanElement>;

    (
      [
        ["landing", "01"],
        ["lobby-list", "02"],
        ["setup", "03"],
        ["match", "04"],
      ] as const satisfies ReadonlyArray<readonly [ExperienceScreen, string]>
    ).forEach(([screen, label]) => {
      const item = railItems[screen];
      item.className = "experience-rail__item";
      item.textContent = label;
      rail.appendChild(item);
    });

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

    const landingKicker = document.createElement("p");
    landingKicker.className = "experience-kicker";
    landingKicker.textContent = copy.landing.kicker;

    const landingReleaseBadge = document.createElement("span");
    landingReleaseBadge.className = "experience-release-badge";
    landingReleaseBadge.textContent = copy.landing.releaseBadge;

    const landingTitle = document.createElement("h1");
    landingTitle.textContent = "BOMBA PVP";

    const landingLead = document.createElement("p");
    landingLead.className = "experience-hero__lead";
    landingLead.textContent = this.translate(
      "Escolha seu bomber, leia a arena e entre no round. Partida rápida online ou treino imediato contra bots.",
      "Choose your bomber, read the arena, and enter the round. Quick online match or instant bot training.",
    );

    landingCopy.append(landingKicker, landingReleaseBadge, landingTitle, landingLead);

    const landingCommercialProof = document.createElement("ul");
    landingCommercialProof.className = "experience-commercial-proof";
    for (const proof of copy.landing.commercialProof) {
      const proofItem = document.createElement("li");
      proofItem.textContent = proof;
      landingCommercialProof.append(proofItem);
    }

    const landingMeta = document.createElement("p");
    landingMeta.className = "experience-hero__meta";

    const landingReleaseNotes = document.createElement("section");
    landingReleaseNotes.className = "experience-release-notes";
    landingReleaseNotes.setAttribute("aria-label", copy.landing.releaseTitle);

    const landingReleaseTitle = document.createElement("p");
    landingReleaseTitle.className = "experience-release-notes__title";
    landingReleaseTitle.textContent = copy.landing.releaseTitle;

    const landingReleaseList = document.createElement("ul");
    landingReleaseList.className = "experience-release-notes__list";

    copy.landing.releaseItems.forEach((releaseItem) => {
      const item = document.createElement("li");
      item.textContent = releaseItem;
      landingReleaseList.appendChild(item);
    });

    landingReleaseNotes.append(landingReleaseTitle, landingReleaseList);

    const landingReturnBrief = document.createElement("div");
    landingReturnBrief.className = "experience-return-brief";
    landingReturnBrief.hidden = true;
    landingReturnBrief.setAttribute("aria-live", "polite");

    const landingReturnBriefKicker = document.createElement("p");
    landingReturnBriefKicker.className = "experience-return-brief__kicker";

    const landingReturnBriefTitle = document.createElement("p");
    landingReturnBriefTitle.className = "experience-return-brief__title";

    const landingReturnBriefBody = document.createElement("p");
    landingReturnBriefBody.className = "experience-return-brief__body";

    landingReturnBrief.append(landingReturnBriefKicker, landingReturnBriefTitle, landingReturnBriefBody);

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
    landingAccountUsernameInput.placeholder = this.translate("Seu username", "Your username");
    applyUsernameInputConstraints(landingAccountUsernameInput, this.language);

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

    const landingBillingPanel = document.createElement("div");
    landingBillingPanel.className = "experience-billing-panel";

    const landingBillingKicker = document.createElement("p");
    landingBillingKicker.className = "experience-kicker";
    landingBillingKicker.textContent = copy.landing.billingKicker;

    const landingBillingTitle = document.createElement("p");
    landingBillingTitle.className = "experience-billing__title";

    const landingBillingStatus = document.createElement("p");
    landingBillingStatus.className = "experience-billing__status";

    const landingBillingActions = document.createElement("div");
    landingBillingActions.className = "experience-billing__actions";

    const landingBillingButton = document.createElement("button");
    landingBillingButton.className = "experience-button experience-button--secondary";
    landingBillingButton.type = "button";

    const landingBillingHint = document.createElement("p");
    landingBillingHint.className = "experience-billing__hint";

    landingBillingActions.append(landingBillingButton);
    landingBillingPanel.append(
      landingBillingKicker,
      landingBillingTitle,
      landingBillingStatus,
      landingBillingActions,
      landingBillingHint,
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

    const landingBotIntensity = document.createElement("section");
    landingBotIntensity.className = "experience-bot-intensity";
    landingBotIntensity.setAttribute("aria-label", copy.landing.botIntensityTitle);

    const landingBotIntensityHeader = document.createElement("div");
    landingBotIntensityHeader.className = "experience-bot-intensity__header";

    const landingBotIntensityTitle = document.createElement("p");
    landingBotIntensityTitle.className = "experience-bot-intensity__title";
    landingBotIntensityTitle.textContent = copy.landing.botIntensityTitle;

    const landingBotIntensityHint = document.createElement("p");
    landingBotIntensityHint.className = "experience-bot-intensity__hint";
    landingBotIntensityHint.textContent = copy.landing.botIntensityHint;

    landingBotIntensityHeader.append(landingBotIntensityTitle, landingBotIntensityHint);

    const landingBotIntensityGroup = document.createElement("div");
    landingBotIntensityGroup.className = "experience-bot-intensity__options";
    landingBotIntensityGroup.setAttribute("role", "group");
    landingBotIntensityGroup.setAttribute("aria-label", copy.landing.botIntensityTitle);

    const landingBotIntensityButtons = BOT_MATCH_FILL_OPTIONS.map((fill) => {
      const option = document.createElement("button");
      option.className = "experience-bot-intensity__option";
      option.type = "button";
      option.dataset.botFill = String(fill);

      const label = document.createElement("strong");
      label.textContent = copy.landing.botIntensityOptionLabel(fill);

      const detail = document.createElement("span");
      detail.textContent = copy.landing.botIntensityOptionDetail(fill);

      option.append(label, detail);
      landingBotIntensityGroup.append(option);
      return option;
    });

    landingBotIntensity.append(landingBotIntensityHeader, landingBotIntensityGroup);

    const landingArenaTheme = document.createElement("section");
    landingArenaTheme.className = "experience-arena-theme";
    landingArenaTheme.setAttribute("aria-label", copy.landing.arenaThemeTitle);

    const landingArenaThemeHeader = document.createElement("div");
    landingArenaThemeHeader.className = "experience-arena-theme__header";

    const landingArenaThemeTitle = document.createElement("p");
    landingArenaThemeTitle.className = "experience-arena-theme__title";
    landingArenaThemeTitle.textContent = copy.landing.arenaThemeTitle;

    const landingArenaThemeHint = document.createElement("p");
    landingArenaThemeHint.className = "experience-arena-theme__hint";
    landingArenaThemeHint.textContent = copy.landing.arenaThemeHint;

    landingArenaThemeHeader.append(landingArenaThemeTitle, landingArenaThemeHint);

    const landingArenaThemeList = document.createElement("div");
    landingArenaThemeList.className = "experience-arena-theme__options";
    landingArenaThemeList.setAttribute("role", "list");

    const landingArenaThemeLinks = ARENA_THEME_LIBRARY.map((theme) => {
      const link = document.createElement("a");
      link.className = "experience-arena-theme__option";
      link.dataset.themeId = theme.id;
      link.href = buildArenaThemeUrl(theme.id, typeof window === "undefined" ? null : window.location.href);
      link.setAttribute("role", "listitem");

      const label = document.createElement("strong");
      label.textContent = theme.name;

      const detail = document.createElement("span");
      detail.textContent = copy.landing.arenaThemeSummary(theme.id, theme.summary);

      const activeBadge = document.createElement("em");
      activeBadge.className = "experience-arena-theme__badge";
      activeBadge.textContent = copy.landing.arenaThemeActive;

      link.append(label, detail, activeBadge);
      landingArenaThemeList.append(link);
      return link;
    });

    landingArenaTheme.append(landingArenaThemeHeader, landingArenaThemeList);

    const landingLobbyButton = document.createElement("button");
    landingLobbyButton.className = "experience-button experience-button--secondary";
    landingLobbyButton.type = "button";
    landingLobbyButton.textContent = copy.landing.enterLobby;

    const landingFeedbackButton = document.createElement("button");
    landingFeedbackButton.className = "experience-button experience-button--ghost";
    landingFeedbackButton.type = "button";
    landingFeedbackButton.textContent = copy.landing.feedback;

    landingActionsPrimary.append(landingQuickMatchButton);
    landingActionsSecondary.append(
      landingEndlessButton,
      landingBotMatchButton,
      landingLobbyButton,
      landingFeedbackButton,
    );
    landingActions.append(landingActionsPrimary, landingActionsSecondary);

    const landingAudio = document.createElement("section");
    landingAudio.className = "experience-audio";
    const landingAudioLabel = document.createElement("strong");
    landingAudioLabel.textContent = this.translate("Áudio", "Audio");
    const landingAudioMuteButton = document.createElement("button");
    landingAudioMuteButton.className = "experience-button experience-button--ghost experience-audio__mute";
    landingAudioMuteButton.type = "button";
    const landingAudioVolumeInput = document.createElement("input");
    landingAudioVolumeInput.className = "experience-audio__range";
    landingAudioVolumeInput.type = "range";
    landingAudioVolumeInput.min = "0";
    landingAudioVolumeInput.max = "100";
    landingAudioVolumeInput.step = "5";
    landingAudioVolumeInput.setAttribute("aria-label", this.translate("Volume dos efeitos", "Effects volume"));
    landingAudio.append(landingAudioLabel, landingAudioMuteButton, landingAudioVolumeInput);

    const landingDevLab = document.createElement("aside");
    landingDevLab.className = "experience-dev-lab";
    landingDevLab.hidden = !import.meta.env?.DEV;
    landingDevLab.innerHTML = `<strong>${this.translate("Laboratório DEV", "DEV laboratory")}</strong><span>${this.translate("Cenários reproduzíveis para bots e modelos externos.", "Reproducible scenarios for bots and external models.")}</span>`;
    const devBotVsBot = document.createElement("a");
    devBotVsBot.className = "experience-button experience-button--secondary";
    devBotVsBot.href = "?autobot=3";
    devBotVsBot.textContent = this.translate("Bot vs bot", "Bot vs bot");
    const devExternalModels = document.createElement("a");
    devExternalModels.className = "experience-button experience-button--ghost";
    devExternalModels.href = "?autobot=3&codexbot=1,2,3,4";
    devExternalModels.textContent = this.translate("Modelos externos", "External models");
    landingDevLab.append(devBotVsBot, devExternalModels);

    const landingControls = document.createElement("section");
    landingControls.className = "experience-landing-controls";
    landingControls.setAttribute("aria-label", copy.controls.kicker);

    const landingControlsHeader = document.createElement("div");
    landingControlsHeader.className = "experience-landing-controls__header";

    const landingControlsTitle = document.createElement("p");
    landingControlsTitle.className = "experience-landing-controls__title";
    landingControlsTitle.textContent = copy.landing.localControlsTitle;

    const landingControlsHint = document.createElement("p");
    landingControlsHint.className = "experience-landing-controls__hint";
    landingControlsHint.textContent = copy.landing.localControlsHint;

    landingControlsHeader.append(landingControlsTitle, landingControlsHint);

    const landingControlsGrid = document.createElement("div");
    landingControlsGrid.className = "experience-landing-controls__grid";

    (
      [
        {
          key: this.translate("WASD / Setas", "WASD / Arrows"),
          label: copy.controls.move,
          detail: copy.landing.localControlsMove,
        },
        { key: "Q", label: copy.controls.bomb, detail: copy.landing.localControlsBomb },
        {
          key: "R",
          label: copy.landing.localControlsRemote,
          detail: this.translate("Jogador 1 · requer controle remoto", "Player 1 · requires remote control"),
        },
        {
          key: this.translate("Espaço", "Space"),
          label: copy.controls.ultimate,
          detail: copy.landing.localControlsUltimate,
        },
      ] as const
    ).forEach((item) => {
      const row = document.createElement("div");
      row.className = "experience-landing-controls__item";

      const key = document.createElement("span");
      key.className = "experience-key experience-landing-controls__key";
      key.textContent = item.key;

      const copyBlock = document.createElement("span");
      copyBlock.className = "experience-landing-controls__copy";

      const label = document.createElement("strong");
      label.textContent = item.label;

      const detail = document.createElement("span");
      detail.textContent = item.detail;

      copyBlock.append(label, detail);
      row.append(key, copyBlock);
      landingControlsGrid.append(row);
    });

    landingControls.append(landingControlsHeader, landingControlsGrid);
    const landingAdvanced = document.createElement("details");
    landingAdvanced.className = "experience-landing-advanced";

    const landingAdvancedSummary = document.createElement("summary");
    landingAdvancedSummary.className = "experience-landing-advanced__summary";

    const landingAdvancedLabel = document.createElement("span");
    landingAdvancedLabel.textContent = this.translate("Configurar partida", "Configure match");

    const landingAdvancedMeta = document.createElement("span");
    landingAdvancedMeta.textContent = this.translate("Mapa · bots · controles · conta", "Map · bots · controls · account");

    landingAdvancedSummary.append(landingAdvancedLabel, landingAdvancedMeta);

    const landingAdvancedBody = document.createElement("div");
    landingAdvancedBody.className = "experience-landing-advanced__body";
    landingAdvancedBody.append(
      landingBotIntensity,
      landingArenaTheme,
      landingControls,
      landingAudio,
      landingAccountCard,
      landingBillingPanel,
      landingReleaseNotes,
      landingCommercialProof,
      landingDevLab,
    );
    landingAdvanced.append(landingAdvancedSummary, landingAdvancedBody);

    landingCopy.append(
      landingMeta,
      landingReturnBrief,
      landingActions,
      landingAdvanced,
    );

    const landingRoster = document.createElement("div");
    landingRoster.className = "experience-hero__art";

    const feedbackDialog = document.createElement("div");
    feedbackDialog.className = "experience-feedback";
    feedbackDialog.hidden = true;
    feedbackDialog.setAttribute("role", "dialog");
    feedbackDialog.setAttribute("aria-modal", "true");
    feedbackDialog.setAttribute("aria-labelledby", "experience-feedback-title");

    const feedbackCard = document.createElement("div");
    feedbackCard.className = "experience-feedback__card";

    const feedbackTitle = document.createElement("p");
    feedbackTitle.id = "experience-feedback-title";
    feedbackTitle.className = "experience-feedback__title";
    feedbackTitle.textContent = copy.landing.feedbackTitle;

    const feedbackPrompt = document.createElement("p");
    feedbackPrompt.className = "experience-feedback__prompt";
    feedbackPrompt.textContent = copy.landing.feedbackPrompt;

    const feedbackTextarea = document.createElement("textarea");
    feedbackTextarea.className = "experience-feedback__textarea";
    feedbackTextarea.rows = 6;
    feedbackTextarea.maxLength = FEEDBACK_MAX_LENGTH;
    feedbackTextarea.placeholder = copy.landing.feedbackPlaceholder;
    feedbackTextarea.setAttribute("aria-describedby", "experience-feedback-counter experience-feedback-status");

    const feedbackCounter = document.createElement("p");
    feedbackCounter.id = "experience-feedback-counter";
    feedbackCounter.className = "experience-feedback__counter";

    const feedbackStatus = document.createElement("p");
    feedbackStatus.id = "experience-feedback-status";
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
    feedbackCard.append(feedbackTitle, feedbackPrompt, feedbackTextarea, feedbackCounter, feedbackStatus, feedbackActions);
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

    const lobbyCodeForm = document.createElement("form");
    lobbyCodeForm.className = "experience-room-code";
    lobbyCodeForm.noValidate = true;

    const lobbyCodeCopy = document.createElement("div");
    lobbyCodeCopy.className = "experience-room-code__copy";

    const lobbyCodeLabel = document.createElement("label");
    lobbyCodeLabel.className = "experience-room-code__label";
    lobbyCodeLabel.htmlFor = "experience-room-code-input";
    lobbyCodeLabel.textContent = copy.lobbies.joinCodeTitle;

    const lobbyCodeHint = document.createElement("p");
    lobbyCodeHint.className = "experience-room-code__hint";
    lobbyCodeHint.id = "experience-room-code-hint";
    lobbyCodeHint.textContent = copy.lobbies.joinCodeHint;

    lobbyCodeCopy.append(lobbyCodeLabel, lobbyCodeHint);

    const lobbyCodeActions = document.createElement("div");
    lobbyCodeActions.className = "experience-room-code__actions";

    const lobbyCodeInput = document.createElement("input");
    lobbyCodeInput.className = "experience-room-code__input";
    lobbyCodeInput.id = "experience-room-code-input";
    lobbyCodeInput.name = "roomCode";
    lobbyCodeInput.type = "text";
    lobbyCodeInput.autocomplete = "off";
    lobbyCodeInput.inputMode = "text";
    lobbyCodeInput.spellcheck = false;
    lobbyCodeInput.setAttribute("autocapitalize", "characters");
    lobbyCodeInput.setAttribute("autocorrect", "off");
    lobbyCodeInput.setAttribute("enterkeyhint", "join");
    lobbyCodeInput.placeholder = copy.lobbies.joinCodePlaceholder;
    lobbyCodeInput.setAttribute("aria-describedby", lobbyCodeHint.id);

    const lobbyCodeSubmitButton = document.createElement("button");
    lobbyCodeSubmitButton.className = "experience-button experience-button--secondary";
    lobbyCodeSubmitButton.type = "submit";
    lobbyCodeSubmitButton.textContent = copy.lobbies.joinCodeButton;

    lobbyCodeActions.append(lobbyCodeInput, lobbyCodeSubmitButton);
    lobbyCodeForm.append(lobbyCodeCopy, lobbyCodeActions);

    const lobbyListList = document.createElement("div");
    lobbyListList.className = "experience-room-list";

    lobbyList.append(lobbyHeader, lobbyCodeForm, lobbyListCount, lobbyListList);

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

    const selectorSurpriseButton = document.createElement("button");
    selectorSurpriseButton.className = "experience-button experience-button--ghost experience-character-surprise";
    selectorSurpriseButton.type = "button";
    selectorSurpriseButton.textContent = copy.character.surpriseAction;

    selectorSummaryCopy.append(selectorName, selectorNote, selectorSurpriseButton);
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
            <span class="experience-controls__or">${this.translate("ou", "or")}</span>
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
              <span class="experience-key experience-key--wide">${this.translate("Espaço", "Space")}</span>
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

    const matchFullscreenButton = document.createElement("button");
    matchFullscreenButton.className = "experience-button experience-button--secondary experience-match__fullscreen-button";
    matchFullscreenButton.type = "button";
    matchFullscreenButton.textContent = this.translate("Tela cheia", "Fullscreen");

    matchActions.append(matchFullscreenButton, matchCopyButton, matchLeaveButton);
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

    shell.append(rail, languageSwitcher, landing, feedbackDialog, lobbyList, setup, match, status);
    root.prepend(shell);

    return {
      shell,
      rail,
      railItems,
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
      landingReturnBrief,
      landingReturnBriefKicker,
      landingReturnBriefTitle,
      landingReturnBriefBody,
      landingAccountTitle,
      landingAccountValue,
      landingAccountUsernameInput,
      landingAccountPrimaryButton,
      landingAccountSecondaryButton,
      landingAccountHint,
      landingBillingTitle,
      landingBillingStatus,
      landingBillingButton,
      landingBillingHint,
      landingQuickMatchButton,
      landingEndlessButton,
      landingBotMatchButton,
      landingBotIntensityButtons,
      landingArenaThemeLinks,
      landingLobbyButton,
      landingFeedbackButton,
      landingAudioMuteButton,
      landingAudioVolumeInput,
      landingDevLab,
      landingRoster,
      feedbackDialog,
      feedbackTextarea,
      feedbackCounter,
      feedbackSendButton,
      feedbackCancelButton,
      feedbackStatus,
      lobbyListBackButton,
      lobbyListCreateButton,
      lobbyCodeForm,
      lobbyCodeInput,
      lobbyCodeSubmitButton,
      lobbyCodeHint,
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
      selectorSurpriseButton,
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
      matchFullscreenButton,
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

  private renderAudioControls(): void {
    const settings = this.app.getAudioSettings();
    this.elements.landingAudioVolumeInput.value = String(Math.round(settings.volume * 100));
    this.elements.landingAudioMuteButton.textContent = settings.muted
      ? this.translate("Ativar som", "Unmute")
      : this.translate("Silenciar", "Mute");
    this.elements.landingAudioMuteButton.setAttribute("aria-pressed", String(settings.muted));
  }

  private renderAll(): void {
    this.renderLanguageSwitcher();
    this.renderAudioControls();
    this.renderLanding();
    this.renderAccountPanel();
    this.renderBillingPanel();
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
    const hasOnlineLobby = Boolean(this.currentLobby);
    if (!hasOnlineLobby) {
      this.matchInfoPanelOpen = false;
      this.matchChatPanelOpen = false;
    }
    const fullscreenActive = this.isMatchStageFullscreen();
    const chromeHidden = isMatchScreen
      && fullscreenActive
      && !this.matchChromeVisible
      && !this.matchInfoPanelOpen
      && !this.matchChatPanelOpen;
    this.elements.matchStage.dataset.infoOpen = isMatchScreen && this.matchInfoPanelOpen ? "true" : "false";
    this.elements.matchStage.dataset.chatOpen = isMatchScreen && this.matchChatPanelOpen ? "true" : "false";
    this.elements.matchStage.dataset.fullscreen = isMatchScreen && fullscreenActive ? "true" : "false";
    this.elements.matchStage.dataset.chromeHidden = chromeHidden ? "true" : "false";
    this.elements.matchStage.dataset.onlineLobby = hasOnlineLobby ? "true" : "false";
    this.elements.shell.dataset.matchFullscreen = isMatchScreen && fullscreenActive ? "true" : "false";
    this.elements.matchDock.hidden = !isMatchScreen || !hasOnlineLobby;
    this.elements.matchInfoToggleButton.hidden = !hasOnlineLobby;
    this.elements.matchChatToggleButton.hidden = !hasOnlineLobby;
    this.elements.matchInfoToggleButton.setAttribute(
      "aria-expanded",
      isMatchScreen && this.matchInfoPanelOpen ? "true" : "false",
    );
    this.elements.matchChatToggleButton.setAttribute(
      "aria-expanded",
      isMatchScreen && this.matchChatPanelOpen ? "true" : "false",
    );
    this.elements.matchFullscreenButton.hidden = !isMatchScreen || !this.isFullscreenSupported();
    this.elements.matchFullscreenButton.textContent = fullscreenActive
      ? this.translate("Sair da tela cheia", "Exit fullscreen")
      : this.translate("Tela cheia", "Fullscreen");
    this.elements.matchFullscreenButton.setAttribute("aria-pressed", isMatchScreen && fullscreenActive ? "true" : "false");
  }

  private setActiveMatchPanel(panel: "info" | "chat" | null): void {
    this.matchInfoPanelOpen = panel === "info";
    this.matchChatPanelOpen = panel === "chat";
    this.matchChromeVisible = true;
    this.renderMatchSurfaceState();
    this.refreshMatchChromeAutohide();
  }

  private renderShellState(): void {
    const screen = this.getScreen();
    if (screen !== "match" && (this.matchInfoPanelOpen || this.matchChatPanelOpen)) {
      this.matchInfoPanelOpen = false;
      this.matchChatPanelOpen = false;
    }
    if (screen !== "match") {
      this.clearMatchChromeHideTimer();
      this.matchChromeVisible = true;
    }
    this.telemetry.trackScreenView(screen, this.currentLobby?.roomCode ?? null);
    this.elements.shell.dataset.screen = screen;
    for (const [key, node] of Object.entries(this.elements.railItems) as Array<[ExperienceScreen, HTMLSpanElement]>) {
      node.dataset.active = key === screen ? "true" : "false";
    }
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
    this.elements.languagePortugueseButton.setAttribute("aria-pressed", this.language === "pt" ? "true" : "false");
    this.elements.languageEnglishButton.setAttribute("aria-pressed", this.language === "en" ? "true" : "false");
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
    this.renderLandingReturnBrief();
    this.elements.landingQuickMatchButton.disabled = pendingEntry || !onlineActionsAvailable;
    this.elements.landingEndlessButton.disabled = pendingEntry || !onlineActionsAvailable;
    this.elements.landingBotMatchButton.disabled = pendingEntry;
    for (const button of this.elements.landingBotIntensityButtons) {
      button.disabled = pendingEntry;
    }
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
    this.renderBotMatchIntensity();
    this.renderArenaThemePicker();
    this.renderLandingCharacterPicker();
  }

  private renderBotMatchIntensity(): void {
    for (const button of this.elements.landingBotIntensityButtons) {
      const fill = parseStoredBotMatchFill(button.dataset.botFill);
      const active = fill === this.botMatchFill;
      button.dataset.active = active ? "true" : "false";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  private renderArenaThemePicker(): void {
    const href = typeof window === "undefined" ? null : window.location.href;
    for (const link of this.elements.landingArenaThemeLinks) {
      const themeId = link.dataset.themeId ?? "";
      const active = themeId === this.selectedArenaThemeId;
      link.dataset.active = active ? "true" : "false";
      link.href = buildArenaThemeUrl(themeId, href);
      if (active) {
        link.setAttribute("aria-current", "true");
      } else if (typeof link.removeAttribute === "function") {
        link.removeAttribute("aria-current");
      } else {
        link.setAttribute("aria-current", "false");
      }
      const badge = link.querySelector<HTMLElement>(".experience-arena-theme__badge");
      if (badge) {
        badge.hidden = !active;
      }
    }
  }

  private renderLandingReturnBrief(): void {
    const view = this.sessionReturnBrief
      ? formatSessionReturnBrief(this.copy, this.sessionReturnBrief)
      : null;
    this.elements.landingReturnBrief.hidden = !view;
    if (!view) {
      this.elements.landingReturnBriefKicker.textContent = "";
      this.elements.landingReturnBriefTitle.textContent = "";
      this.elements.landingReturnBriefBody.textContent = "";
      return;
    }

    this.elements.landingReturnBriefKicker.textContent = view.kicker;
    this.elements.landingReturnBriefTitle.textContent = view.title;
    this.elements.landingReturnBriefBody.textContent = view.body;
  }

  private renderFeedbackDialog(): void {
    const copy = this.copy;
    const messageLength = this.elements.feedbackTextarea.value.trim().length;
    const remainingCharacters = FEEDBACK_MAX_LENGTH - messageLength;
    const messageReady = messageLength > 0 && remainingCharacters >= 0;
    this.elements.feedbackDialog.hidden = !this.feedbackDialogOpen;
    this.elements.feedbackTextarea.disabled = this.feedbackRequestPending;
    this.elements.feedbackCounter.textContent = remainingCharacters >= 0
      ? copy.landing.feedbackCharactersRemaining(remainingCharacters)
      : copy.landing.feedbackCharactersOverLimit(Math.abs(remainingCharacters), FEEDBACK_MAX_LENGTH);
    this.elements.feedbackCounter.classList.toggle("experience-feedback__counter--invalid", remainingCharacters < 0);
    this.elements.feedbackSendButton.disabled = this.feedbackRequestPending || !messageReady;
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
    applyUsernameInputConstraints(this.elements.landingAccountUsernameInput, this.language);

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

  private renderBillingPanel(): void {
    const copy = this.copy.landing;
    const billing = this.currentBillingStatus;
    const checkoutState = billing?.checkoutState ?? "not-configured";
    const hasAccount = Boolean(this.currentAccount);
    const isPaid = billing?.accessLevel === "paid";
    const isPending = checkoutState === "pending";
    const isReady = checkoutState === "ready";
    const isUnavailable = checkoutState === "not-configured";
    const loading = this.billingRequestPending && !billing;

    this.elements.landingBillingTitle.textContent = isPaid
      ? copy.billingTitlePaid
      : isPending
        ? copy.billingTitlePending
        : isReady
          ? copy.billingTitleReady
          : copy.billingTitleUnavailable;

    this.elements.landingBillingStatus.textContent = loading
      ? copy.billingStatusLoading
      : isPaid
        ? copy.billingStatusPaid
        : isPending
          ? copy.billingStatusPending
          : isReady && hasAccount
            ? copy.billingStatusFree
            : isReady
              ? copy.billingStatusVisitor
              : copy.billingStatusUnavailable;

    this.elements.landingBillingHint.textContent = isPaid
      ? copy.billingHintPaid
      : isPending
        ? copy.billingHintPending
        : isReady && hasAccount
          ? copy.billingHintReady
          : isReady
            ? copy.billingHintVisitor
            : copy.billingHintUnavailable;

    this.elements.landingBillingButton.textContent = this.billingCheckoutPending
      ? copy.billingCtaLoading
      : isPaid
        ? copy.billingCtaPaid
        : isPending
          ? copy.billingCtaPending
          : isUnavailable
            ? copy.billingCtaUnavailable
            : hasAccount
              ? copy.billingCtaReady
              : copy.billingCtaCreateAccount;
    this.elements.landingBillingButton.disabled = this.billingCheckoutPending
      || loading
      || isPaid
      || isUnavailable;
    this.elements.landingBillingButton.setAttribute("aria-busy", this.billingCheckoutPending ? "true" : "false");
  }

  private renderLobbyList(): void {
    const copy = this.copy;
    const manualJoinDisabled = !this.realtimeReady;
    this.elements.lobbyCodeInput.disabled = manualJoinDisabled;
    this.elements.lobbyCodeSubmitButton.disabled = manualJoinDisabled;
    this.elements.lobbyCodeHint.textContent = manualJoinDisabled
      ? copy.lobbies.joinCodeUnavailableHint
      : copy.lobbies.joinCodeHint;
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
      const seatsFull = lobby.occupantCount >= LOBBY_MAX_PLAYERS;
      configureLobbyCardAction(card, isLobbyCardJoinDisabled(lobby.status, seatsFull), () => {
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
        this.rememberSessionEntry("lobby");
        this.renderAll();
        this.setStatus(copy.lobbies.entering(this.getLobbyDisplayTitle(lobby)));
      });

      const title = document.createElement("strong");
      title.textContent = this.getLobbyDisplayTitle(lobby);

      const meta = document.createElement("span");
      meta.textContent = copy.setup.roomMeta(lobby.roomCode, lobby.occupantCount, LOBBY_MAX_PLAYERS);

      const status = document.createElement("span");
      status.className = "experience-room-card__status";
      status.textContent = lobby.status === "playing"
        ? copy.lobbies.roomStatusLive
        : seatsFull ? copy.lobbies.roomStatusFull : copy.lobbies.roomStatusOpen;

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
      const loadingMode = this.getSetupLoadingMode();
      const loadingBrief = formatSetupLoadingBrief(copy, {
        mode: loadingMode,
        onlineUsers: this.onlineUsers,
        queuedCount: this.quickMatchQueuedCount,
        roomCode: this.pendingAutoJoinRoom,
        realtimeReady: this.realtimeReady,
      });
      this.elements.setupEyebrow.textContent = loadingMode === "quick-match"
        ? copy.setup.kickerQuickMatch
        : loadingMode === "endless"
          ? this.translate("Partida infinita", "Infinite match")
          : copy.setup.kickerLoading;
      this.elements.setupTitle.textContent = loadingMode === "quick-match"
        ? copy.setup.titleQuickMatch
        : loadingMode === "endless"
          ? this.translate("Entrando na arena", "Joining arena")
          : copy.setup.titleLoading;
      this.elements.setupDescription.textContent = copy.setup.loadingDescription;
      this.elements.setupRoomMeta.textContent = loadingMode === "quick-match"
        ? copy.setup.loadingMetaQuickMatch
        : loadingMode === "endless"
          ? this.translate(
            "Essa sala nunca para. Humanos assumem vagas de bots automaticamente.",
            "This room never stops. Humans automatically take over bot seats.",
          )
          : copy.setup.loadingMetaInvite;
      this.elements.setupSeatStrip.replaceChildren(...this.buildSetupLoadingPills(loadingBrief));
      this.renderPresenceList(loadingMode === "quick-match" || loadingMode === "endless");
      this.elements.setupPrimaryButton.textContent = loadingBrief.primaryLabel;
      this.elements.setupPrimaryButton.disabled = false;
      this.elements.setupPrimaryHint.textContent = loadingBrief.hint;
      return;
    }

    const selfSeatId = lobby.selfSeat;
    const selfSeat = selfSeatId ? lobby.seats[selfSeatId] : null;
    const isMatchmakingLobby = lobby.roomKind === "matchmaking";
    const realtimeActionAvailable = this.canSendRealtimeAction();
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
      this.elements.setupPrimaryButton.disabled = !firstFreeSeat || !realtimeActionAvailable;
      this.elements.setupPrimaryHint.textContent = firstFreeSeat
        ? realtimeActionAvailable
          ? copy.setup.enterHint
          : copy.setup.reconnectingHint
        : copy.setup.roomFilledBeforeEnter;
      return;
    }

    if (selfSeat?.ready) {
      this.elements.setupPrimaryButton.textContent = copy.common.ready;
      this.elements.setupPrimaryButton.disabled = true;
      this.elements.setupPrimaryHint.textContent = lobby.occupantCount < 2
        ? copy.setup.readyDisabledSolo
        : formatLobbyReadyReminder(copy, lobby);
      return;
    }

    this.elements.setupPrimaryButton.textContent = copy.setup.readyButton;
    this.elements.setupPrimaryButton.disabled = !realtimeActionAvailable;
    this.elements.setupPrimaryHint.textContent = realtimeActionAvailable
      ? copy.setup.readyHint
      : copy.setup.reconnectingHint;
  }

  private getSetupLoadingMode(): SetupLoadingMode {
    if (this.quickMatchSearching || this.currentSessionState?.kind === "queueing-classic") {
      return "quick-match";
    }
    if (this.endlessMatchStarting || this.currentSessionState?.kind === "queueing-endless") {
      return "endless";
    }
    return "invite";
  }

  private buildSetupLoadingPills(brief: SetupLoadingBrief): HTMLElement[] {
    return brief.steps.map((step) => {
      const pill = document.createElement("div");
      pill.className = "experience-seat-pill experience-seat-pill--loading";
      pill.dataset.state = step.state;

      const label = document.createElement("span");
      label.className = "experience-seat-pill__label";
      label.textContent = step.label;

      const text = document.createElement("strong");
      text.textContent = step.text;

      pill.append(label, text);
      return pill;
    });
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
    this.elements.selectorSurpriseButton.disabled = this.roster.length <= 1;

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

    // Kicker
    const kicker = document.createElement("p");
    kicker.className = "experience-kicker";
    kicker.textContent = this.translate("Bomber selecionado", "Selected bomber");

    // Large focus card
    const focus = document.createElement("div");
    focus.className = "experience-character-focus";

    const portrait = this.createPortraitImage("experience-character-focus__portrait", 160, selected.name, true);
    this.renderPortrait(portrait, selected);

    const focusName = document.createElement("strong");
    focusName.className = "experience-character-focus__name";
    focusName.textContent = selected.name;

    focus.append(portrait, focusName);

    // Nav row — prev / next
    const nav = document.createElement("div");
    nav.className = "experience-landing-picker__nav";

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "experience-button experience-button--ghost";
    previousButton.textContent = this.translate("← Anterior", "← Prev");
    previousButton.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex - 1);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "experience-button experience-button--ghost";
    nextButton.textContent = this.translate("Próximo →", "Next →");
    nextButton.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex + 1);
    });

    const surpriseButton = document.createElement("button");
    surpriseButton.type = "button";
    surpriseButton.className = "experience-button experience-button--secondary experience-character-surprise";
    surpriseButton.textContent = this.copy.character.surpriseAction;
    surpriseButton.disabled = this.roster.length <= 1;
    surpriseButton.addEventListener("click", () => {
      this.surprisePreferredCharacter("landing");
    });

    nav.append(previousButton, surpriseButton, nextButton);

    // Compact portrait strip — all chars, no text labels
    const strip = document.createElement("div");
    strip.className = "experience-character-strip";
    strip.append(
      ...this.getLandingCharacterWindow(6).map((index) => {
        const entry = this.getCharacter(index);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "experience-character-strip__item";
        if (index === this.preferredCharacterIndex) {
          btn.dataset.selected = "true";
        }
        btn.title = entry.name;
        const img = this.createPortraitImage("experience-character-strip__portrait", 56, entry.name);
        this.renderPortrait(img, entry);
        btn.append(img);
        btn.addEventListener("click", () => this.updatePreferredCharacter(index));
        return btn;
      }),
    );

    shell.append(kicker, focus, nav, strip);
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

  private updatePreferredCharacter(
    nextIndex: number,
    selectionOrigin: "manual" | "landing" | "setup" = "manual",
  ): void {
    this.preferredCharacterIndex = this.wrapCharacterIndex(nextIndex);
    this.persistPreferredCharacterIndex();
    this.app.setOfflinePreferredCharacter(this.preferredCharacterIndex);
    this.telemetry.track("character_selected", {
      context: { roomCode: this.currentLobby?.roomCode ?? null, screen: this.getScreen() },
      payload: {
        characterIndex: this.preferredCharacterIndex,
        authoritativeCharacterIndex: this.getPreferredAuthoritativeCharacterIndex(),
        characterId: this.getCharacter(this.preferredCharacterIndex).id,
        selectionOrigin,
      },
    });
    this.renderAll();

    if (this.currentLobby?.selfSeat && this.currentLobby.status === "open") {
      this.send({ type: "set-character", characterIndex: this.getPreferredAuthoritativeCharacterIndex() });
    }
  }

  private surprisePreferredCharacter(origin: "landing" | "setup"): void {
    if (this.roster.length <= 1) {
      return;
    }

    const nextIndex = pickSurpriseCharacterIndex(this.preferredCharacterIndex, this.roster.length);
    this.updatePreferredCharacter(nextIndex, origin);
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
    const hasOnlineLobby = Boolean(lobby);
    const isMatchScreen = this.getScreen() === "match";
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
      : copy.match.offlineStatus;
    this.elements.matchCopyButton.hidden = !hasOnlineLobby;
    this.elements.matchCopyButton.disabled = !hasOnlineLobby;
    this.elements.matchLeaveButton.disabled = !isMatchScreen;
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
      void this.refreshBillingStatus();
      this.renderAll();
    } catch {
      // Account state is optional and must not block gameplay.
    }
  }

  private async refreshBillingStatus(): Promise<void> {
    if (this.billingRequestPending) {
      return;
    }
    this.billingRequestPending = true;
    this.renderAll();
    try {
      const response = await fetch("/api/billing/status", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json() as { billing?: PlayerBillingStatus | null };
      this.currentBillingStatus = payload.billing ?? null;
      if (this.currentBillingStatus) {
        this.telemetry.track("billing_status_viewed", {
          payload: {
            accessLevel: this.currentBillingStatus.accessLevel,
            checkoutState: this.currentBillingStatus.checkoutState,
            hasAccount: Boolean(this.currentBillingStatus.accountId),
          },
        });
      }
    } catch {
      // Billing readiness is optional and must not block gameplay.
    } finally {
      this.billingRequestPending = false;
      this.renderAll();
    }
  }

  private async startBillingCheckout(): Promise<void> {
    if (this.billingCheckoutPending) {
      return;
    }

    this.telemetry.track("billing_checkout_clicked", {
      context: { screen: this.getScreen() },
      payload: {
        hasAccount: Boolean(this.currentAccount),
        checkoutState: this.currentBillingStatus?.checkoutState ?? "unknown",
      },
    });

    if (!this.currentAccount) {
      this.setStatus(this.copy.landing.billingRequiresAccount);
      this.elements.landingAccountUsernameInput.focus();
      return;
    }

    this.billingCheckoutPending = true;
    this.renderAll();
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          accountId: this.currentAccount.id,
          source: "landing",
        }),
      });
      const payload = await response.json() as {
        billing?: PlayerBillingStatus | null;
        checkoutUrl?: string | null;
        error?: string;
      };
      this.currentBillingStatus = payload.billing ?? this.currentBillingStatus;
      if (!response.ok) {
        this.setStatus(payload.error ?? this.copy.landing.billingCheckoutError);
        return;
      }
      if (!payload.checkoutUrl) {
        this.setStatus(this.copy.landing.billingCheckoutAlreadyActive);
        return;
      }
      this.telemetry.track("billing_checkout_started", {
        context: { screen: this.getScreen() },
        payload: {
          checkoutState: this.currentBillingStatus?.checkoutState ?? "pending",
          hasAccount: true,
        },
      });
      window.location.href = payload.checkoutUrl;
    } catch {
      this.setStatus(this.copy.landing.billingCheckoutError);
    } finally {
      this.billingCheckoutPending = false;
      this.renderAll();
    }
  }

  private async createQuickAccount(): Promise<void> {
    if (this.accountRequestPending || this.currentAccount) {
      return;
    }
    const validation = validateUsername(this.elements.landingAccountUsernameInput.value);
    if (!validation.ok) {
      this.setStatus(formatUsernameValidationMessage(validation, this.language));
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
      void this.refreshBillingStatus();
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
      this.currentBillingStatus = null;
      this.setStatus(this.translate(
        "Conta desconectada. Voce pode continuar jogando como convidado.",
        "Account disconnected. You can keep playing as a guest.",
      ));
      void this.refreshBillingStatus();
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
      this.elements.feedbackStatus.textContent = this.copy.landing.feedbackEmpty;
      this.renderFeedbackDialog();
      return;
    }
    if (message.length > FEEDBACK_MAX_LENGTH) {
      this.elements.feedbackStatus.textContent = this.copy.landing.feedbackTooLong(FEEDBACK_MAX_LENGTH);
      this.renderFeedbackDialog();
      return;
    }

    this.feedbackRequestPending = true;
    this.elements.feedbackStatus.textContent = "";
    this.renderAll();
    const controller = new AbortController();
    let requestTimedOut = false;
    const timeoutId = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, FEEDBACK_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        signal: controller.signal,
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
      this.elements.feedbackStatus.textContent = requestTimedOut
        ? this.copy.landing.feedbackTimeout
        : this.copy.landing.feedbackError;
    } finally {
      window.clearTimeout(timeoutId);
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
    const ignitionCoreLeft = document.createElement("img");
    ignitionCoreLeft.className = "experience-match__ignition-core experience-match__ignition-core--left";
    ignitionCoreLeft.src = "/Assets/ui/arena-ignition-core.webp";
    ignitionCoreLeft.alt = "";
    ignitionCoreLeft.setAttribute("aria-hidden", "true");

    const ignitionCoreRight = ignitionCoreLeft.cloneNode(true) as HTMLImageElement;
    ignitionCoreRight.className = "experience-match__ignition-core experience-match__ignition-core--right";

    this.elements.matchViewport.replaceChildren(canvas, ignitionCoreLeft, ignitionCoreRight);
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
    const stored = readLocalStorageItem(PREFERRED_CHARACTER_STORAGE_KEY);
    const value = Number(stored);
    if (Number.isNaN(value)) {
      return 0;
    }
    return this.wrapCharacterIndex(value);
  }

  private persistPreferredCharacterIndex(): void {
    writeLocalStorageItem(PREFERRED_CHARACTER_STORAGE_KEY, String(this.preferredCharacterIndex));
  }

  private readBotMatchFill(): BotMatchFill {
    return parseStoredBotMatchFill(readLocalStorageItem(BOT_MATCH_FILL_STORAGE_KEY));
  }

  private persistBotMatchFill(): void {
    writeLocalStorageItem(BOT_MATCH_FILL_STORAGE_KEY, String(this.botMatchFill));
  }

  private selectBotMatchFill(fill: BotMatchFill): void {
    if (this.botMatchFill === fill) {
      return;
    }
    this.botMatchFill = fill;
    this.persistBotMatchFill();
    this.renderBotMatchIntensity();
  }

  private readSessionReturnBrief(): SessionReturnBrief | null {
    const brief = parseStoredSessionReturnBrief(readLocalStorageItem(SESSION_RETURN_BRIEF_STORAGE_KEY));
    if (!brief) {
      removeLocalStorageItem(SESSION_RETURN_BRIEF_STORAGE_KEY);
    }
    return brief;
  }

  private persistSessionReturnBrief(brief: SessionReturnBrief): void {
    this.sessionReturnBrief = brief;
    writeLocalStorageItem(SESSION_RETURN_BRIEF_STORAGE_KEY, JSON.stringify(brief));
    this.renderLandingReturnBrief();
  }

  private rememberSessionEntry(mode: SessionReturnMode): void {
    this.persistSessionReturnBrief({
      version: SESSION_RETURN_BRIEF_VERSION,
      type: "entry",
      mode,
      savedAtMs: Date.now(),
      characterName: this.getCharacter(this.preferredCharacterIndex).name,
    });
  }

  private rememberMatchResult(matchWinner: PlayerId, roundNumber: number): void {
    const selfSeat = this.currentLobby?.selfSeat ?? null;
    this.persistSessionReturnBrief({
      version: SESSION_RETURN_BRIEF_VERSION,
      type: "match-result",
      roomCode: this.roomCode,
      winner: matchWinner,
      winnerLabel: this.getSeatDisplayLabel(matchWinner),
      selfSeat,
      localWon: selfSeat === matchWinner,
      roundNumber,
      savedAtMs: Date.now(),
      characterName: this.getCharacter(this.preferredCharacterIndex).name,
    });
  }

  private getSeatDisplayLabel(playerId: PlayerId): string {
    return this.currentLobby?.seats[playerId]?.displayName || `P${playerId}`;
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

  private canSendRealtimeAction(): boolean {
    return canSendLobbyAction(this.realtimeReady, this.socket?.readyState);
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
    this.rememberMatchResult(matchWinner, roundNumber);
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
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (normalizedRoomCode) {
      url.searchParams.set("room", normalizedRoomCode);
    } else {
      url.searchParams.delete("room");
    }
    window.history.replaceState({}, "", url);
  }

  private syncLanguageUrl(roomCode: string | null = null): void {
    const localizedUrl = buildLocalizedUrl(this.language);
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (normalizedRoomCode) {
      localizedUrl.searchParams.set("room", normalizedRoomCode);
    } else {
      localizedUrl.searchParams.delete("room");
    }
    if (localizedUrl.toString() === window.location.href) {
      return;
    }
    window.history.replaceState({}, "", localizedUrl);
  }

}
