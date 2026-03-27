import {
  KEY_BINDINGS,
  MAX_BOMBS,
  MAX_BOMB_PASS_LEVEL,
  MAX_KICK_LEVEL,
  MAX_RANGE,
  MAX_SHIELD_CHARGES,
  MAX_SPEED_LEVEL,
} from "./config";
import type { MenuPlayerId, PlayerState, PowerUpType } from "./types";

export type SkillPowerUpType = "remote-up" | "shield-up" | "bomb-pass-up" | "kick-up";

export interface PowerUpDefinition {
  type: PowerUpType;
  label: string;
  shortLabel: string;
  tint: string;
  maxLevel: number;
}

const POWER_UP_DEFINITIONS: Record<PowerUpType, PowerUpDefinition> = {
  "bomb-up": {
    type: "bomb-up",
    label: "Bomb Capacity",
    shortLabel: "B",
    tint: "#f4d35e",
    maxLevel: MAX_BOMBS,
  },
  "flame-up": {
    type: "flame-up",
    label: "Flame Range",
    shortLabel: "F",
    tint: "#ff7d66",
    maxLevel: MAX_RANGE,
  },
  "speed-up": {
    type: "speed-up",
    label: "Move Speed",
    shortLabel: "S",
    tint: "#7cffb2",
    maxLevel: MAX_SPEED_LEVEL,
  },
  "remote-up": {
    type: "remote-up",
    label: "Remote Detonation",
    shortLabel: "R",
    tint: "#8cd6ff",
    maxLevel: 1,
  },
  "shield-up": {
    type: "shield-up",
    label: "Shield Charge",
    shortLabel: "H",
    tint: "#a98bff",
    maxLevel: MAX_SHIELD_CHARGES,
  },
  "bomb-pass-up": {
    type: "bomb-pass-up",
    label: "Bomb Pass",
    shortLabel: "P",
    tint: "#75f0ff",
    maxLevel: MAX_BOMB_PASS_LEVEL,
  },
  "kick-up": {
    type: "kick-up",
    label: "Bomb Kick",
    shortLabel: "K",
    tint: "#ffb46b",
    maxLevel: MAX_KICK_LEVEL,
  },
};

export const SKILL_POWER_UP_TYPES: readonly SkillPowerUpType[] = [
  "remote-up",
  "shield-up",
  "bomb-pass-up",
  "kick-up",
];

const CODE_TO_LABEL: Record<string, string> = {
  ArrowUp: "UP",
  ArrowDown: "DN",
  ArrowLeft: "LT",
  ArrowRight: "RT",
  Space: "SPC",
  Enter: "ENT",
  Escape: "ESC",
};

export function getPowerUpDefinition(type: PowerUpType): PowerUpDefinition {
  return POWER_UP_DEFINITIONS[type];
}

export function getPowerUpLevel(player: PlayerState, type: PowerUpType): number {
  switch (type) {
    case "bomb-up":
      return player.maxBombs;
    case "flame-up":
      return player.flameRange;
    case "speed-up":
      return player.speedLevel;
    case "remote-up":
      return player.remoteLevel;
    case "shield-up":
      return player.shieldCharges;
    case "bomb-pass-up":
      return player.bombPassLevel;
    case "kick-up":
      return player.kickLevel;
    default: {
      const neverType: never = type;
      return neverType;
    }
  }
}

export function isPowerUpMaxed(player: PlayerState, type: PowerUpType): boolean {
  return getPowerUpLevel(player, type) >= getPowerUpDefinition(type).maxLevel;
}

export function applyPowerUpToPlayer(player: PlayerState, type: PowerUpType): void {
  switch (type) {
    case "bomb-up":
      player.maxBombs = Math.min(MAX_BOMBS, player.maxBombs + 1);
      break;
    case "flame-up":
      player.flameRange = Math.min(MAX_RANGE, player.flameRange + 1);
      break;
    case "speed-up":
      player.speedLevel = Math.min(MAX_SPEED_LEVEL, player.speedLevel + 1);
      break;
    case "remote-up":
      player.remoteLevel = 1;
      break;
    case "shield-up":
      player.shieldCharges = Math.min(MAX_SHIELD_CHARGES, player.shieldCharges + 1);
      break;
    case "bomb-pass-up":
      player.bombPassLevel = Math.min(MAX_BOMB_PASS_LEVEL, player.bombPassLevel + 1);
      break;
    case "kick-up":
      player.kickLevel = Math.min(MAX_KICK_LEVEL, player.kickLevel + 1);
      break;
    default: {
      const neverType: never = type;
      throw new Error(`Unsupported power-up type: ${neverType as string}`);
    }
  }
}

export function getPowerUpPriorityScore(player: PlayerState, type: PowerUpType): number {
  if (type === "bomb-up") {
    if (player.maxBombs >= MAX_BOMBS) {
      return 0;
    }
    return 300 + (MAX_BOMBS - player.maxBombs) * 40;
  }
  if (type === "flame-up") {
    if (player.flameRange >= MAX_RANGE) {
      return 0;
    }
    return 260 + (MAX_RANGE - player.flameRange) * 40;
  }
  if (type === "remote-up") {
    if (player.remoteLevel >= 1) {
      return 0;
    }
    return 220;
  }
  if (type === "bomb-pass-up") {
    if (player.bombPassLevel >= MAX_BOMB_PASS_LEVEL) {
      return 0;
    }
    return 240;
  }
  if (type === "kick-up") {
    if (player.kickLevel >= MAX_KICK_LEVEL) {
      return 0;
    }
    return 230;
  }
  if (type === "shield-up") {
    if (player.shieldCharges >= MAX_SHIELD_CHARGES) {
      return 0;
    }
    return 200 + (MAX_SHIELD_CHARGES - player.shieldCharges) * 30;
  }
  if (player.speedLevel >= MAX_SPEED_LEVEL) {
    return 0;
  }
  return 120 + (MAX_SPEED_LEVEL - player.speedLevel) * 25;
}

export function formatControlKey(code: string): string {
  if (code.startsWith("Key")) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  return CODE_TO_LABEL[code] ?? code.toUpperCase();
}

export function getDetonateKeyLabel(playerId: MenuPlayerId): string {
  return formatControlKey(KEY_BINDINGS[playerId].detonate);
}
