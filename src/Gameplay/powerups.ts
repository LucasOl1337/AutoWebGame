import {
  BOMB_FUSE_MS,
  KEY_BINDINGS,
  MAX_BOMB_PASS_LEVEL,
  MAX_BOMBS,
  MAX_KICK_LEVEL,
  MAX_RANGE,
  MAX_SHIELD_CHARGES,
  MAX_SPEED_LEVEL,
} from "../PersonalConfig/config";
import type { MenuPlayerId, PlayerState, PowerUpType } from "./types";

export type SkillPowerUpType = PowerUpType;
const MAX_SHORT_FUSE_LEVEL = 2;
const SHORT_FUSE_STEP_MS = 400;
const MIN_SHORT_FUSE_MS = 1_200;

export interface PowerUpDefinition {
  readonly type: PowerUpType;
  readonly label: string;
  readonly shortLabel: string;
  readonly tint: string;
  readonly maxLevel: number;
}

const POWER_UP_DEFINITIONS: Readonly<Record<PowerUpType, PowerUpDefinition>> = {
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
    shortLabel: "RD",
    tint: "#8cd6ff",
    maxLevel: 1,
  },
  "shield-up": {
    type: "shield-up",
    label: "Shield Charge",
    shortLabel: "SH",
    tint: "#bba7ff",
    maxLevel: MAX_SHIELD_CHARGES,
  },
  "bomb-pass-up": {
    type: "bomb-pass-up",
    label: "Bomb Pass",
    shortLabel: "BP",
    tint: "#f7a8ff",
    maxLevel: MAX_BOMB_PASS_LEVEL,
  },
  "kick-up": {
    type: "kick-up",
    label: "Bomb Kick",
    shortLabel: "BK",
    tint: "#ffbc73",
    maxLevel: MAX_KICK_LEVEL,
  },
  "short-fuse-up": {
    type: "short-fuse-up",
    label: "Short Fuse",
    shortLabel: "SF",
    tint: "#ff5eea",
    maxLevel: MAX_SHORT_FUSE_LEVEL,
  },
};

export const SKILL_POWER_UP_TYPES: readonly SkillPowerUpType[] = [
  "bomb-up",
  "flame-up",
  "speed-up",
  "remote-up",
  "shield-up",
  "bomb-pass-up",
  "kick-up",
  "short-fuse-up",
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
    case "short-fuse-up":
      return player.shortFuseLevel;
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
      player.bombPassLevel = MAX_BOMB_PASS_LEVEL;
      break;
    case "kick-up":
      player.kickLevel = MAX_KICK_LEVEL;
      break;
    case "short-fuse-up":
      player.shortFuseLevel = Math.min(MAX_SHORT_FUSE_LEVEL, player.shortFuseLevel + 1);
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
    const levelsAfterFirst = Math.max(0, player.maxBombs - 1);
    return 300 + 160 / (2 ** levelsAfterFirst);
  }
  if (type === "flame-up") {
    if (player.flameRange >= MAX_RANGE) {
      return 0;
    }
    if (player.flameRange === 1) {
      return 460;
    }
    if (player.flameRange === 2) {
      return 340;
    }
    return 260 + 40 / 2 ** (player.flameRange - 3);
  }
  if (type === "remote-up") {
    if (player.remoteLevel >= 1) {
      return 0;
    }
    // O controle de detonação vence por um ponto o primeiro Short Fuse: oferece a mesma pressão
    // ofensiva sem reduzir permanentemente a janela de fuga do bot.
    return 261;
  }
  if (type === "shield-up") {
    if (player.shieldCharges >= MAX_SHIELD_CHARGES) {
      return 0;
    }
    // A bot sem proteção deve priorizar a sobrevivência antes de upgrades ofensivos.
    if (player.shieldCharges === 0) {
      return 500;
    }
    // Após a primeira carga, a segunda ainda preserva metade do valor inicial.
    return 250;
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
    // Antes de obter passagem por bombas, o chute vence Bomb Pass pela margem mínima de um ponto.
    return player.bombPassLevel === 0 ? 241 : 180;
  }
  if (type === "short-fuse-up") {
    if (player.shortFuseLevel >= MAX_SHORT_FUSE_LEVEL) {
      return 0;
    }
    return player.shortFuseLevel === 0 ? 260 : 150;
  }
  if (player.speedLevel >= MAX_SPEED_LEVEL) {
    return 0;
  }
  if (player.speedLevel === 0) {
    return 461;
  }
  // Depois do ganho inicial, cada nível adicional retém metade do bônus estratégico anterior.
  return 120 + 120 / 2 ** (player.speedLevel - 1);
}

export function getBombFuseMsForPlayer(player: PlayerState): number {
  return Math.max(
    MIN_SHORT_FUSE_MS,
    BOMB_FUSE_MS - player.shortFuseLevel * SHORT_FUSE_STEP_MS,
  );
}

export function formatBombFuseSeconds(player: PlayerState): string {
  return `${(getBombFuseMsForPlayer(player) / 1000).toFixed(2)}s`;
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
