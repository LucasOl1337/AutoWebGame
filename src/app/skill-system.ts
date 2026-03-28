import type {
  ArenaState,
  BombState,
  CharacterSkillId,
  Direction,
  MagicBeamState,
  PixelCoord,
  PlayerId,
  PlayerState,
  TileCoord,
} from "../core/types";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
} from "../core/config";
import { tileKey } from "../game/arena";
import type { CharacterRosterEntry } from "./assets";

// Skill-specific constants
export const RANNI_CHARACTER_ID = "03a976fb-7313-4064-a477-5bb9b0760034";
export const KILLER_BEE_CHARACTER_ID = "6ee8baa5-3277-413b-ae0e-2659b9cc52e9";
export const NICO_CHARACTER_ID = "5474c45c-2987-43e0-af2c-a6500c836881";

export const RANNI_SKILL_CHANNEL_MS = 1_500;
export const RANNI_SKILL_COOLDOWN_MS = 10_000;

export const KILLER_BEE_DASH_DISTANCE_PX = TILE_SIZE * 3;
export const KILLER_BEE_DASH_DURATION_MS = 240;
export const KILLER_BEE_DASH_MIN_DURATION_MS = 90;
export const KILLER_BEE_DASH_FRAME_MS = 60;
export const KILLER_BEE_SKILL_COOLDOWN_MS = 10_000;

export const NICO_SKILL_CHANNEL_MS = 2_000;
export const NICO_SKILL_COOLDOWN_MS = 10_000;
export const NICO_BEAM_DURATION_MS = 260;
export const NICO_BEAM_CORE_WIDTH_PX = TILE_SIZE * 0.26;
export const NICO_BEAM_GLOW_WIDTH_PX = TILE_SIZE * 0.56;

const ARENA_PIXEL_WIDTH = GRID_WIDTH * TILE_SIZE;
const ARENA_PIXEL_HEIGHT = GRID_HEIGHT * TILE_SIZE;

const directionDelta: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Context interface providing access to game state and callbacks needed for skill operations.
 */
export interface SkillContext {
  arena: ArenaState;
  bombs: BombState[];
  players: Record<PlayerId, PlayerState>;
  activePlayerIds: PlayerId[];
  magicBeams: MagicBeamState[];
  selectedCharacterIndex: Record<PlayerId, number>;
  characterRoster: CharacterRosterEntry[];

  // Callbacks for methods that stay in GameApp
  canOccupyPosition: (player: PlayerState, position: PixelCoord) => boolean;
  getTileFromPosition: (position: PixelCoord) => TileCoord;
  normalizeArenaPosition: (position: PixelCoord) => PixelCoord;
  getWrappedDelta: (target: number, current: number, size: number) => number;
  resolveMovementDirection: (player: PlayerState, direction: Direction, deltaMs: number) => Direction;
  movePlayerSimulated: (player: PlayerState, direction: Direction, deltaMs: number) => void;
  clonePlayerState: (player: PlayerState) => PlayerState;
  tryAbsorbInstantHit: (player: PlayerState) => void;
  breakCrateAtKey: (key: string) => boolean;
  soundManager: { playOneShot: (name: string) => void };
}

/**
 * Create a default player skill state for the given skill ID.
 */
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

/**
 * Sync the player's skill to match their character's skill ID.
 */
export function syncPlayerSkill(
  player: PlayerState,
  _context: SkillContext,
  getPlayerSkillId: (playerId: PlayerId) => CharacterSkillId | null,
): void {
  const expectedSkillId = getPlayerSkillId(player.id);
  if (player.skill.id === expectedSkillId) {
    return;
  }
  player.skill = createDefaultPlayerSkillState(expectedSkillId);
}

/**
 * Advance skill cooldown timers for the player.
 */
export function advancePlayerSkillTimers(player: PlayerState, deltaMs: number): void {
  if (player.skill.phase !== "cooldown") {
    return;
  }
  player.skill.cooldownRemainingMs = Math.max(0, player.skill.cooldownRemainingMs - deltaMs);
  if (player.skill.cooldownRemainingMs <= 0) {
    player.skill.phase = "idle";
    player.skill.castElapsedMs = 0;
  }
}

/**
 * Activate a player's skill in the specified direction.
 */
export function activatePlayerSkill(
  player: PlayerState,
  desiredDirection: Direction | null,
  context: SkillContext,
): void {
  if (!player.alive || player.skill.phase !== "idle") {
    return;
  }
  switch (player.skill.id) {
    case "ranni-ice-blink":
      startRanniIceBlink(player);
      return;
    case "killer-bee-wing-dash":
      startKillerBeeDash(player, desiredDirection, context);
      return;
    case "nico-arcane-beam":
      startNicoArcaneBeam(player, desiredDirection);
      return;
    default:
      return;
  }
}

/**
 * Start Ranni's Ice Blink skill.
 */
export function startRanniIceBlink(player: PlayerState): void {
  player.skill.phase = "channeling";
  player.skill.channelRemainingMs = RANNI_SKILL_CHANNEL_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = { ...player.position };
  player.skill.projectedLastMoveDirection = player.lastMoveDirection;
  player.velocity.x = 0;
  player.velocity.y = 0;
}

/**
 * Start Killer Bee's Wing Dash skill.
 */
export function startKillerBeeDash(
  player: PlayerState,
  desiredDirection: Direction | null,
  context: SkillContext,
): void {
  if (player.skill.id !== "killer-bee-wing-dash") {
    return;
  }
  const dashDirection = desiredDirection ?? player.lastMoveDirection ?? player.direction;
  const target = computeKillerBeeDashTarget(player, dashDirection, context);
  const dashDistance = getDashDistancePx(player.position, target, dashDirection, context);
  if (dashDistance < 1) {
    return;
  }
  const durationMs = Math.max(
    KILLER_BEE_DASH_MIN_DURATION_MS,
    Math.round(KILLER_BEE_DASH_DURATION_MS * (dashDistance / KILLER_BEE_DASH_DISTANCE_PX)),
  );
  player.direction = dashDirection;
  player.lastMoveDirection = dashDirection;
  player.skill.phase = "channeling";
  player.skill.channelRemainingMs = durationMs;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = target;
  player.skill.projectedLastMoveDirection = dashDirection;
  player.velocity.x = 0;
  player.velocity.y = 0;
}

/**
 * Start Nico's Arcane Beam skill.
 */
export function startNicoArcaneBeam(
  player: PlayerState,
  desiredDirection: Direction | null,
): void {
  if (player.skill.id !== "nico-arcane-beam") {
    return;
  }
  const aimDirection = desiredDirection ?? player.lastMoveDirection ?? player.direction;
  player.direction = aimDirection;
  player.lastMoveDirection = aimDirection;
  player.skill.phase = "channeling";
  player.skill.channelRemainingMs = NICO_SKILL_CHANNEL_MS;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = aimDirection;
  player.velocity.x = 0;
  player.velocity.y = 0;
}

/**
 * Update the channeling phase of a player's skill.
 */
export function updatePlayerSkillChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillPressed: boolean,
  skillHeld: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.phase !== "channeling") {
    return false;
  }
  switch (player.skill.id) {
    case "ranni-ice-blink":
      return updateRanniIceBlinkChannel(player, desiredDirection, skillPressed, deltaMs, context);
    case "killer-bee-wing-dash":
      return updateKillerBeeDash(player, deltaMs, context);
    case "nico-arcane-beam":
      return updateNicoArcaneBeamChannel(player, desiredDirection, skillHeld, deltaMs, context);
    default:
      return false;
  }
}

/**
 * Update Ranni's Ice Blink channeling phase.
 */
export function updateRanniIceBlinkChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillPressed: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  player.velocity.x = 0;
  player.velocity.y = 0;
  if (skillPressed && player.skill.castElapsedMs > 0) {
    finishRanniBlink(player, context);
    return true;
  }
  if (!player.skill.projectedPosition) {
    player.skill.projectedPosition = { ...player.position };
  }
  if (desiredDirection) {
    const simulated = simulateProjectedMovement(
      player,
      player.skill.projectedPosition,
      desiredDirection,
      player.skill.projectedLastMoveDirection,
      deltaMs,
      context,
    );
    player.skill.projectedPosition = simulated.position;
    player.skill.projectedLastMoveDirection = simulated.lastMoveDirection;
    player.direction = simulated.direction;
  }

  player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
  player.skill.castElapsedMs += deltaMs;
  if (player.skill.channelRemainingMs <= 0) {
    finishRanniBlink(player, context);
  }
  return true;
}

/**
 * Update Killer Bee's Wing Dash channeling phase.
 */
export function updateKillerBeeDash(player: PlayerState, deltaMs: number, context: SkillContext): boolean {
  if (player.skill.id !== "killer-bee-wing-dash") {
    return false;
  }
  const dashDirection = player.skill.projectedLastMoveDirection ?? player.lastMoveDirection ?? player.direction;
  const target = player.skill.projectedPosition ?? player.position;
  const start = { ...player.position };
  const remainingMs = Math.max(0, player.skill.channelRemainingMs);
  const stepFraction = remainingMs <= 0 ? 1 : Math.min(1, deltaMs / remainingMs);
  const deltaX = context.getWrappedDelta(target.x, player.position.x, ARENA_PIXEL_WIDTH);
  const deltaY = context.getWrappedDelta(target.y, player.position.y, ARENA_PIXEL_HEIGHT);
  player.position = context.normalizeArenaPosition({
    x: player.position.x + deltaX * stepFraction,
    y: player.position.y + deltaY * stepFraction,
  });
  player.velocity = {
    x: context.getWrappedDelta(player.position.x, start.x, ARENA_PIXEL_WIDTH) / (deltaMs / 1000),
    y: context.getWrappedDelta(player.position.y, start.y, ARENA_PIXEL_HEIGHT) / (deltaMs / 1000),
  };
  player.direction = dashDirection;
  player.lastMoveDirection = dashDirection;
  player.tile = context.getTileFromPosition(player.position);
  player.skill.channelRemainingMs = Math.max(0, remainingMs - deltaMs);
  player.skill.castElapsedMs += deltaMs;
  if (player.skill.channelRemainingMs <= 0 || hasReachedSkillTarget(player.position, target, context)) {
    finishKillerBeeDash(player, context);
  }
  return true;
}

/**
 * Update Nico's Arcane Beam channeling phase.
 */
export function updateNicoArcaneBeamChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillHeld: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.id !== "nico-arcane-beam") {
    return false;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  if (desiredDirection) {
    player.direction = desiredDirection;
    player.skill.projectedLastMoveDirection = desiredDirection;
  }
  if (!skillHeld && player.skill.castElapsedMs > 0) {
    cancelNicoArcaneBeam(player);
    return true;
  }
  player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
  player.skill.castElapsedMs += deltaMs;
  if (player.skill.channelRemainingMs <= 0) {
    fireNicoArcaneBeam(player, context);
  }
  return true;
}

/**
 * Finish Ranni's Ice Blink skill by teleporting to the projected position.
 */
export function finishRanniBlink(player: PlayerState, context: SkillContext): void {
  if (player.skill.id !== "ranni-ice-blink") {
    return;
  }
  const target = player.skill.projectedPosition ?? player.position;
  if (context.canOccupyPosition(player, target)) {
    player.position = { ...target };
    player.tile = context.getTileFromPosition(player.position);
  }
  if (player.skill.projectedLastMoveDirection) {
    player.lastMoveDirection = player.skill.projectedLastMoveDirection;
    player.direction = player.skill.projectedLastMoveDirection;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "cooldown";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = RANNI_SKILL_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

/**
 * Finish Killer Bee's Wing Dash skill.
 */
export function finishKillerBeeDash(player: PlayerState, context: SkillContext): void {
  if (player.skill.id !== "killer-bee-wing-dash") {
    return;
  }
  const target = player.skill.projectedPosition ?? player.position;
  player.position = { ...target };
  player.tile = context.getTileFromPosition(player.position);
  if (player.skill.projectedLastMoveDirection) {
    player.direction = player.skill.projectedLastMoveDirection;
    player.lastMoveDirection = player.skill.projectedLastMoveDirection;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "cooldown";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = KILLER_BEE_SKILL_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

/**
 * Cancel Nico's Arcane Beam skill.
 */
export function cancelNicoArcaneBeam(player: PlayerState): void {
  if (player.skill.id !== "nico-arcane-beam") {
    return;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "idle";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

/**
 * Fire Nico's Arcane Beam and apply its effects.
 */
export function fireNicoArcaneBeam(player: PlayerState, context: SkillContext): void {
  if (player.skill.id !== "nico-arcane-beam") {
    return;
  }
  const direction = player.skill.projectedLastMoveDirection ?? player.lastMoveDirection ?? player.direction;
  const origin = context.getTileFromPosition(player.position);
  const beam = computeNicoBeam(player.id, origin, direction, context);
  addMagicBeam(beam, context);
  resolveNicoBeamImpact(player.id, beam.tiles, context);
  player.direction = direction;
  player.lastMoveDirection = direction;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "cooldown";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = NICO_SKILL_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

/**
 * Check if a player is immune during skill channeling.
 */
export function isPlayerImmuneDuringSkillChannel(player: PlayerState): boolean {
  return player.skill.id === "ranni-ice-blink" && player.skill.phase === "channeling";
}

/**
 * Compute the magic beam for Nico's Arcane Beam skill.
 */
export function computeNicoBeam(
  ownerId: PlayerId,
  origin: TileCoord,
  direction: Direction,
  context: SkillContext,
): MagicBeamState {
  const delta = directionDelta[direction];
  const maxSteps = direction === "left" || direction === "right"
    ? Math.ceil(GRID_WIDTH / 2)
    : Math.ceil(GRID_HEIGHT / 2);
  const tiles: TileCoord[] = [];
  for (let step = 1; step <= maxSteps; step += 1) {
    const tile = {
      x: origin.x + delta.x * step,
      y: origin.y + delta.y * step,
    };
    if (tile.x < 0 || tile.y < 0 || tile.x >= GRID_WIDTH || tile.y >= GRID_HEIGHT) {
      break;
    }
    const key = tileKey(tile.x, tile.y);
    if (context.arena.solid.has(key)) {
      break;
    }
    tiles.push(tile);
  }
  return {
    ownerId,
    origin: { ...origin },
    direction,
    tiles,
    remainingMs: NICO_BEAM_DURATION_MS,
  };
}

/**
 * Add a magic beam to the game state.
 */
export function addMagicBeam(beam: MagicBeamState, context: SkillContext): void {
  context.magicBeams.push({
    ...beam,
    origin: { ...beam.origin },
    tiles: beam.tiles.map((tile) => ({ ...tile })),
  });
}

/**
 * Resolve the impact of Nico's Arcane Beam on the game world.
 */
export function resolveNicoBeamImpact(
  ownerId: PlayerId,
  beamTiles: TileCoord[],
  context: SkillContext,
): void {
  if (beamTiles.length === 0) {
    return;
  }
  let brokeCrate = false;
  const hitKeys = new Set<string>();
  for (const tile of beamTiles) {
    const key = tileKey(tile.x, tile.y);
    hitKeys.add(key);
    if (context.breakCrateAtKey(key)) {
      brokeCrate = true;
    }
    const bomb = context.bombs.find((item) => item.tile.x === tile.x && item.tile.y === tile.y);
    if (bomb) {
      bomb.fuseMs = 0;
    }
  }
  for (const id of context.activePlayerIds) {
    if (id === ownerId) {
      continue;
    }
    const player = context.players[id];
    if (!player.alive) {
      continue;
    }
    player.tile = context.getTileFromPosition(player.position);
    if (!hitKeys.has(tileKey(player.tile.x, player.tile.y))) {
      continue;
    }
    context.tryAbsorbInstantHit(player);
  }
  if (brokeCrate) {
    context.soundManager.playOneShot("crateBreak");
  }
}

/**
 * Compute the target position for Killer Bee's dash.
 */
export function computeKillerBeeDashTarget(
  player: PlayerState,
  direction: Direction,
  context: SkillContext,
): PixelCoord {
  const delta = directionDelta[direction];
  const stepPx = 4;
  let position = { ...player.position };
  let travelledPx = 0;
  while (travelledPx < KILLER_BEE_DASH_DISTANCE_PX) {
    const nextStep = Math.min(stepPx, KILLER_BEE_DASH_DISTANCE_PX - travelledPx);
    const candidate = context.normalizeArenaPosition({
      x: position.x + delta.x * nextStep,
      y: position.y + delta.y * nextStep,
    });
    if (!context.canOccupyPosition(player, candidate)) {
      break;
    }
    position = candidate;
    travelledPx += nextStep;
  }
  return position;
}

/**
 * Get the distance traveled by a dash skill.
 */
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

/**
 * Check if a position has reached the skill target.
 */
export function hasReachedSkillTarget(
  position: PixelCoord,
  target: PixelCoord,
  context: SkillContext,
): boolean {
  const deltaX = context.getWrappedDelta(target.x, position.x, ARENA_PIXEL_WIDTH);
  const deltaY = context.getWrappedDelta(target.y, position.y, ARENA_PIXEL_HEIGHT);
  return Math.hypot(deltaX, deltaY) <= 0.5;
}

/**
 * Simulate projected movement during skill channeling.
 */
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
