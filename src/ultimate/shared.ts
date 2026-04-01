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
} from "../Gameplay/types";
import {
  TILE_SIZE,
} from "../PersonalConfig/config";
import type { CharacterRosterEntry } from "../Engine/assets";

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
  const arenaPixelWidth = context.arena.config.grid.width * TILE_SIZE;
  const arenaPixelHeight = context.arena.config.grid.height * TILE_SIZE;
  if (direction === "left" || direction === "right") {
    return Math.abs(context.getWrappedDelta(to.x, from.x, arenaPixelWidth));
  }
  return Math.abs(context.getWrappedDelta(to.y, from.y, arenaPixelHeight));
}

export function hasReachedSkillTarget(
  position: PixelCoord,
  target: PixelCoord,
  context: SkillContext,
): boolean {
  const arenaPixelWidth = context.arena.config.grid.width * TILE_SIZE;
  const arenaPixelHeight = context.arena.config.grid.height * TILE_SIZE;
  const deltaX = context.getWrappedDelta(target.x, position.x, arenaPixelWidth);
  const deltaY = context.getWrappedDelta(target.y, position.y, arenaPixelHeight);
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
