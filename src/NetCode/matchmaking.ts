import type { LobbyMode, LobbySeatOccupantType, LobbyStatus } from "./protocol";
import type { PlayerId } from "../Gameplay/types";

export type OnlineRoomKind = "manual" | "matchmaking" | "endless";
export type OnlineClientIntent = "idle" | "manual" | "queue_classic" | "queue_endless";
export type OnlineSessionStateKind =
  | "idle"
  | "queueing-classic"
  | "queueing-endless"
  | "in-manual-lobby"
  | "in-matchmaking-lobby"
  | "in-endless-room"
  | "in-classic-match"
  | "in-endless-match";

export interface MatchmakingRoomDescriptor {
  roomCode: string;
  roomMode: LobbyMode;
  roomKind: OnlineRoomKind;
  status: LobbyStatus;
}

export interface MatchmakingSeatDescriptor {
  clientId: string | null;
  occupantType: LobbySeatOccupantType;
}

export interface OnlineSessionState {
  kind: OnlineSessionStateKind;
  intent: OnlineClientIntent;
  roomCode: string | null;
  roomMode: LobbyMode | null;
  roomKind: OnlineRoomKind | null;
}

export function createIdleSessionState(): OnlineSessionState {
  return {
    kind: "idle",
    intent: "idle",
    roomCode: null,
    roomMode: null,
    roomKind: null,
  };
}

export function resolveOnlineSessionState(
  intent: OnlineClientIntent,
  room: MatchmakingRoomDescriptor | null,
  hasActiveMatch: boolean,
): OnlineSessionState {
  if (room) {
    if (hasActiveMatch) {
      return {
        kind: room.roomMode === "endless" ? "in-endless-match" : "in-classic-match",
        intent,
        roomCode: room.roomCode,
        roomMode: room.roomMode,
        roomKind: room.roomKind,
      };
    }

    return {
      kind: room.roomMode === "endless"
        ? "in-endless-room"
        : room.roomKind === "matchmaking"
          ? "in-matchmaking-lobby"
          : "in-manual-lobby",
      intent,
      roomCode: room.roomCode,
      roomMode: room.roomMode,
      roomKind: room.roomKind,
    };
  }

  if (intent === "queue_classic") {
    return {
      kind: "queueing-classic",
      intent,
      roomCode: null,
      roomMode: null,
      roomKind: null,
    };
  }

  if (intent === "queue_endless") {
    return {
      kind: "queueing-endless",
      intent,
      roomCode: null,
      roomMode: null,
      roomKind: null,
    };
  }

  return createIdleSessionState();
}

export function isManualLobbyVisible(room: MatchmakingRoomDescriptor): boolean {
  return room.roomMode === "classic" && room.roomKind === "manual";
}

export function isQuickMatchCandidate(room: MatchmakingRoomDescriptor, excludeRoomCode: string | null = null): boolean {
  return room.roomMode === "classic"
    && room.roomKind === "matchmaking"
    && room.status === "open"
    && room.roomCode !== excludeRoomCode;
}

export function canReuseCurrentRoomForQuickMatch(room: MatchmakingRoomDescriptor | null): boolean {
  return Boolean(
    room
    && room.roomMode === "classic"
    && room.roomKind === "matchmaking"
    && room.status === "open",
  );
}

export function shouldResetPlayingRoom(
  room: MatchmakingRoomDescriptor,
  seats: Record<PlayerId, MatchmakingSeatDescriptor>,
  activePlayerIds: PlayerId[],
): boolean {
  if (room.status !== "playing") {
    return false;
  }

  if (activePlayerIds.length === 0) {
    return true;
  }

  if (room.roomMode === "endless") {
    return activePlayerIds.some((playerId) => seats[playerId]?.occupantType === "empty");
  }

  const connectedHumanCount = activePlayerIds.filter((playerId) => Boolean(seats[playerId]?.clientId)).length;
  return connectedHumanCount < 2 || activePlayerIds.some((playerId) => !seats[playerId]?.clientId);
}
