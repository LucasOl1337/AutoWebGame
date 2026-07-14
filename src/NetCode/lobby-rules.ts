import type { PlayerId } from "../Gameplay/types";
import type { LobbyStatus } from "./protocol";

type SeatOccupancyLike = {
  clientId: string | null;
  occupantType?: "empty" | "human" | "bot";
};

type SeatLike = SeatOccupancyLike & {
  ready: boolean;
};

type SeatMapLike = Record<PlayerId, SeatLike>;

export interface LobbySeatSnapshot {
  occupiedSeatIds: PlayerId[];
  readySeatIds: PlayerId[];
  occupantCount: number;
  everyoneReady: boolean;
  minimumPlayersMet: boolean;
  canAutoStart: boolean;
  canForceStart: boolean;
}

export type LobbyJoinBlockReason = "match-in-progress" | "full";

export function getLobbyJoinBlockReason(
  status: LobbyStatus,
  alreadySeated: boolean,
  seatsFull: boolean,
): LobbyJoinBlockReason | null {
  if (alreadySeated) {
    return null;
  }
  if (status === "playing") {
    return "match-in-progress";
  }
  return seatsFull ? "full" : null;
}

export function isLobbyCardJoinDisabled(status: LobbyStatus, seatsFull = false): boolean {
  return getLobbyJoinBlockReason(status, false, seatsFull) !== null;
}

export function isPlayableLobbySeat(seat: SeatOccupancyLike | undefined): boolean {
  return Boolean(seat?.clientId) || seat?.occupantType === "bot";
}

export function getLobbySeatSnapshot(seats: SeatMapLike): LobbySeatSnapshot {
  const occupiedSeatIds = (Object.keys(seats) as unknown as PlayerId[])
    .map((seatId) => Number(seatId) as PlayerId)
    .filter((seatId) => isPlayableLobbySeat(seats[seatId]));
  const readySeatIds = occupiedSeatIds.filter((seatId) => seats[seatId]?.ready);
  const occupantCount = occupiedSeatIds.length;
  const everyoneReady = occupantCount > 0 && readySeatIds.length === occupantCount;
  const minimumPlayersMet = occupantCount >= 2;

  return {
    occupiedSeatIds,
    readySeatIds,
    occupantCount,
    everyoneReady,
    minimumPlayersMet,
    canAutoStart: occupantCount === 4 && everyoneReady,
    canForceStart: occupantCount >= 2 && occupantCount < 4 && everyoneReady,
  };
}
