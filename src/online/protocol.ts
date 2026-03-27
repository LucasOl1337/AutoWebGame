import type {
  BombState,
  Direction,
  FlameState,
  MatchScore,
  Mode,
  PlayerId,
  PlayerState,
  PowerUpState,
  RoundOutcome,
} from "../core/types";

export type OnlineRole = "host" | "guest";
export type LobbyStatus = "open" | "playing";

export interface OnlineInputState {
  direction: Direction | null;
  bombPressed: boolean;
  detonatePressed: boolean;
}

export interface LobbySeatState {
  clientId: string | null;
  displayName: string | null;
  characterIndex: number;
  ready: boolean;
}

export interface LobbySummary {
  roomCode: string;
  title: string;
  status: LobbyStatus;
  createdAt: number;
  seats: Record<PlayerId, LobbySeatState>;
  occupantCount: number;
}

export interface LobbyState extends LobbySummary {
  selfClientId: string;
  selfSeat: PlayerId | null;
  isHost: boolean;
  chat: ChatEntry[];
}

export interface ChatEntry {
  id: string;
  authorClientId: string | null;
  authorLabel: string;
  body: string;
  createdAt: number;
  system?: boolean;
}

export interface MatchStartConfig {
  roomCode: string;
  role: OnlineRole;
  localPlayerId: PlayerId;
  activePlayerIds: PlayerId[];
  characterSelections: Record<PlayerId, number>;
}

export interface OnlineGameSnapshot {
  serverTimeMs: number;
  serverTick: number;
  frameId: number;
  ackedInputSeq: Record<PlayerId, number>;
  mode: Mode;
  breakableTiles: string[];
  powerUps: PowerUpState[];
  players: Record<PlayerId, PlayerState>;
  bombs: BombState[];
  flames: FlameState[];
  nextBombId: number;
  score: MatchScore;
  roundNumber: number;
  roundTimeMs: number;
  paused: boolean;
  roundOutcome: RoundOutcome | null;
  matchWinner: PlayerId | null;
  animationClockMs: number;
  suddenDeathActive: boolean;
  suddenDeathTickMs: number;
  suddenDeathIndex: number;
  showDangerOverlay: boolean;
  showBombPreview: boolean;
  selectedCharacterIndex: Record<PlayerId, number>;
  activePlayerIds: PlayerId[];
}

export interface OnlineGameFrame {
  serverTimeMs: number;
  serverTick: number;
  frameId: number;
  ackedInputSeq: Record<PlayerId, number>;
  mode: Mode;
  players: Record<PlayerId, PlayerState>;
  bombs: BombState[];
  flames: FlameState[];
  nextBombId: number;
  score: MatchScore;
  roundNumber: number;
  roundTimeMs: number;
  paused: boolean;
  roundOutcome: RoundOutcome | null;
  matchWinner: PlayerId | null;
  animationClockMs: number;
  suddenDeathActive: boolean;
  suddenDeathTickMs: number;
  suddenDeathIndex: number;
  selectedCharacterIndex: Record<PlayerId, number>;
  activePlayerIds: PlayerId[];
}

export interface OnlineSessionBridge {
  role: OnlineRole | null;
  roomCode: string | null;
  sendGuestInput(input: OnlineInputState, inputSeq: number): void;
  sendHostSnapshot(snapshot: OnlineGameSnapshot): void;
}

export interface ServerHelloMessage {
  type: "hello";
  clientId: string;
  lobbies: LobbySummary[];
  quickMatchQueued: number;
  searchingQuickMatch: boolean;
}

export interface ServerLobbyListMessage {
  type: "lobby-list";
  lobbies: LobbySummary[];
}

export interface ServerLobbyJoinedMessage {
  type: "lobby-joined";
  lobby: LobbyState;
  role: OnlineRole;
}

export interface ServerLobbyUpdatedMessage {
  type: "lobby-updated";
  lobby: LobbyState;
}

export interface ServerLobbyLeftMessage {
  type: "lobby-left";
}

export interface ServerMatchStartedMessage {
  type: "match-started";
  config: MatchStartConfig;
}

export interface ServerPeerLeftMessage {
  type: "peer-left";
}

export interface ServerSnapshotMessage {
  type: "host-snapshot";
  snapshot: OnlineGameSnapshot;
}

export interface ServerFrameMessage {
  type: "host-frame";
  frame: OnlineGameFrame;
}

export interface ServerErrorMessage {
  type: "error";
  message: string;
}

export interface ServerQuickMatchStateMessage {
  type: "quick-match-state";
  queued: number;
  searching: boolean;
  countdownMs: number | null;
}

export interface ServerChatMessage {
  type: "chat-message";
  roomCode: string;
  entry: ChatEntry;
}

export type ServerMessage =
  | ServerHelloMessage
  | ServerLobbyListMessage
  | ServerLobbyJoinedMessage
  | ServerLobbyUpdatedMessage
  | ServerLobbyLeftMessage
  | ServerMatchStartedMessage
  | ServerPeerLeftMessage
  | GuestInputMessage
  | ServerFrameMessage
  | ServerSnapshotMessage
  | ServerQuickMatchStateMessage
  | ServerChatMessage
  | ServerErrorMessage;

export interface CreateLobbyMessage {
  type: "create-lobby";
  title: string;
}

export interface JoinLobbyMessage {
  type: "join-lobby";
  roomCode: string;
}

export interface LeaveLobbyMessage {
  type: "leave-lobby";
}

export interface ClaimSeatMessage {
  type: "claim-seat";
  seat: PlayerId;
  characterIndex?: number;
}

export interface SetCharacterMessage {
  type: "set-character";
  characterIndex: number;
}

export interface SetReadyMessage {
  type: "set-ready";
  ready: boolean;
}

export interface GuestInputMessage {
  type: "guest-input";
  inputSeq: number;
  sentAtMs: number;
  input: OnlineInputState;
}

export interface HostSnapshotMessage {
  type: "host-snapshot";
  snapshot: OnlineGameSnapshot;
}

export interface QuickMatchMessage {
  type: "quick-match";
  characterIndex?: number;
}

export interface QuickMatchCancelMessage {
  type: "quick-match-cancel";
}

export interface ChatSendMessage {
  type: "chat-send";
  body: string;
}

export type ClientMessage =
  | CreateLobbyMessage
  | JoinLobbyMessage
  | LeaveLobbyMessage
  | ClaimSeatMessage
  | SetCharacterMessage
  | SetReadyMessage
  | GuestInputMessage
  | QuickMatchMessage
  | QuickMatchCancelMessage
  | ChatSendMessage
  | HostSnapshotMessage;
