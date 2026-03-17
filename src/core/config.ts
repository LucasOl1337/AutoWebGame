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
export const TARGET_WINS = 2;

export const PLAYER_COLORS = {
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
} as const;

export const KEY_BINDINGS = {
  1: {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    bomb: "KeyQ",
    ready: "KeyE",
  },
  2: {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    bomb: "KeyO",
    ready: "KeyP",
  },
} as const;
