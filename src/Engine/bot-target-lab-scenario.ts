import { TILE_SIZE } from "../PersonalConfig/config";
import type { PlayerId, PlayerState } from "../Gameplay/types";
import {
  getBotDecision,
  getBotTargetSelectionSignal,
  type BotContext,
  type BotDecision,
} from "./bot-ai";
import type { BotTargetCandidateSignal, BotTargetSelectionSignal } from "./bot-target-selection";

const SAMPLES = 100;

function createPlayer(id: PlayerId, x: number, y: number, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: `P${id}`,
    active: true,
    alive: true,
    tile: { x, y },
    position: { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 },
    velocity: { x: 0, y: 0 },
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
    ...overrides,
  };
}

export function createBotTargetLabFixture(): { bot: PlayerState; context: BotContext } {
  const bot = createPlayer(2, 5, 5, { maxBombs: 0 });
  const closeShielded = createPlayer(1, 3, 5, { shieldCharges: 1 });
  const exposedReloading = createPlayer(3, 8, 5, { activeBombs: 1, maxBombs: 1 });
  const context = {
    players: { 1: closeShielded, 2: bot, 3: exposedReloading },
    activePlayerIds: [2, 1, 3],
    bombs: [{ id: 31, ownerId: 3, tile: { x: 9, y: 9 }, fuseMs: 1_800, ownerCanPass: false, flameRange: 1 }],
    flames: [],
    arena: {
      config: { grid: { width: 11, height: 11 } },
      solid: new Set<string>(),
      breakable: new Set<string>(),
      powerUps: [],
    },
    suddenDeathActive: false,
    suddenDeathTickMs: 0,
    suddenDeathIndex: 0,
    suddenDeathPath: [],
    suddenDeathClosureEffects: [],
    botBombCooldownMs: 0,
    botCommittedDirection: { 1: null, 2: null, 3: null, 4: null },
    botPendingReverseDirection: { 1: null, 2: null, 3: null, 4: null },
    botPendingReverseFrames: { 1: 0, 2: 0, 3: 0, 4: 0 },
    canOccupyPosition: () => true,
    evaluateMovementOption: (_player: PlayerState, direction: string) => ({ direction }),
    canMovementOptionAdvance: () => true,
    areOppositeDirections: () => false,
    isPlayerOverlappingTile: () => false,
  };
  return { bot, context: context as unknown as BotContext };
}

function getLegacyNearestTarget(bot: PlayerState, context: BotContext): PlayerId | null {
  let selected: PlayerState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of context.activePlayerIds) {
    const candidate = context.players[id];
    if (id === bot.id || !candidate.active || !candidate.alive) continue;
    const distance = Math.abs(bot.tile.x - candidate.tile.x) + Math.abs(bot.tile.y - candidate.tile.y);
    const score = distance + (candidate.spawnProtectionMs > 0 ? 1_000 : 0);
    if (score < bestScore) {
      bestScore = score;
      selected = candidate;
    }
  }
  return selected?.id ?? null;
}

function percentile(samples: number[], ratio: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

export interface BotTargetLabScenario {
  samples: number;
  legacyTargetCounts: Record<string, number>;
  selectedTargetCounts: Record<string, number>;
  directionCounts: Record<string, number>;
  signal: BotTargetSelectionSignal;
  selected: BotTargetCandidateSignal;
  decision: BotDecision;
  medianDecisionMs: number;
  p95DecisionMs: number;
}

export function runBotTargetLabScenario(): BotTargetLabScenario {
  const { bot, context } = createBotTargetLabFixture();
  const legacyTargetCounts: Record<string, number> = {};
  const selectedTargetCounts: Record<string, number> = {};
  const directionCounts: Record<string, number> = {};
  const timings: number[] = [];
  let signal = getBotTargetSelectionSignal(bot, context);
  let decision = getBotDecision(bot, context);

  for (let index = 0; index < SAMPLES; index += 1) {
    const legacyId = getLegacyNearestTarget(bot, context);
    legacyTargetCounts[`P${legacyId ?? "?"}`] = (legacyTargetCounts[`P${legacyId ?? "?"}`] ?? 0) + 1;
    const startedAt = performance.now();
    signal = getBotTargetSelectionSignal(bot, context);
    decision = getBotDecision(bot, context);
    timings.push(performance.now() - startedAt);
    const targetLabel = `P${signal.selected?.targetId ?? "?"}`;
    selectedTargetCounts[targetLabel] = (selectedTargetCounts[targetLabel] ?? 0) + 1;
    const direction = decision.direction ?? "hold";
    directionCounts[direction] = (directionCounts[direction] ?? 0) + 1;
  }

  if (!signal.selected) throw new Error("cenário de alvo sem candidato selecionado");
  return {
    samples: SAMPLES,
    legacyTargetCounts,
    selectedTargetCounts,
    directionCounts,
    signal,
    selected: signal.selected,
    decision,
    medianDecisionMs: percentile(timings, 0.5),
    p95DecisionMs: percentile(timings, 0.95),
  };
}
