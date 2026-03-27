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
}

export interface MatchStartConfig {
  roomCode: string;
  role: OnlineRole;
  localPlayerId: PlayerId;
  remotePlayerId: PlayerId;
  characterSelections: Record<PlayerId, number>;
}

export interface OnlineGameSnapshot {
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
}

export interface OnlineSessionBridge {
  role: OnlineRole | null;
  roomCode: string | null;
  sendGuestInput(input: OnlineInputState): void;
  sendHostSnapshot(snapshot: OnlineGameSnapshot): void;
}

export interface ServerHelloMessage {
  type: "hello";
  clientId: string;
  lobbies: LobbySummary[];
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

export interface ServerErrorMessage {
  type: "error";
  message: string;
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
  | ServerSnapshotMessage
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
  input: OnlineInputState;
}

export interface HostSnapshotMessage {
  type: "host-snapshot";
  snapshot: OnlineGameSnapshot;
}

export type ClientMessage =
  | CreateLobbyMessage
  | JoinLobbyMessage
  | LeaveLobbyMessage
  | ClaimSeatMessage
  | SetCharacterMessage
  | SetReadyMessage
  | GuestInputMessage
  | HostSnapshotMessage;
