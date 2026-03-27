export type PlayerId = 1 | 2;
export type Mode = "boot" | "menu" | "match" | "match-result";
export type Direction = "up" | "down" | "left" | "right";
export type PowerUpType =
  | "bomb-up"
  | "flame-up"
  | "speed-up"
  | "remote-up"
  | "shield-up"
  | "bomb-pass-up"
  | "kick-up";

export interface TileCoord {
  x: number;
  y: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  tile: TileCoord;
  position: PixelCoord;
  velocity: PixelCoord;
  alive: boolean;
  direction: Direction;
  lastMoveDirection: Direction | null;
  maxBombs: number;
  activeBombs: number;
  flameRange: number;
  speedLevel: number;
  remoteLevel: number;
  shieldCharges: number;
  bombPassLevel: number;
  kickLevel: number;
  flameGuardMs: number;
  spawnProtectionMs: number;
}

export interface BombState {
  id: number;
  ownerId: PlayerId;
  tile: TileCoord;
  fuseMs: number;
  ownerCanPass: boolean;
  flameRange: number;
}

export interface FlameState {
  tile: TileCoord;
  remainingMs: number;
}

export interface PowerUpState {
  type: PowerUpType;
  tile: TileCoord;
  revealed: boolean;
  collected: boolean;
}

export interface ArenaState {
  solid: Set<string>;
  breakable: Set<string>;
  powerUps: PowerUpState[];
}

export interface MatchScore {
  1: number;
  2: number;
}

export interface RoundOutcome {
  winner: PlayerId | null;
  reason: "elimination" | "timer" | "double-ko";
  message: string;
  countdownMs: number;
}
