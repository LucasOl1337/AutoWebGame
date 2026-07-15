import { getBombFuseMsForPlayer, getPowerUpPriorityScore } from "../Gameplay/powerups";
import type { PlayerState } from "../Gameplay/types";

const SAMPLES = 100;
const REFERENCE_REMOTE_SCORE = 251;

export interface BotRemoteControlLabScenario {
  botLabel: string;
  controller: string;
  samples: number;
  currentScores: {
    remote: number;
    shortFuse: number;
  };
  referenceCounts: {
    remote: number;
    shortFuse: number;
  };
  currentCounts: {
    remote: number;
    shortFuse: number;
  };
  currentFuseMs: number;
  shortFuseCandidateFuseMs: number;
  escapeWindowPreservedMs: number;
  medianComparatorMs: number;
  p95ComparatorMs: number;
  intent: string;
  reason: string;
}

function createLabPlayer(): PlayerState {
  return {
    id: 2,
    name: "P2",
    active: true,
    tile: { x: 4, y: 4 },
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    alive: true,
    direction: "down",
    lastMoveDirection: null,
    maxBombs: 1,
    activeBombs: 0,
    flameRange: 1,
    speedLevel: 0,
    remoteLevel: 0,
    shieldCharges: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    shortFuseLevel: 0,
    flameGuardMs: 0,
    spawnProtectionMs: 0,
    skill: {
      id: null,
      phase: "idle",
      channelRemainingMs: 0,
      cooldownRemainingMs: 0,
      castElapsedMs: 0,
      projectedPosition: null,
      projectedLastMoveDirection: null,
    },
  };
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

export function runBotRemoteControlLabScenario(): BotRemoteControlLabScenario {
  const player = createLabPlayer();
  const currentScores = {
    remote: getPowerUpPriorityScore(player, "remote-up"),
    shortFuse: getPowerUpPriorityScore(player, "short-fuse-up"),
  };
  const referenceCounts = { remote: 0, shortFuse: 0 };
  const currentCounts = { remote: 0, shortFuse: 0 };
  const timings: number[] = [];

  for (let index = 0; index < SAMPLES; index += 1) {
    if (REFERENCE_REMOTE_SCORE > currentScores.shortFuse) referenceCounts.remote += 1;
    else referenceCounts.shortFuse += 1;

    const startedAt = performance.now();
    const remoteScore = getPowerUpPriorityScore(player, "remote-up");
    const shortFuseScore = getPowerUpPriorityScore(player, "short-fuse-up");
    timings.push(performance.now() - startedAt);
    if (remoteScore > shortFuseScore) currentCounts.remote += 1;
    else currentCounts.shortFuse += 1;
  }

  const currentFuseMs = getBombFuseMsForPlayer(player);
  const shortFuseCandidateFuseMs = getBombFuseMsForPlayer({ ...player, shortFuseLevel: 1 });
  return {
    botLabel: "P2",
    controller: "IA DETERMINÍSTICA LOCAL",
    samples: SAMPLES,
    currentScores,
    referenceCounts,
    currentCounts,
    currentFuseMs,
    shortFuseCandidateFuseMs,
    escapeWindowPreservedMs: currentFuseMs - shortFuseCandidateFuseMs,
    medianComparatorMs: percentile(timings, 0.5),
    p95ComparatorMs: percentile(timings, 0.95),
    intent: "COLETAR DETONAÇÃO REMOTA",
    reason: "controle manual da explosão mantém pressão ofensiva sem encurtar a janela de fuga",
  };
}
