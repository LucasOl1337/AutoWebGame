import type {
  CharacterSkillId,
  Direction,
  PlayerId,
  PlayerState,
} from "../core/types";
import type { SkillContext } from "./characters/shared";
import { createDefaultPlayerSkillState } from "./characters/shared";
import {
  isCrocodiloImmuneDuringChannel,
  startCrocodiloEmeraldSurge,
  updateCrocodiloEmeraldSurgeChannel,
} from "./characters/crocodilo-skill";
import {
  startKillerBeeDash,
  updateKillerBeeDash,
} from "./characters/killer-bee-skill";
import {
  startNicoArcaneBeam,
  updateNicoArcaneBeamChannel,
} from "./characters/nico-skill";
import {
  startRanniIceBlink,
  updateRanniIceBlinkChannel,
  isRanniImmuneDuringChannel,
} from "./characters/ranni-skill";

export type { SkillContext } from "./characters/shared";
export {
  addMagicBeam,
  createDefaultPlayerSkillState,
  getDashDistancePx,
  hasReachedSkillTarget,
  simulateProjectedMovement,
} from "./characters/shared";
export {
  CHARACTER_SKILL_DEFINITIONS,
  getCharacterSkillDefinition,
  getCharacterSkillId,
  CROCODILO_CHARACTER_ID,
  CROCODILO_SKILL_COOLDOWN_MS,
  KILLER_BEE_CHARACTER_ID,
  KILLER_BEE_SKILL_COOLDOWN_MS,
  NICO_CHARACTER_ID,
  NICO_SKILL_COOLDOWN_MS,
  RANNI_CHARACTER_ID,
  RANNI_SKILL_COOLDOWN_MS,
} from "./characters/skill-registry";
export {
  CROCODILO_SKILL_CHANNEL_MS,
  CROCODILO_SKILL_RELEASE_MS,
  CROCODILO_SURGE_DURATION_MS,
  CROCODILO_SURGE_RANGE,
  cancelCrocodiloEmeraldSurge,
  computeCrocodiloSurgeTiles,
  fireCrocodiloEmeraldSurge,
  finishCrocodiloEmeraldSurgeRelease,
  isCrocodiloImmuneDuringChannel,
  startCrocodiloEmeraldSurge,
  updateCrocodiloEmeraldSurgeChannel,
} from "./characters/crocodilo-skill";
export {
  KILLER_BEE_DASH_DISTANCE_PX,
  KILLER_BEE_DASH_DURATION_MS,
  KILLER_BEE_DASH_FRAME_MS,
  KILLER_BEE_DASH_MIN_DURATION_MS,
  computeKillerBeeDashTarget,
  finishKillerBeeDash,
  startKillerBeeDash,
  updateKillerBeeDash,
} from "./characters/killer-bee-skill";
export {
  NICO_BEAM_CORE_WIDTH_PX,
  NICO_BEAM_DURATION_MS,
  NICO_BEAM_GLOW_WIDTH_PX,
  NICO_SKILL_CHANNEL_MS,
  NICO_SKILL_RELEASE_MS,
  cancelNicoArcaneBeam,
  collectNicoBeamTiles,
  computeNicoBeam,
  finishNicoArcaneBeamRelease,
  fireNicoArcaneBeam,
  resolveNicoBeamImpact,
  startNicoArcaneBeam,
  updateNicoArcaneBeamChannel,
} from "./characters/nico-skill";
export {
  RANNI_SKILL_CHANNEL_MS,
  finishRanniBlink,
  isRanniImmuneDuringChannel,
  startRanniIceBlink,
  updateRanniIceBlinkChannel,
} from "./characters/ranni-skill";

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
    case "crocodilo-emerald-surge":
      startCrocodiloEmeraldSurge(player, desiredDirection);
      return;
    default:
      return;
  }
}

export function updatePlayerSkillChannel(
  player: PlayerState,
  desiredDirection: Direction | null,
  skillPressed: boolean,
  skillHeld: boolean,
  deltaMs: number,
  context: SkillContext,
): boolean {
  if (player.skill.phase !== "channeling" && player.skill.phase !== "releasing") {
    return false;
  }
  switch (player.skill.id) {
    case "ranni-ice-blink":
      return updateRanniIceBlinkChannel(player, desiredDirection, skillPressed, deltaMs, context);
    case "killer-bee-wing-dash":
      return updateKillerBeeDash(player, deltaMs, context);
    case "nico-arcane-beam":
      return updateNicoArcaneBeamChannel(player, desiredDirection, skillHeld, deltaMs, context);
    case "crocodilo-emerald-surge":
      return updateCrocodiloEmeraldSurgeChannel(player, desiredDirection, skillHeld, deltaMs, context);
    default:
      return false;
  }
}

export function isPlayerImmuneDuringSkillChannel(player: PlayerState): boolean {
  switch (player.skill.id) {
    case "ranni-ice-blink":
      return isRanniImmuneDuringChannel(player);
    case "crocodilo-emerald-surge":
      return isCrocodiloImmuneDuringChannel(player);
    default:
      return false;
  }
}
