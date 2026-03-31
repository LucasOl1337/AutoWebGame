import type {
  Direction,
  MagicBeamState,
  PlayerId,
  PlayerState,
  TileCoord,
} from "../../Gameplay/types";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
} from "../../PersonalConfig/config";
import { tileKey } from "../../Arenas/arena";
import type { SkillContext } from "../../ultimate/shared";
import { NICO_SKILL_COOLDOWN_MS } from "../../ultimate/skill-registry";
import {
  addMagicBeam,
  directionDelta,
} from "../../ultimate/shared";

export {
  NICO_CHARACTER_ID,
  NICO_SKILL_COOLDOWN_MS,
} from "../../ultimate/skill-registry";

export const NICO_SKILL_CHANNEL_MS = 2_000;
export const NICO_SKILL_RELEASE_MS = 260;
export const NICO_BEAM_DURATION_MS = 260;
export const NICO_BEAM_CORE_WIDTH_PX = TILE_SIZE * 0.26;
export const NICO_BEAM_GLOW_WIDTH_PX = TILE_SIZE * 0.56;

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
  if (player.skill.phase === "releasing") {
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
    player.skill.castElapsedMs += deltaMs;
    if (player.skill.channelRemainingMs <= 0) {
      finishNicoArcaneBeamRelease(player);
    }
    return true;
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
  player.skill.phase = "releasing";
  player.skill.channelRemainingMs = NICO_SKILL_RELEASE_MS;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = direction;
}

export function finishNicoArcaneBeamRelease(player: PlayerState): void {
  if (player.skill.id !== "nico-arcane-beam") {
    return;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "cooldown";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = NICO_SKILL_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

export function computeNicoBeam(
  ownerId: PlayerId,
  origin: TileCoord,
  direction: Direction,
  context: SkillContext,
): MagicBeamState {
  const tiles = collectNicoBeamTiles(origin, direction, context.arena.solid);
  return {
    ownerId,
    origin: { ...origin },
    direction,
    tiles,
    remainingMs: NICO_BEAM_DURATION_MS,
  };
}

export function collectNicoBeamTiles(
  origin: TileCoord,
  direction: Direction,
  solidTiles: ReadonlySet<string>,
): TileCoord[] {
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
    if (solidTiles.has(tileKey(tile.x, tile.y))) {
      break;
    }
    tiles.push(tile);
  }
  return tiles;
}

export function resolveNicoBeamImpact(
  ownerId: PlayerId,
  beamTiles: TileCoord[],
  context: SkillContext,
): void {
  if (beamTiles.length === 0) {
    return;
  }
  const hitKeys = new Set<string>();
  for (const tile of beamTiles) {
    const key = tileKey(tile.x, tile.y);
    hitKeys.add(key);
    context.breakCrateAtKey(key);
    const bomb = context.bombs.find((item) => item.tile.x === tile.x && item.tile.y === tile.y);
    if (bomb) {
      bomb.fuseMs = 0;
    }
  }
  for (const id of context.activePlayerIds) {
    if (id === ownerId) {
      continue;
    }
    const target = context.players[id];
    if (!target.alive) {
      continue;
    }
    target.tile = context.getTileFromPosition(target.position);
    if (!hitKeys.has(tileKey(target.tile.x, target.tile.y))) {
      continue;
    }
    context.tryAbsorbInstantHit(target, ownerId);
  }
}
