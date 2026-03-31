import type { OnlineInputState } from "./protocol";

export interface SequencedOnlineInputState extends OnlineInputState {
  inputSeq: number;
  sentAtMs: number;
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
    direction: incoming.direction ?? null,
    bombPressed: current.bombPressed || Boolean(incoming.bombPressed),
    detonatePressed: current.detonatePressed || Boolean(incoming.detonatePressed),
    skillPressed: current.skillPressed || Boolean(incoming.skillPressed),
    skillHeld: Boolean(incoming.skillHeld),
    inputSeq: incomingSeq,
    sentAtMs: Math.max(0, Number(incoming.sentAtMs) || 0),
  };
}
