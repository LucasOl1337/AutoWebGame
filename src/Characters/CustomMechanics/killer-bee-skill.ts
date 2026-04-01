import type {
  Direction,
  PixelCoord,
  PlayerState,
} from "../../Gameplay/types";
import { TILE_SIZE } from "../../PersonalConfig/config";
import type { SkillContext } from "../../ultimate/shared";
import { KILLER_BEE_SKILL_COOLDOWN_MS } from "../../ultimate/skill-registry";
import {
  directionDelta,
  getDashDistancePx,
  hasReachedSkillTarget,
} from "../../ultimate/shared";

export {
  KILLER_BEE_CHARACTER_ID,
  KILLER_BEE_SKILL_COOLDOWN_MS,
} from "../../ultimate/skill-registry";

export const KILLER_BEE_DASH_DISTANCE_PX = TILE_SIZE * 3;
export const KILLER_BEE_DASH_DURATION_MS = 240;
export const KILLER_BEE_DASH_MIN_DURATION_MS = 90;
export const KILLER_BEE_DASH_FRAME_MS = 60;

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

export function updateKillerBeeDash(
  player: PlayerState,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.id !== "killer-bee-wing-dash") {
    return false;
  }
  const dashDirection = player.skill.projectedLastMoveDirection ?? player.lastMoveDirection ?? player.direction;
  const target = player.skill.projectedPosition ?? player.position;
  const start = { ...player.position };
  const remainingMs = Math.max(0, player.skill.channelRemainingMs);
  const stepFraction = remainingMs <= 0 ? 1 : Math.min(1, deltaMs / remainingMs);
  const arenaPixelWidth = context.arena.config.grid.width * TILE_SIZE;
  const arenaPixelHeight = context.arena.config.grid.height * TILE_SIZE;
  const deltaX = context.getWrappedDelta(target.x, player.position.x, arenaPixelWidth);
  const deltaY = context.getWrappedDelta(target.y, player.position.y, arenaPixelHeight);
  player.position = context.normalizeArenaPosition({
    x: player.position.x + deltaX * stepFraction,
    y: player.position.y + deltaY * stepFraction,
  });
  player.velocity = {
    x: context.getWrappedDelta(player.position.x, start.x, arenaPixelWidth) / (deltaMs / 1000),
    y: context.getWrappedDelta(player.position.y, start.y, arenaPixelHeight) / (deltaMs / 1000),
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
