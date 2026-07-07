import type { Direction } from "../Gameplay/types";
import type { OnlineInputState } from "./protocol";

const VALID_ONLINE_DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface SequencedOnlineInputState extends OnlineInputState {
  inputSeq: number;
  sentAtMs: number;
}

function normalizeOnlineDirection(value: unknown): Direction | null {
  if (typeof value !== "string") {
    return null;
  }
  return VALID_ONLINE_DIRECTIONS.includes(value as Direction) ? (value as Direction) : null;
}

export function mergeSequencedOnlineInputState(
  current: SequencedOnlineInputState,
  incoming: SequencedOnlineInputState,
): SequencedOnlineInputState {
  const currentSeq = Math.max(0, Number(current.inputSeq) || 0);
  const incomingSeq = Math.max(0, Number(incoming.inputSeq) || 0);
  if (incomingSeq < currentSeq) {
    return current;
  }

  return {
    direction: normalizeOnlineDirection(incoming.direction),
    bombPressed: current.bombPressed || Boolean(incoming.bombPressed),
    detonatePressed: current.detonatePressed || Boolean(incoming.detonatePressed),
    skillPressed: current.skillPressed || Boolean(incoming.skillPressed),
    skillHeld: Boolean(incoming.skillHeld),
    inputSeq: incomingSeq,
    sentAtMs: Math.max(0, Number(incoming.sentAtMs) || 0),
  };
}
