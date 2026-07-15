import {
  BASE_MOVE_MS,
  MIN_MOVE_MS,
  SPEED_STEP_MS,
} from "../PersonalConfig/config";
import { getBombFuseMsForPlayer } from "../Gameplay/powerups";
import type { PlayerState } from "../Gameplay/types";

export const BOT_BOMB_ESCAPE_RESERVE_MS = 250;

export interface BotBombEscapeBudget {
  fuseMs: number;
  moveDurationMs: number;
  reserveMs: number;
  usableEscapeMs: number;
  maxEscapeSteps: number;
}

export function getBotBombEscapeBudget(player: PlayerState): BotBombEscapeBudget {
  const fuseMs = getBombFuseMsForPlayer(player);
  const moveDurationMs = Math.max(
    MIN_MOVE_MS,
    BASE_MOVE_MS - player.speedLevel * SPEED_STEP_MS,
  );
  const usableEscapeMs = Math.max(0, fuseMs - BOT_BOMB_ESCAPE_RESERVE_MS);

  return {
    fuseMs,
    moveDurationMs,
    reserveMs: BOT_BOMB_ESCAPE_RESERVE_MS,
    usableEscapeMs,
    maxEscapeSteps: Math.floor(usableEscapeMs / moveDurationMs),
  };
}
