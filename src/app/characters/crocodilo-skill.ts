import type {
  Direction,
  PlayerState,
  TileCoord,
} from "../../core/types";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
} from "../../core/config";
import { tileKey } from "../../game/arena";
import type { SkillContext } from "./shared";
import { CROCODILO_SKILL_COOLDOWN_MS } from "./skill-registry";

export {
  CROCODILO_CHARACTER_ID,
  CROCODILO_SKILL_COOLDOWN_MS,
} from "./skill-registry";

export const CROCODILO_SKILL_CHANNEL_MS = 1_600;
export const CROCODILO_SKILL_RELEASE_MS = 240;
export const CROCODILO_SURGE_DURATION_MS = 720;
export const CROCODILO_SURGE_RANGE = 2;

const directionDelta: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function startCrocodiloEmeraldSurge(
  player: PlayerState,
  desiredDirection: Direction | null,
): void {
  if (player.skill.id !== "crocodilo-emerald-surge") {
    return;
  }
  const aimDirection = desiredDirection ?? player.lastMoveDirection ?? player.direction;
  player.direction = aimDirection;
  player.lastMoveDirection = aimDirection;
  player.skill.phase = "channeling";
  player.skill.channelRemainingMs = CROCODILO_SKILL_CHANNEL_MS;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = aimDirection;
  player.velocity.x = 0;
  player.velocity.y = 0;
}

export function updateCrocodiloEmeraldSurgeChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillHeld: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.id !== "crocodilo-emerald-surge") {
    return false;
  }
  if (player.skill.phase === "releasing") {
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
    player.skill.castElapsedMs += deltaMs;
    if (player.skill.channelRemainingMs <= 0) {
      finishCrocodiloEmeraldSurgeRelease(player);
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
    cancelCrocodiloEmeraldSurge(player);
    return true;
  }
  player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
  player.skill.castElapsedMs += deltaMs;
  if (player.skill.channelRemainingMs <= 0) {
    fireCrocodiloEmeraldSurge(player, context);
  }
  return true;
}

export function cancelCrocodiloEmeraldSurge(player: PlayerState): void {
  if (player.skill.id !== "crocodilo-emerald-surge") {
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

export function fireCrocodiloEmeraldSurge(player: PlayerState, context: SkillContext): void {
  if (player.skill.id !== "crocodilo-emerald-surge") {
    return;
  }
  const direction = player.skill.projectedLastMoveDirection ?? player.lastMoveDirection ?? player.direction;
  const origin = context.getTileFromPosition(player.position);
  const hitKeys = new Set<string>();
  const toxicTiles = computeCrocodiloSurgeTiles(origin, context);

  player.flameGuardMs = Math.max(player.flameGuardMs, CROCODILO_SURGE_DURATION_MS);

  for (const tile of toxicTiles) {
    const key = tileKey(tile.x, tile.y);
    hitKeys.add(key);
    context.addFlame(tile, CROCODILO_SURGE_DURATION_MS, "toxic");
    context.breakCrateAtKey(key);
    const bomb = context.bombs.find((item) => item.tile.x === tile.x && item.tile.y === tile.y);
    if (bomb) {
      bomb.fuseMs = 0;
    }
  }

  for (const id of context.activePlayerIds) {
    if (id === player.id) {
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
    context.tryAbsorbInstantHit(target, player.id);
  }

  player.direction = direction;
  player.lastMoveDirection = direction;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "releasing";
  player.skill.channelRemainingMs = CROCODILO_SKILL_RELEASE_MS;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = direction;
  context.soundManager.playOneShot("flames");
}

export function finishCrocodiloEmeraldSurgeRelease(player: PlayerState): void {
  if (player.skill.id !== "crocodilo-emerald-surge") {
    return;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.skill.phase = "cooldown";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = CROCODILO_SKILL_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

export function computeCrocodiloSurgeTiles(
  origin: TileCoord,
  context: SkillContext,
): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (const delta of Object.values(directionDelta)) {
    for (let step = 1; step <= CROCODILO_SURGE_RANGE; step += 1) {
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
      if (context.arena.breakable.has(key)) {
        break;
      }
    }
  }
  return tiles;
}

export function isCrocodiloImmuneDuringChannel(player: PlayerState): boolean {
  return player.skill.id === "crocodilo-emerald-surge" && player.skill.phase === "channeling";
}
