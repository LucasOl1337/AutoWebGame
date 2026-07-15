import type {
  Direction,
  PlayerState,
} from "../../Gameplay/types";
import type { SkillContext } from "../../ultimate/shared";
import { RANNI_SKILL_COOLDOWN_MS } from "../../ultimate/skill-registry";
import { simulateProjectedMovement } from "../../ultimate/shared";

export {
  RANNI_CHARACTER_ID,
  RANNI_SKILL_COOLDOWN_MS,
} from "../../ultimate/skill-registry";

export const RANNI_SKILL_CHANNEL_MS = 1_500;
export const RANNI_NO_DISPLACEMENT_COOLDOWN_MS = 300;

export function startRanniIceBlink(player: PlayerState): void {
  player.skill.phase = "channeling";
  player.skill.channelRemainingMs = RANNI_SKILL_CHANNEL_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = { ...player.position };
  player.skill.projectedLastMoveDirection = player.lastMoveDirection;
  player.velocity.x = 0;
  player.velocity.y = 0;
}

export function updateRanniIceBlinkChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillPressed: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.id !== "ranni-ice-blink") {
    return false;
  }
  player.velocity.x = 0;
  player.velocity.y = 0;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return true;
  }
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

export function finishRanniBlink(player: PlayerState, context: SkillContext): void {
  if (player.skill.id !== "ranni-ice-blink") {
    return;
  }
  const target = player.skill.projectedPosition ?? player.position;
  const projectedDisplacement = target.x !== player.position.x || target.y !== player.position.y;
  const canMoveToTarget = context.canOccupyPosition(player, target);
  const moved = canMoveToTarget && projectedDisplacement;
  if (canMoveToTarget) {
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
  player.skill.cooldownRemainingMs = moved || projectedDisplacement
    ? RANNI_SKILL_COOLDOWN_MS
    : RANNI_NO_DISPLACEMENT_COOLDOWN_MS;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

export function isRanniImmuneDuringChannel(player: PlayerState): boolean {
  return player.skill.id === "ranni-ice-blink" && player.skill.phase === "channeling";
}
