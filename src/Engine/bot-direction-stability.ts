import { TILE_SIZE } from "../PersonalConfig/config";
import type { Direction, PixelCoord } from "../Gameplay/types";

export const BOT_TURN_CENTER_TOLERANCE_PX = 2;
const BOT_TURN_CENTER_EPSILON_PX = 0.01;

export type BotDirectionStabilityPhase =
  | "idle"
  | "aligned"
  | "holding-route"
  | "turn-ready"
  | "danger-override"
  | "blocked-override";

export interface BotDirectionStabilitySignal {
  phase: BotDirectionStabilityPhase;
  committedDirection: Direction | null;
  requestedDirection: Direction | null;
  pendingFrames: number;
  centerOffsetPx: number;
  decisionStillValid: boolean;
}

interface BotDirectionStabilityInput {
  position: PixelCoord;
  committedDirection: Direction | null;
  requestedDirection: Direction | null;
  pendingFrames: number;
  oppositeRequest: boolean;
  immediateDanger: boolean;
  canContinueForward: boolean;
  centerTolerancePx?: number;
  requestConfirmed: boolean;
}

function getNearestTileCenterOffset(coordinate: number): number {
  const nearestCenter = Math.round((coordinate - TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  return Math.abs(coordinate - nearestCenter);
}

export function getBotTurnCenterOffset(position: PixelCoord, direction: Direction | null): number {
  if (direction === "left" || direction === "right") {
    return getNearestTileCenterOffset(position.x);
  }
  if (direction === "up" || direction === "down") {
    return getNearestTileCenterOffset(position.y);
  }
  return 0;
}

export function getBotDirectionStabilitySignal(
  input: BotDirectionStabilityInput,
): BotDirectionStabilitySignal {
  const centerOffsetPx = getBotTurnCenterOffset(input.position, input.committedDirection);
  const base = {
    committedDirection: input.committedDirection,
    requestedDirection: input.requestedDirection,
    pendingFrames: input.pendingFrames,
    centerOffsetPx,
  };

  if (!input.requestedDirection) {
    return { ...base, phase: "idle", decisionStillValid: false };
  }
  if (!input.committedDirection || input.committedDirection === input.requestedDirection || !input.oppositeRequest) {
    return { ...base, phase: "aligned", decisionStillValid: true };
  }
  if (input.immediateDanger) {
    return { ...base, phase: "danger-override", decisionStillValid: true };
  }
  if (!input.canContinueForward) {
    return { ...base, phase: "blocked-override", decisionStillValid: true };
  }
  const centerTolerancePx = Math.max(
    BOT_TURN_CENTER_TOLERANCE_PX,
    input.centerTolerancePx ?? BOT_TURN_CENTER_TOLERANCE_PX,
  );
  if (input.requestConfirmed && centerOffsetPx <= centerTolerancePx + BOT_TURN_CENTER_EPSILON_PX) {
    return { ...base, phase: "turn-ready", decisionStillValid: true };
  }
  return { ...base, phase: "holding-route", decisionStillValid: true };
}
