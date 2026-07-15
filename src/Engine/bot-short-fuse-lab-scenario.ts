import { tileKey } from "../Arenas/arena";
import type { PlayerState } from "../Gameplay/types";
import { BOMB_FUSE_MS, TILE_SIZE } from "../PersonalConfig/config";
import { getBotDecision, type BotContext, type BotDecision } from "./bot-ai";
import { getBotBombEscapeBudget, type BotBombEscapeBudget } from "./bot-bomb-escape-budget";

export interface BotShortFuseLabSnapshot {
  botLabel: string;
  shortFuseLevel: number;
  speedLevel: number;
  requiredEscapeSteps: number;
  budget: BotBombEscapeBudget;
  legacyFuseMs: number;
  legacyMaxEscapeSteps: number;
  referenceBeforeDecision: BotDecision;
  decision: BotDecision;
  latencyMs: number;
}

const REQUIRED_ESCAPE_STEPS = 3;

const tilePosition = (x: number, y: number) => ({
  x: x * TILE_SIZE + TILE_SIZE / 2,
  y: y * TILE_SIZE + TILE_SIZE / 2,
});

function makePlayer(
  id: 1 | 2 | 3,
  x: number,
  y: number,
  shortFuseLevel: number,
  speedLevel: number,
): PlayerState {
  return {
    id,
    active: true,
    alive: true,
    tile: { x, y },
    position: tilePosition(x, y),
    direction: "right",
    lastMoveDirection: null,
    spawnProtectionMs: 0,
    flameGuardMs: 0,
    speedLevel,
    flameRange: 2,
    activeBombs: 0,
    maxBombs: 1,
    remoteLevel: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    shortFuseLevel,
    shieldCharges: 0,
  } as PlayerState;
}

export function runBotShortFuseLabScenario(
  botId: 2 | 3,
  shortFuseLevel: number,
  speedLevel: number,
): BotShortFuseLabSnapshot {
  const width = 9;
  const height = 7;
  const openTiles = new Set([
    tileKey(3, 3), tileKey(4, 3), tileKey(5, 3), tileKey(6, 3),
  ]);
  const breakableTileKey = tileKey(3, 2);
  const solid = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = tileKey(x, y);
      if (!openTiles.has(key) && key !== breakableTileKey) solid.add(key);
    }
  }

  const bot = makePlayer(botId, 3, 3, shortFuseLevel, speedLevel);
  const enemy = makePlayer(1, 7, 5, 0, 0);
  enemy.spawnProtectionMs = 10_000;
  const context = {
    players: { 1: enemy, [botId]: bot },
    activePlayerIds: [1, botId],
    bombs: [],
    flames: [],
    arena: {
      config: { grid: { width, height } },
      solid,
      breakable: new Set([breakableTileKey]),
      powerUps: [],
    },
    suddenDeathActive: false,
    suddenDeathTickMs: 0,
    suddenDeathIndex: 0,
    suddenDeathPath: [],
    suddenDeathClosureEffects: [],
    botBombCooldownMs: 0,
    botCommittedDirection: { [botId]: null },
    botPendingReverseDirection: { [botId]: null },
    botPendingReverseFrames: { [botId]: 0 },
    canOccupyPosition: () => true,
    evaluateMovementOption: () => ({}),
    canMovementOptionAdvance: () => true,
    areOppositeDirections: () => false,
    isPlayerOverlappingTile: () => false,
  } as unknown as BotContext;

  const startedAt = performance.now();
  const decision = getBotDecision(bot, context);
  const latencyMs = performance.now() - startedAt;
  const budget = getBotBombEscapeBudget(bot);
  const legacyMaxEscapeSteps = Math.floor((BOMB_FUSE_MS - budget.reserveMs) / budget.moveDurationMs);
  const referenceBeforeDecision: BotDecision = {
    direction: null,
    placeBomb: legacyMaxEscapeSteps >= REQUIRED_ESCAPE_STEPS,
  };

  return {
    botLabel: `Bot P${botId}`,
    shortFuseLevel,
    speedLevel,
    requiredEscapeSteps: REQUIRED_ESCAPE_STEPS,
    budget,
    legacyFuseMs: BOMB_FUSE_MS,
    legacyMaxEscapeSteps,
    referenceBeforeDecision,
    decision,
    latencyMs,
  };
}
