import type {
  ArenaState,
  BombState,
  CharacterSkillId,
  Direction,
  FlameStyle,
  MagicBeamState,
  PixelCoord,
  PlayerId,
  PlayerState,
  TileCoord,
} from "../../core/types";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
} from "../../core/config";
import type { CharacterRosterEntry } from "../assets";

export const ARENA_PIXEL_WIDTH = GRID_WIDTH * TILE_SIZE;
export const ARENA_PIXEL_HEIGHT = GRID_HEIGHT * TILE_SIZE;

export const directionDelta: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface SkillContext {
  arena: ArenaState;
  bombs: BombState[];
  players: Record<PlayerId, PlayerState>;
  activePlayerIds: PlayerId[];
  magicBeams: MagicBeamState[];
  selectedCharacterIndex: Record<PlayerId, number>;
  characterRoster: CharacterRosterEntry[];
  canOccupyPosition: (player: PlayerState, position: PixelCoord) => boolean;
  getTileFromPosition: (position: PixelCoord) => TileCoord;
  normalizeArenaPosition: (position: PixelCoord) => PixelCoord;
  getWrappedDelta: (target: number, current: number, size: number) => number;
  resolveMovementDirection: (player: PlayerState, direction: Direction, deltaMs: number) => Direction;
  movePlayerSimulated: (player: PlayerState, direction: Direction, deltaMs: number) => void;
  clonePlayerState: (player: PlayerState) => PlayerState;
  tryAbsorbInstantHit: (player: PlayerState, attackerId?: PlayerId | null) => void;
  breakCrateAtKey: (key: string) => boolean;
  addFlame: (tile: TileCoord, durationMs?: number, style?: FlameStyle) => void;
  soundManager: { playOneShot: (name: string) => void };
}

export function createDefaultPlayerSkillState(skillId: CharacterSkillId | null) {
  return {
    id: skillId,
    phase: "idle" as const,
    channelRemainingMs: 0,
    cooldownRemainingMs: 0,
    castElapsedMs: 0,
    projectedPosition: null,
    projectedLastMoveDirection: null,
  };
}

export function addMagicBeam(beam: MagicBeamState, context: SkillContext): void {
  context.magicBeams.push({
    ...beam,
    origin: { ...beam.origin },
    tiles: beam.tiles.map((tile) => ({ ...tile })),
  });
}

export function getDashDistancePx(
  from: PixelCoord,
  to: PixelCoord,
  direction: Direction,
  context: SkillContext,
): number {
  if (direction === "left" || direction === "right") {
    return Math.abs(context.getWrappedDelta(to.x, from.x, ARENA_PIXEL_WIDTH));
  }
  return Math.abs(context.getWrappedDelta(to.y, from.y, ARENA_PIXEL_HEIGHT));
}

export function hasReachedSkillTarget(
  position: PixelCoord,
  target: PixelCoord,
  context: SkillContext,
): boolean {
  const deltaX = context.getWrappedDelta(target.x, position.x, ARENA_PIXEL_WIDTH);
  const deltaY = context.getWrappedDelta(target.y, position.y, ARENA_PIXEL_HEIGHT);
  return Math.hypot(deltaX, deltaY) <= 0.5;
}

export function simulateProjectedMovement(
  player: PlayerState,
  startPosition: PixelCoord,
  desiredDirection: Direction,
  projectedLastMoveDirection: Direction | null,
  deltaMs: number,
  context: SkillContext,
): { position: PixelCoord; lastMoveDirection: Direction | null; direction: Direction } {
  const ghost = context.clonePlayerState(player);
  ghost.position = { ...startPosition };
  ghost.tile = context.getTileFromPosition(startPosition);
  ghost.velocity = { x: 0, y: 0 };
  ghost.lastMoveDirection = projectedLastMoveDirection;
  const actualDirection = context.resolveMovementDirection(ghost, desiredDirection, deltaMs);
  ghost.direction = actualDirection;
  context.movePlayerSimulated(ghost, actualDirection, deltaMs);
  return {
    position: { ...ghost.position },
    lastMoveDirection: ghost.lastMoveDirection,
    direction: ghost.direction,
  };
}
