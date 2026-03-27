import type { MenuPlayerId, PlayerId } from "./types";

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 480;
export const HUD_HEIGHT = 52;
export const TILE_SIZE = 40;
export const GRID_WIDTH = 11;
export const GRID_HEIGHT = 9;
export const ARENA_OFFSET_X = Math.floor((CANVAS_WIDTH - GRID_WIDTH * TILE_SIZE) / 2);
export const ARENA_OFFSET_Y = HUD_HEIGHT + 6;

export const FIXED_STEP_MS = 1000 / 60;
export const ROUND_DURATION_MS = 90_000;
export const ROUND_END_DELAY_MS = 1_600;
export const BOMB_FUSE_MS = 2_000;
export const FLAME_DURATION_MS = 600;
export const BASE_MOVE_MS = 320;
export const SPEED_STEP_MS = 40;
export const MIN_MOVE_MS = 160;
export const MAX_BOMBS = 5;
export const MAX_RANGE = 5;
export const MAX_SPEED_LEVEL = 4;
export const MAX_SHIELD_CHARGES = 2;
export const MAX_BOMB_PASS_LEVEL = 1;
export const MAX_KICK_LEVEL = 1;
export const TARGET_WINS = 5;

export const PLAYER_COLORS: Record<PlayerId, { primary: string; secondary: string; glow: string }> = {
  1: {
    primary: "#6cf4ff",
    secondary: "#1f8db2",
    glow: "rgba(108, 244, 255, 0.45)",
  },
  2: {
    primary: "#ff8b5b",
    secondary: "#b24d22",
    glow: "rgba(255, 139, 91, 0.45)",
  },
  3: {
    primary: "#8eff87",
    secondary: "#3b8b32",
    glow: "rgba(142, 255, 135, 0.45)",
  },
  4: {
    primary: "#ffd769",
    secondary: "#b0871d",
    glow: "rgba(255, 215, 105, 0.45)",
  },
};

export const KEY_BINDINGS: Record<MenuPlayerId, {
  up: string;
  down: string;
  left: string;
  right: string;
  bomb: string;
  detonate: string;
  ready: string;
}> = {
  1: {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    bomb: "KeyQ",
    detonate: "KeyR",
    ready: "KeyE",
  },
  2: {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    bomb: "KeyO",
    detonate: "KeyU",
    ready: "KeyP",
  },
};
