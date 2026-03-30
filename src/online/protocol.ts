import type {
  BombState,
  Direction,
  FlameState,
  MagicBeamState,
  MatchScore,
  Mode,
  PlayerId,
  PlayerState,
  PowerUpState,
  RoundOutcome,
  SuddenDeathClosingTileState,
} from "../core/types";
import type { PlayerAccount } from "./account";
import type { OnlineRoomKind, OnlineSessionState } from "./matchmaking";

export type OnlineRole = "host" | "guest";
export type LobbyStatus = "open" | "playing";
export type LobbyMode = "classic" | "endless";
export type LobbySeatOccupantType = "empty" | "human" | "bot";

export interface OnlineInputState {
  direction: Direction | null;
  bombPressed: boolean;
  detonatePressed: boolean;
  skillPressed: boolean;
  skillHeld?: boolean;
}

export interface LobbySeatState {
  clientId: string | null;
  displayName: string | null;
  characterIndex: number;
  ready: boolean;
  occupantType: LobbySeatOccupantType;
}

export interface LobbySummary {
  roomCode: string;
  title: string;
  status: LobbyStatus;
  roomMode: LobbyMode;
  roomKind: OnlineRoomKind;
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

export interface OnlinePresenceEntry {
  clientId: string;
  displayName: string | null;
}

export interface MatchStartConfig {
  roomCode: string;
  role: OnlineRole;
  roomMode: LobbyMode;
  localPlayerId: PlayerId;
  activePlayerIds: PlayerId[];
  botPlayerIds: PlayerId[];
  characterSelections: Record<PlayerId, number>;
  playerLabels: Record<PlayerId, string>;
}

export interface OnlineEndlessStats {
  kills: MatchScore;
  roundWins: MatchScore;
}

export interface OnlineGameSnapshot {
  serverTimeMs: number;
  serverTick: number;
  frameId: number;
  ackedInputSeq: Record<PlayerId, number>;
  mode: Mode;
  roomMode: LobbyMode;
  breakableTiles: string[];
  powerUps: PowerUpState[];
  players: Record<PlayerId, PlayerState>;
  bombs: BombState[];
  flames: FlameState[];
  magicBeams: MagicBeamState[];
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
  suddenDeathClosedTiles: string[];
  suddenDeathClosingTiles: SuddenDeathClosingTileState[];
  showDangerOverlay: boolean;
  showBombPreview: boolean;
  selectedCharacterIndex: Record<PlayerId, number>;
  activePlayerIds: PlayerId[];
  botPlayerIds: PlayerId[];
  endlessStats: OnlineEndlessStats | null;
}

export interface OnlineGameFrame {
  serverTimeMs: number;
  serverTick: number;
  frameId: number;
  ackedInputSeq: Record<PlayerId, number>;
  mode: Mode;
  roomMode: LobbyMode;
  players: Record<PlayerId, PlayerState>;
  bombs: BombState[];
  flames: FlameState[];
  magicBeams: MagicBeamState[];
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
  suddenDeathClosedTiles: string[];
  suddenDeathClosingTiles: SuddenDeathClosingTileState[];
  selectedCharacterIndex: Record<PlayerId, number>;
  activePlayerIds: PlayerId[];
  botPlayerIds: PlayerId[];
  endlessStats: OnlineEndlessStats | null;
}

export interface OnlineSessionBridge {
  role: OnlineRole | null;
  roomCode: string | null;
  sendGuestInput(input: OnlineInputState, inputSeq: number): void;
  sendHostSnapshot(snapshot: OnlineGameSnapshot): void;
  sendMatchResultChoice(choice: "rematch" | "lobby"): void;
}

export interface ServerHelloMessage {
  type: "hello";
  clientId: string;
  account: PlayerAccount | null;
  sessionState: OnlineSessionState;
  lobbies: LobbySummary[];
  onlineUsers: number;
  onlinePlayers: OnlinePresenceEntry[];
  quickMatchQueued: number;
  searchingQuickMatch: boolean;
}

export interface ServerLobbyListMessage {
  type: "lobby-list";
  lobbies: LobbySummary[];
  onlineUsers: number;
  onlinePlayers: OnlinePresenceEntry[];
  sessionState: OnlineSessionState;
}

export interface ServerLobbyJoinedMessage {
  type: "lobby-joined";
  lobby: LobbyState;
  role: OnlineRole;
  sessionState: OnlineSessionState;
}

export interface ServerLobbyUpdatedMessage {
  type: "lobby-updated";
  lobby: LobbyState;
  sessionState: OnlineSessionState;
}

export interface ServerLobbyLeftMessage {
  type: "lobby-left";
  sessionState: OnlineSessionState;
}

export interface ServerMatchStartedMessage {
  type: "match-started";
  config: MatchStartConfig;
  sessionState: OnlineSessionState;
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
  onlineUsers: number;
  onlinePlayers: OnlinePresenceEntry[];
  sessionState: OnlineSessionState;
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

export interface EndlessMatchMessage {
  type: "endless-match";
  characterIndex?: number;
}

export interface QuickMatchCancelMessage {
  type: "quick-match-cancel";
}

export interface MatchResultChoiceMessage {
  type: "match-result-choice";
  choice: "rematch" | "lobby";
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
  | EndlessMatchMessage
  | QuickMatchCancelMessage
  | MatchResultChoiceMessage
  | ChatSendMessage
  | HostSnapshotMessage;
