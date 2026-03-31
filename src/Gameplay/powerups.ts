import {
  KEY_BINDINGS,
  MAX_BOMBS,
  MAX_RANGE,
  MAX_SPEED_LEVEL,
} from "../PersonalConfig/config";
import type { MenuPlayerId, PlayerState, PowerUpType } from "./types";

export type SkillPowerUpType = PowerUpType;

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
};

export const SKILL_POWER_UP_TYPES: readonly SkillPowerUpType[] = [
  "bomb-up",
  "flame-up",
  "speed-up",
  "remote-up",
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
