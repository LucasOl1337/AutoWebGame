import type { PowerUpType } from "./types";

export const PICKUP_CHAIN_WINDOW_MS = 4_200;
export const PICKUP_CHAIN_ROLLING_WINDOW_MS = 1_400;
export const PICKUP_CHAIN_GUARD_MS = 1_400;

export interface PickupChainState {
  previousType: PowerUpType | null;
  remainingMs: number;
}

export function createPickupChainState(): PickupChainState {
  return {
    previousType: null,
    remainingMs: 0,
  };
}

export function advancePickupChain(state: PickupChainState, deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return;
  }

  state.remainingMs = Math.max(0, state.remainingMs - deltaMs);
  if (state.remainingMs === 0) {
    state.previousType = null;
  }
}

export function registerPickupForChain(state: PickupChainState, type: PowerUpType): boolean {
  if (!Number.isFinite(state.remainingMs)) {
    state.previousType = null;
    state.remainingMs = 0;
  }

  const completedChain = state.remainingMs > 0
    && state.previousType !== null
    && state.previousType !== type;

  if (completedChain) {
    state.previousType = type;
    state.remainingMs = PICKUP_CHAIN_ROLLING_WINDOW_MS;
    return true;
  }

  if (state.remainingMs > 0 && state.previousType === type) {
    return false;
  }

  state.previousType = type;
  state.remainingMs = PICKUP_CHAIN_WINDOW_MS;
  return false;
}
