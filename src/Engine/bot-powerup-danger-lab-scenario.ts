import { TILE_SIZE } from "../PersonalConfig/config";
import type { Direction, PlayerId, PlayerState, TileCoord } from "../Gameplay/types";
import {
  getBotDecision,
  getBotPowerUpEscapeRouteSignalForTile,
  type BotContext,
  type BotDecision,
} from "./bot-ai";
import type { BotPowerUpEscapeRouteSignal } from "./bot-powerup-pursuit";

const tile = (x: number, y: number): TileCoord => ({ x, y });
const position = (x: number, y: number) => ({
  x: x * TILE_SIZE + TILE_SIZE / 2,
  y: y * TILE_SIZE + TILE_SIZE / 2,
});

function createPlayer(id: PlayerId, x: number, y: number): PlayerState {
  return {
    id,
    name: `Player ${id}`,
    active: true,
    alive: true,
    tile: tile(x, y),
    position: position(x, y),
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
  };
}

function createContext(): { bot: PlayerState; context: BotContext } {
  const bot = createPlayer(2, 3, 3);
  const enemy = createPlayer(1, 8, 7);
  enemy.spawnProtectionMs = 2_000;
  const context = {
    players: { 1: enemy, 2: bot },
    activePlayerIds: [1, 2],
    bombs: [{
      id: 910,
      ownerId: 1,
      tile: tile(1, 3),
      fuseMs: 1_000,
      ownerCanPass: false,
      flameRange: 2,
    }],
    flames: [],
    arena: {
      config: { grid: { width: 11, height: 9 } },
      solid: new Set<string>(),
      breakable: new Set<string>(),
      powerUps: [{
        type: "shield-up",
        tile: tile(3, 4),
        revealed: true,
        collected: false,
      }],
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
    evaluateMovementOption: () => ({}),
    canMovementOptionAdvance: () => true,
    areOppositeDirections: () => false,
    isPlayerOverlappingTile: () => false,
  } as unknown as BotContext;
  return { bot, context };
}

export interface BotPowerUpDangerLabResult {
  samples: number;
  decision: BotDecision;
  emptyRouteCount: number;
  pickupRouteCount: number;
  legacyEmptyRouteCount: number;
  legacyPickupRouteCount: number;
  medianDecisionMs: number;
  p95DecisionMs: number;
  pickupRouteSignal: BotPowerUpEscapeRouteSignal;
  emptyRouteSignal: BotPowerUpEscapeRouteSignal;
}

function getLegacyPowerUpBlindEscapeDecision(bot: PlayerState, context: BotContext): BotDecision {
  const directions: Array<{ direction: Direction; tile: TileCoord }> = [
    { direction: "up", tile: tile(3, 2) },
    { direction: "down", tile: tile(3, 4) },
    { direction: "left", tile: tile(2, 3) },
    { direction: "right", tile: tile(4, 3) },
  ];
  const firstSafe = directions.find(({ tile: candidateTile }) => (
    getBotPowerUpEscapeRouteSignalForTile(bot, candidateTile, context).safeNeighborCount >= 1
  ));
  return { direction: firstSafe?.direction ?? null, placeBomb: false };
}

export function runBotPowerUpDangerLabScenario(samples = 100): BotPowerUpDangerLabResult {
  const decisions: BotDecision[] = [];
  const legacyDecisions: BotDecision[] = [];
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const { bot, context } = createContext();
    const startedAt = performance.now();
    decisions.push(getBotDecision(bot, context));
    durations.push(performance.now() - startedAt);
    const legacyFixture = createContext();
    legacyDecisions.push(getLegacyPowerUpBlindEscapeDecision(legacyFixture.bot, legacyFixture.context));
  }
  durations.sort((a, b) => a - b);
  const medianIndex = Math.max(0, Math.floor((durations.length - 1) * 0.5));
  const p95Index = Math.max(0, Math.floor((durations.length - 1) * 0.95));
  const signalFixture = createContext();
  const emptyRouteSignal = getBotPowerUpEscapeRouteSignalForTile(
    signalFixture.bot,
    tile(3, 2),
    signalFixture.context,
  );
  const pickupRouteSignal = getBotPowerUpEscapeRouteSignalForTile(
    signalFixture.bot,
    tile(3, 4),
    signalFixture.context,
  );

  return {
    samples,
    decision: decisions[0] ?? { direction: null, placeBomb: false },
    emptyRouteCount: decisions.filter((decision) => decision.direction === "up").length,
    pickupRouteCount: decisions.filter((decision) => decision.direction === "down").length,
    legacyEmptyRouteCount: legacyDecisions.filter((decision) => decision.direction === "up").length,
    legacyPickupRouteCount: legacyDecisions.filter((decision) => decision.direction === "down").length,
    medianDecisionMs: durations[medianIndex] ?? 0,
    p95DecisionMs: durations[p95Index] ?? 0,
    emptyRouteSignal,
    pickupRouteSignal,
  };
}
