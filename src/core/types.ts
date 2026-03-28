export type PlayerId = 1 | 2 | 3 | 4;
export type MenuPlayerId = 1 | 2;
export const ALL_PLAYER_IDS = [1, 2, 3, 4] as const;
export const MENU_PLAYER_IDS = [1, 2] as const;
export type Mode = "boot" | "menu" | "match" | "match-result";
export type Direction = "up" | "down" | "left" | "right";
export type FlameStyle = "normal" | "arcane" | "shadow";
export type CharacterSkillId = "ranni-ice-blink";
export type SkillPhase = "idle" | "channeling" | "cooldown";
export type PowerUpType =
  | "bomb-up"
  | "flame-up"
  | "speed-up"
  | "remote-up";

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
  active: boolean;
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
  skill: PlayerSkillState;
}

export interface PlayerSkillState {
  id: CharacterSkillId | null;
  phase: SkillPhase;
  channelRemainingMs: number;
  cooldownRemainingMs: number;
  castElapsedMs: number;
  projectedPosition: PixelCoord | null;
  projectedLastMoveDirection: Direction | null;
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
  style?: FlameStyle;
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
  3: number;
  4: number;
}

export interface RoundOutcome {
  winner: PlayerId | null;
  reason: "elimination" | "timer" | "double-ko";
  message: string;
  countdownMs: number;
}
