import {
  BASE_MOVE_MS,
  MIN_MOVE_MS,
  SPEED_STEP_MS,
  TILE_SIZE,
} from "../PersonalConfig/config";
import type {
  ArenaState,
  BombState,
  Direction,
  FlameState,
  PixelCoord,
  PlayerId,
  PlayerState,
  TileCoord,
} from "../Gameplay/types";
import { tileKey } from "../Arenas/arena";
import { getPowerUpPriorityScore, isPowerUpMaxed } from "../Gameplay/powerups";
import {
  buildDangerMap,
  getBombBlastKeys as projectBombBlastKeys,
  type ProjectedBomb,
} from "./danger-map";
import { getBotDirectionStabilitySignal } from "./bot-direction-stability";
import { getSuddenDeathPressureSignal } from "./bot-sudden-death-pressure";
import { getBotBombEscapeBudget } from "./bot-bomb-escape-budget";
import {
  getBotPowerUpEscapeRouteSignal,
  type BotPowerUpEscapeRouteSignal,
} from "./bot-powerup-pursuit";
import {
  selectBotTarget,
  type BotTargetCandidateInput,
  type BotTargetSelectionSignal,
} from "./bot-target-selection";

// Bot-specific constants
const BOT_DANGER_ARRIVAL_BUFFER_MS = 140;
const BOT_SCAN_BASE_RADIUS = 7;
const BOT_SCAN_MAX_RADIUS = 9;
const BOT_SUDDEN_DEATH_LOOKAHEAD_MS = 2100;
const BOT_STRATEGIC_MOVE_WINDOW_STEPS = 2;
const BOT_PREEMPTIVE_ESCAPE_STEPS = 4;
const BOT_DIRECTION_CONFIRM_FRAMES = 2;

// Direction delta mapping
const directionDelta: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * BotDecision represents the action a bot should take
 */
export interface BotDecision {
  direction: Direction | null;
  placeBomb: boolean;
  detonate?: boolean;
  useSkill?: boolean;
  skillHeld?: boolean;
  skillAction?: "start" | "hold" | "release" | "none";
  requestId?: number;
  microActionIndex?: number;
  targetId?: PlayerId;
  intent?: "remote-detonation" | "bomb-attack" | "attack-position" | "chase-enemy";
}

/**
 * BotContext provides all the game state information that bot AI needs
 */
export interface BotContext {
  players: Record<PlayerId, PlayerState>;
  activePlayerIds: PlayerId[];
  bombs: BombState[];
  flames: FlameState[];
  arena: ArenaState;
  suddenDeathActive: boolean;
  suddenDeathTickMs: number;
  suddenDeathIndex: number;
  suddenDeathPath: TileCoord[];
  suddenDeathClosureEffects: Array<{ tile: TileCoord; elapsedMs: number; impacted: boolean }>;
  botBombCooldownMs: number;
  botCommittedDirection: Record<PlayerId, Direction | null>;
  botPendingReverseDirection: Record<PlayerId, Direction | null>;
  botPendingReverseFrames: Record<PlayerId, number>;
  dangerMap?: Map<string, number>;
  // Callback functions for complex GameApp operations
  canOccupyPosition: (position: PixelCoord, tile: TileCoord) => boolean;
  evaluateMovementOption: (player: PlayerState, direction: Direction, deltaMs: number) => any;
  canMovementOptionAdvance: (position: PixelCoord, movementOption: any) => boolean;
  areOppositeDirections: (a: Direction, b: Direction) => boolean;
  isPlayerOverlappingTile: (player: PlayerState, tile: TileCoord) => boolean;
}

/**
 * Utility: Get tile coordinates from a pixel position
 */
function getTileFromPosition(position: PixelCoord): TileCoord {
  return {
    x: Math.floor(position.x / TILE_SIZE),
    y: Math.floor(position.y / TILE_SIZE),
  };
}

/**
 * Utility: Get Manhattan distance between two tiles
 */
function getTileDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getBotTargetSelectionSignal(
  player: PlayerState,
  context: BotContext,
  dangerMap = resolveDangerMap(context),
): BotTargetSelectionSignal {
  const playerTile = getTileFromPosition(player.position);
  const candidates: BotTargetCandidateInput[] = [];
  for (const playerId of context.activePlayerIds) {
    if (playerId === player.id) {
      continue;
    }
    const candidate = context.players[playerId];
    if (!candidate.active || !candidate.alive) {
      continue;
    }
    const ownedBombCommitment = getOwnedBombCommitment(candidate.id, context, dangerMap);
    candidates.push({
      targetId: candidate.id,
      distanceSteps: getTileDistance(playerTile, candidate.tile),
      openEscapeRoutes: countTargetEscapeRoutes(candidate, context),
      spawnProtectionMs: candidate.spawnProtectionMs,
      flameGuardMs: candidate.flameGuardMs,
      shieldCharges: candidate.shieldCharges,
      activeBombs: ownedBombCommitment.count,
      maxBombs: candidate.maxBombs,
      remoteLevel: candidate.remoteLevel,
      soonestOwnedBombFuseMs: ownedBombCommitment.soonestFuseMs,
    });
  }

  return selectBotTarget(candidates);
}

function getPriorityEnemy(
  player: PlayerState,
  context: BotContext,
  dangerMap: Map<string, number>,
): PlayerState | null {
  const selectedId = getBotTargetSelectionSignal(player, context, dangerMap).selected?.targetId;
  return selectedId === undefined ? null : context.players[selectedId];
}

/**
 * Main bot decision logic
 */
export function getBotDecision(player: PlayerState, context: BotContext): BotDecision {
  const playerTile = getTileFromPosition(player.position);
  const dangerMap = resolveDangerMap(context);
  const enemy = getPriorityEnemy(player, context, dangerMap);
  const moveDuration = getMoveDuration(player);
  const strategicSafetyWindowMs = moveDuration * BOT_STRATEGIC_MOVE_WINDOW_STEPS + BOT_DANGER_ARRIVAL_BUFFER_MS;
  const overlappingBomb = getOverlappingBomb(player, context);

  if (overlappingBomb) {
    const overlappingBlast = getBombBlastKeys(overlappingBomb.tile, overlappingBomb.flameRange, context);
    const committedEscape = findDirectionToNearestTile(
      player,
      (tile) => (
        !overlappingBlast.has(tileKey(tile.x, tile.y))
        && countSafeNeighbors(player, tile, dangerMap, context) >= 1
      ),
      dangerMap,
      context,
    );
    const fallbackEscape = findDirectionToNearestTile(
      player,
      (tile) => !overlappingBlast.has(tileKey(tile.x, tile.y)),
      dangerMap,
      context,
    );
    if (committedEscape || fallbackEscape) {
      return {
        direction: committedEscape ?? fallbackEscape,
        placeBomb: false,
      };
    }
  }

  const threateningOwnedBomb = getThreateningOwnedBomb(player, playerTile, context);
  if (threateningOwnedBomb) {
    const ownBlastKeys = getBombBlastKeys(threateningOwnedBomb.tile, threateningOwnedBomb.flameRange, context);
    const committedEscape = findDirectionToNearestTile(
      player,
      (tile) => (
        !ownBlastKeys.has(tileKey(tile.x, tile.y))
        && countSafeNeighbors(player, tile, dangerMap, context) >= 1
      ),
      dangerMap,
      context,
      moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS,
    );
    const fallbackEscape = findDirectionToNearestTile(
      player,
      (tile) => !ownBlastKeys.has(tileKey(tile.x, tile.y)),
      dangerMap,
      context,
    );
    if (committedEscape || fallbackEscape) {
      return {
        direction: committedEscape ?? fallbackEscape,
        placeBomb: false,
      };
    }
  }

  const playerTileKey = tileKey(playerTile.x, playerTile.y);
  const currentDangerMs = dangerMap.get(playerTileKey);
  const preemptiveDangerMs = moveDuration * BOT_PREEMPTIVE_ESCAPE_STEPS + BOT_DANGER_ARRIVAL_BUFFER_MS;
  const shouldPreemptivelyEscape = currentDangerMs !== undefined && currentDangerMs <= preemptiveDangerMs;
  const escapeRouteScoreCache = new Map<string, number>();
  const escapeRouteScore = (tile: TileCoord): number => {
    const key = tileKey(tile.x, tile.y);
    const cached = escapeRouteScoreCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const score = getEscapeRouteScore(
      player,
      playerTile,
      tile,
      currentDangerMs ?? null,
      dangerMap,
      context,
    );
    escapeRouteScoreCache.set(key, score);
    return score;
  };
  if (shouldPreemptivelyEscape) {
    const plannedEscape = findDirectionToNearestTile(
      player,
      (tile) => countSafeNeighbors(player, tile, dangerMap, context) >= 1,
      dangerMap,
      context,
      strategicSafetyWindowMs,
      escapeRouteScore,
    );
    const immediateEscape = findDirectionToNearestTile(
      player,
      (tile) => isTileSafeForArrival(dangerMap, tile, getMoveDuration(player)),
      dangerMap,
      context,
      BOT_DANGER_ARRIVAL_BUFFER_MS,
      escapeRouteScore,
    );
    if (plannedEscape || immediateEscape) {
      return {
        direction: plannedEscape ?? immediateEscape,
        placeBomb: false,
      };
    }
  }
  const nowDanger = currentDangerMs !== undefined && currentDangerMs <= moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS;

  if (nowDanger) {
    const prioritizedEscape = findDirectionToNearestTile(
      player,
      (tile) => countSafeNeighbors(player, tile, dangerMap, context) >= 1,
      dangerMap,
      context,
      BOT_DANGER_ARRIVAL_BUFFER_MS,
      escapeRouteScore,
    );
    const fallbackEscape = findDirectionToNearestTile(
      player,
      (tile) => isTileSafeForArrival(dangerMap, tile, getMoveDuration(player)),
      dangerMap,
      context,
      BOT_DANGER_ARRIVAL_BUFFER_MS,
      escapeRouteScore,
    );
    return {
      direction: prioritizedEscape ?? fallbackEscape,
      placeBomb: false,
    };
  }

  const suddenDeathDirection = getSuddenDeathPressureDirection(player, dangerMap, context);
  if (suddenDeathDirection) {
    return { direction: suddenDeathDirection, placeBomb: false };
  }

  const safeKickDirection = getSafeDeterministicKickDirection(player, playerTile, dangerMap, context);
  if (safeKickDirection) {
    return { direction: safeKickDirection, placeBomb: false };
  }

  const enemyVulnerable = Boolean(
    enemy
    && (enemy.spawnProtectionMs ?? 0) <= 0
    && (enemy.flameGuardMs ?? 0) <= 0
  );
  const openingProtected = player.spawnProtectionMs > 0;
  const remoteDetonationBomb = enemy
    ? getRemoteDetonationBomb(player, enemy, enemyVulnerable, context)
    : null;
  if (remoteDetonationBomb) {
    return { direction: null, placeBomb: false, detonate: true, targetId: enemy?.id, intent: "remote-detonation" };
  }
  const adjacentEnemy = Boolean(enemy && enemyVulnerable && getTileDistance(playerTile, enemy.tile) <= 1);
  const enemyInBombLine = Boolean(
    enemy
    && enemyVulnerable
    && canBombReachTile(playerTile, enemy.tile, player.flameRange, context),
  );
  const adjacentBreakable = hasAdjacentBreakable(playerTile, context);
  const ownedBombAlreadyCoversEnemy = Boolean(
    enemy
    && enemyVulnerable
    && context.bombs.some((bomb) => (
      bomb.ownerId === player.id
      && getBombBlastKeys(bomb.tile, bomb.flameRange, context).has(tileKey(enemy.tile.x, enemy.tile.y))
    )),
  );
  const shouldDropBomb = !openingProtected
    && (adjacentBreakable || (!ownedBombAlreadyCoversEnemy && (adjacentEnemy || enemyInBombLine)))
    && canBotPlaceBomb(player, context);
  if (shouldDropBomb) {
    const enemyAttack = !adjacentBreakable && enemy && (adjacentEnemy || enemyInBombLine);
    return {
      direction: null,
      placeBomb: true,
      targetId: enemyAttack ? enemy.id : undefined,
      intent: enemyAttack ? "bomb-attack" : undefined,
    };
  }

  const revengeAttackPositionTarget = isRevengeWindowActive(player)
    ? findEnemyBombLineDirection(player, enemy, enemyVulnerable, strategicSafetyWindowMs, context)
    : null;
  if (revengeAttackPositionTarget) {
    return { direction: revengeAttackPositionTarget, placeBomb: false, targetId: enemy?.id, intent: "attack-position" };
  }

  const powerUpTarget = findValuablePowerUpDirection(player, strategicSafetyWindowMs, context);
  if (powerUpTarget) {
    return { direction: powerUpTarget, placeBomb: false };
  }

  const attackPositionTarget = findEnemyBombLineDirection(player, enemy, enemyVulnerable, strategicSafetyWindowMs, context);
  if (attackPositionTarget) {
    return { direction: attackPositionTarget, placeBomb: false, targetId: enemy?.id, intent: "attack-position" };
  }

  const breakableTarget = findNearestReachableTarget(
    player,
    (tile) => hasAdjacentBreakable(tile, context) && canBotPlaceBombAtTile(player, tile, false, context),
    strategicSafetyWindowMs,
    context,
    (tile) => hasAdjacentBreakableWithValuablePrecomputedPowerUp(player, tile, context) ? 1 : 0,
  );
  if (breakableTarget) {
    return { direction: breakableTarget, placeBomb: false };
  }

  const chaseEnemy = enemy && enemyVulnerable
    ? findDirectionToNearestTile(
      player,
      (tile) => getTileDistance(tile, enemy.tile) <= 1,
      undefined,
      context,
      strategicSafetyWindowMs,
    )
    : null;
  const patrolDirection = getPatrolDirection(player, dangerMap, moveDuration, context);
  if (chaseEnemy || patrolDirection) {
    return {
      direction: chaseEnemy ?? patrolDirection,
      placeBomb: false,
      targetId: chaseEnemy ? enemy?.id : undefined,
      intent: chaseEnemy ? "chase-enemy" : undefined,
    };
  }

  return { direction: null, placeBomb: false };
}

function getSafeDeterministicKickDirection(
  player: PlayerState,
  playerTile: TileCoord,
  dangerMap: Map<string, number>,
  context: BotContext,
): Direction | null {
  const direction = context.botCommittedDirection[player.id];
  if (player.kickLevel <= 0 || direction === null) {
    return null;
  }

  const delta = directionDelta[direction];
  const bombTile = { x: playerTile.x + delta.x, y: playerTile.y + delta.y };
  const bomb = context.bombs.find((candidate) => (
    candidate.tile.x === bombTile.x && candidate.tile.y === bombTile.y
  ));
  if (!bomb) {
    return null;
  }

  const landingTile = { x: bombTile.x + delta.x, y: bombTile.y + delta.y };
  const playerArrivalMs = getMoveDuration(player);
  const landingSafe = isTileSafeForArrivalWithWindow(
    dangerMap,
    landingTile,
    playerArrivalMs,
    BOT_DANGER_ARRIVAL_BUFFER_MS,
  );
  const landingOpen = isTilePathableForBot(player, landingTile, context)
    && !context.activePlayerIds.some((id) => {
      const candidate = context.players[id];
      return candidate.active && candidate.alive && candidate.tile.x === landingTile.x && candidate.tile.y === landingTile.y;
    });

  return landingOpen && landingSafe && bomb.fuseMs > playerArrivalMs + BOT_DANGER_ARRIVAL_BUFFER_MS
    ? direction
    : null;
}

/**
 * Find a bomb that the player is overlapping with
 */
function getOverlappingBomb(player: PlayerState, context: BotContext): BombState | null {
  let bestMatch: BombState | null = null;
  for (const bomb of context.bombs) {
    if (!context.isPlayerOverlappingTile(player, bomb.tile)) {
      continue;
    }
    if (!bestMatch || isHigherPriorityOverlappingBomb(bomb, bestMatch, player.id)) {
      bestMatch = bomb;
    }
  }
  return bestMatch;
}

function isHigherPriorityOverlappingBomb(
  candidate: BombState,
  current: BombState,
  playerId: PlayerId,
): boolean {
  if (candidate.fuseMs !== current.fuseMs) {
    return candidate.fuseMs < current.fuseMs;
  }

  const candidateOwned = candidate.ownerId === playerId;
  const currentOwned = current.ownerId === playerId;
  if (candidateOwned !== currentOwned) {
    return candidateOwned;
  }

  return candidate.id < current.id;
}

/**
 * Find a bomb owned by the player that would hit them
 */
function getThreateningOwnedBomb(player: PlayerState, playerTile: TileCoord, context: BotContext): BombState | null {
  const playerTileKey = tileKey(playerTile.x, playerTile.y);
  let bestMatch: BombState | null = null;
  for (const bomb of context.bombs) {
    if (bomb.ownerId !== player.id) {
      continue;
    }
    const blastKeys = getBombBlastKeys(bomb.tile, bomb.flameRange, context);
    if (!blastKeys.has(playerTileKey)) {
      continue;
    }
    if (
      !bestMatch
      || bomb.fuseMs < bestMatch.fuseMs
      || (bomb.fuseMs === bestMatch.fuseMs && bomb.id < bestMatch.id)
    ) {
      bestMatch = bomb;
    }
  }
  return bestMatch;
}

/**
 * Check if the bot can place a bomb at their current position
 */
function canBotPlaceBomb(player: PlayerState, context: BotContext): boolean {
  const playerTile = getTileFromPosition(player.position);
  return canBotPlaceBombAtTile(player, playerTile, true, context);
}

/**
 * Find a bomb suitable for remote detonation
 */
function getRemoteDetonationBomb(
  player: PlayerState,
  enemy: PlayerState,
  enemyVulnerable: boolean,
  context: BotContext,
): BombState | null {
  if (!player.alive || player.remoteLevel <= 0 || !enemyVulnerable) {
    return null;
  }

  const playerTile = getTileFromPosition(player.position);
  const playerKey = tileKey(playerTile.x, playerTile.y);
  const enemyKey = tileKey(enemy.tile.x, enemy.tile.y);
  let selectedBomb: BombState | null = null;

  for (const bomb of context.bombs) {
    if (bomb.ownerId !== player.id) {
      continue;
    }
    const blastKeys = getBombBlastKeys(bomb.tile, bomb.flameRange, context);
    if (
      !blastKeys.has(enemyKey)
      || doesRemoteDetonationChainHitTile(bomb, playerKey, context)
    ) {
      continue;
    }
    if (
      !selectedBomb
      || bomb.fuseMs < selectedBomb.fuseMs
      || (bomb.fuseMs === selectedBomb.fuseMs && bomb.id < selectedBomb.id)
    ) {
      selectedBomb = bomb;
    }
  }

  return selectedBomb;
}

function doesRemoteDetonationChainHitTile(
  initialBomb: BombState,
  targetKey: string,
  context: BotContext,
): boolean {
  const pending = [initialBomb];
  const triggeredBombIds = new Set<number>();

  while (pending.length > 0) {
    const bomb = pending.pop();
    if (!bomb || triggeredBombIds.has(bomb.id)) {
      continue;
    }
    triggeredBombIds.add(bomb.id);

    const blastKeys = getBombBlastKeys(bomb.tile, bomb.flameRange, context);
    if (blastKeys.has(targetKey)) {
      return true;
    }
    for (const chainedBomb of context.bombs) {
      if (
        !triggeredBombIds.has(chainedBomb.id)
        && blastKeys.has(tileKey(chainedBomb.tile.x, chainedBomb.tile.y))
      ) {
        pending.push(chainedBomb);
      }
    }
  }

  return false;
}

/**
 * Check if bot can place a bomb at a specific tile
 */
function canBotPlaceBombAtTile(
  player: PlayerState,
  bombTile: TileCoord,
  respectCooldown: boolean,
  context: BotContext,
): boolean {
  if (player.activeBombs >= player.maxBombs) {
    return false;
  }
  if (respectCooldown && context.botBombCooldownMs > 0) {
    return false;
  }
  if (context.bombs.some((bomb) => bomb.tile.x === bombTile.x && bomb.tile.y === bombTile.y)) {
    return false;
  }
  const escapeBudget = getBotBombEscapeBudget(player);
  const dangerAfterBomb = buildBotDangerMap(context, {
    tile: bombTile,
    range: player.flameRange,
    fuseMs: escapeBudget.fuseMs,
  });

  const maxEscapeSteps = escapeBudget.maxEscapeSteps;
  const queue: Array<{ tile: TileCoord; distance: number }> = [{ tile: bombTile, distance: 0 }];
  const visited = new Set<string>([tileKey(bombTile.x, bombTile.y)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const survivesDetonation = isTileSafeForArrival(dangerAfterBomb, current.tile, escapeBudget.fuseMs);
    if (current.distance > 0 && survivesDetonation) {
      return true;
    }
    if (current.distance >= maxEscapeSteps) {
      continue;
    }

    const neighbors: TileCoord[] = [
      { x: current.tile.x + 1, y: current.tile.y },
      { x: current.tile.x - 1, y: current.tile.y },
      { x: current.tile.x, y: current.tile.y + 1 },
      { x: current.tile.x, y: current.tile.y - 1 },
    ];

    for (const next of neighbors) {
      const nextKey = tileKey(next.x, next.y);
      if (visited.has(nextKey) || !isTilePathableForBot(player, next, context)) {
        continue;
      }
      visited.add(nextKey);
      queue.push({ tile: next, distance: current.distance + 1 });
    }
  }

  return false;
}

/**
 * Find the nearest reachable tile matching a predicate
 */
function findNearestReachableTarget(
  player: PlayerState,
  predicate: (tile: TileCoord) => boolean,
  minSafetyWindowMs = BOT_DANGER_ARRIVAL_BUFFER_MS,
  context: BotContext,
  tieBreakerScore?: (tile: TileCoord, firstDirection: Direction | null) => number,
): Direction | null {
  const dangerMap = resolveDangerMap(context);
  return findDirectionToNearestTile(player, predicate, dangerMap, context, minSafetyWindowMs, tieBreakerScore);
}

/**
 * Find direction to the nearest tile matching a predicate using BFS
 */
function findDirectionToNearestTile(
  player: PlayerState,
  predicate: (tile: TileCoord) => boolean,
  blockedDanger?: Map<string, number>,
  context?: BotContext,
  minSafetyWindowMs = BOT_DANGER_ARRIVAL_BUFFER_MS,
  tieBreakerScore?: (tile: TileCoord, firstDirection: Direction | null) => number,
  transitSafetyWindowMs = minSafetyWindowMs,
): Direction | null {
  // Handle overloaded parameter signature
  let actualContext: BotContext;
  let actualDanger: Map<string, number> | undefined;
  let actualMinSafetyWindowMs = minSafetyWindowMs;
  const actualTransitSafetyWindowMs = transitSafetyWindowMs;

  if (context === undefined && typeof blockedDanger === "object" && "players" in blockedDanger) {
    // Called with (player, predicate, context, minSafetyWindowMs)
    actualContext = blockedDanger as any as BotContext;
    actualDanger = undefined;
    actualMinSafetyWindowMs = minSafetyWindowMs;
  } else {
    // Called with (player, predicate, dangerMap, context, minSafetyWindowMs)
    actualContext = context!;
    actualDanger = blockedDanger;
    actualMinSafetyWindowMs = minSafetyWindowMs;
  }

  const start = getTileFromPosition(player.position);
  const startKey = tileKey(start.x, start.y);
  const queue: Array<{ tile: TileCoord; first: Direction | null; distance: number }> = [
    { tile: start, first: null, distance: 0 },
  ];
  const visited = new Set<string>([startKey]);
  const danger = actualDanger ?? resolveDangerMap(actualContext);
  const moveDuration = getMoveDuration(player);
  const scanRadius = Math.min(BOT_SCAN_MAX_RADIUS, BOT_SCAN_BASE_RADIUS + player.speedLevel);
  let lastScoredDistance = -1;

  while (queue.length > 0) {
    const distance = queue[0]?.distance;
    if (tieBreakerScore && distance !== undefined && distance !== lastScoredDistance) {
      lastScoredDistance = distance;
      const candidates = queue.filter((entry) => entry.distance === distance);
      let bestCandidate: typeof candidates[number] | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of candidates) {
        const arrivalMs = candidate.distance * moveDuration;
        if (
          (candidate.tile.x !== start.x || candidate.tile.y !== start.y)
          && isTileSafeForArrivalWithWindow(danger, candidate.tile, arrivalMs, actualMinSafetyWindowMs)
          && predicate(candidate.tile)
        ) {
          const score = tieBreakerScore(candidate.tile, candidate.first);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }
      }
      if (bestCandidate) {
        return bestCandidate.first;
      }
    }

    const current = queue.shift();
    if (!current) {
      break;
    }

    const arrivalMs = current.distance * moveDuration;
    const currentSafe = isTileSafeForArrivalWithWindow(danger, current.tile, arrivalMs, actualMinSafetyWindowMs);
    if ((current.tile.x !== start.x || current.tile.y !== start.y) && currentSafe && predicate(current.tile)) {
      return current.first;
    }

    if (current.distance >= scanRadius) {
      continue;
    }

    const neighbors: Array<{ direction: Direction; tile: TileCoord }> = [
      { direction: "up", tile: { x: current.tile.x, y: current.tile.y - 1 } },
      { direction: "down", tile: { x: current.tile.x, y: current.tile.y + 1 } },
      { direction: "left", tile: { x: current.tile.x - 1, y: current.tile.y } },
      { direction: "right", tile: { x: current.tile.x + 1, y: current.tile.y } },
    ];

    for (const neighbor of neighbors) {
      const key = tileKey(neighbor.tile.x, neighbor.tile.y);
      const neighborArrivalMs = (current.distance + 1) * moveDuration;
      if (
        visited.has(key)
        || !isTileSafeForArrivalWithWindow(danger, neighbor.tile, neighborArrivalMs, actualTransitSafetyWindowMs)
        || !isTilePathableForBot(player, neighbor.tile, actualContext)
      ) {
        continue;
      }
      visited.add(key);
      queue.push({
        tile: neighbor.tile,
        first: current.first ?? neighbor.direction,
        distance: current.distance + 1,
      });
    }
  }

  return null;
}

/**
 * Check if a tile is pathable for the bot
 */
function isTilePathableForBot(player: PlayerState, tile: TileCoord, context: BotContext): boolean {
  const arenaWidth = context.arena.config.grid.width;
  const arenaHeight = context.arena.config.grid.height;
  if (tile.x < 0 || tile.y < 0 || tile.x >= arenaWidth || tile.y >= arenaHeight) {
    return false;
  }
  const key = tileKey(tile.x, tile.y);
  if (context.arena.solid.has(key) || context.arena.breakable.has(key)) {
    return false;
  }
  const bombOnTile = context.bombs.find((bomb) => bomb.tile.x === tile.x && bomb.tile.y === tile.y);
  if (!bombOnTile) {
    return true;
  }
  if (player.bombPassLevel > 0) {
    return true;
  }
  return bombOnTile.ownerId === player.id && bombOnTile.ownerCanPass;
}

/**
 * Check if a bomb can reach a target tile
 */
function canBombReachTile(origin: TileCoord, target: TileCoord, range: number, context: BotContext): boolean {
  if (origin.x !== target.x && origin.y !== target.y) {
    return false;
  }

  if (origin.x === target.x) {
    const step = target.y > origin.y ? 1 : -1;
    const distance = Math.abs(target.y - origin.y);
    if (distance > range) {
      return false;
    }
    for (let offset = 1; offset <= distance; offset += 1) {
      const y = origin.y + offset * step;
      const key = tileKey(origin.x, y);
      if (context.arena.solid.has(key)) {
        return false;
      }
      if (context.arena.breakable.has(key)) {
        return y === target.y;
      }
    }
    return true;
  }

  const step = target.x > origin.x ? 1 : -1;
  const distance = Math.abs(target.x - origin.x);
  if (distance > range) {
    return false;
  }
  for (let offset = 1; offset <= distance; offset += 1) {
    const x = origin.x + offset * step;
    const key = tileKey(x, origin.y);
    if (context.arena.solid.has(key)) {
      return false;
    }
    if (context.arena.breakable.has(key)) {
      return x === target.x;
    }
  }
  return true;
}

/**
 * Check if a tile has an adjacent breakable
 */
function hasAdjacentBreakable(tile: TileCoord, context: BotContext): boolean {
  return getAdjacentBreakables(tile, context).length > 0;
}

function hasAdjacentBreakableWithValuablePrecomputedPowerUp(
  player: PlayerState,
  tile: TileCoord,
  context: BotContext,
): boolean {
  const adjacentBreakableKeys = new Set(
    getAdjacentBreakables(tile, context).map((neighbor) => tileKey(neighbor.x, neighbor.y)),
  );
  return context.arena.powerUps.some((powerUp) => (
    !powerUp.revealed
    && !powerUp.collected
    && getPowerUpPriorityScore(player, powerUp.type) > 0
    && adjacentBreakableKeys.has(tileKey(powerUp.tile.x, powerUp.tile.y))
  ));
}

function getAdjacentBreakables(tile: TileCoord, context: BotContext): TileCoord[] {
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  return neighbors.filter((neighbor) => context.arena.breakable.has(tileKey(neighbor.x, neighbor.y)));
}

/**
 * Find direction to a valuable power-up
 */
function findValuablePowerUpDirection(player: PlayerState, minSafetyWindowMs: number, context: BotContext): Direction | null {
  const priorityGroups = new Map<number, Set<string>>();
  for (const powerUp of context.arena.powerUps) {
    if (!powerUp.revealed || powerUp.collected || isPowerUpMaxed(player, powerUp.type)) {
      continue;
    }
    const value = getPowerUpPriority(player, powerUp.type);
    if (value <= 0) {
      continue;
    }
    const key = tileKey(powerUp.tile.x, powerUp.tile.y);
    if (!priorityGroups.has(value)) {
      priorityGroups.set(value, new Set<string>());
    }
    priorityGroups.get(value)?.add(key);
  }

  const sortedValues = [...priorityGroups.keys()].sort((a, b) => b - a);
  for (const value of sortedValues) {
    const targetTiles = priorityGroups.get(value);
    if (!targetTiles) {
      continue;
    }
    const direction = findNearestReachableTarget(
      player,
      (tile) => targetTiles.has(tileKey(tile.x, tile.y)),
      minSafetyWindowMs,
      context,
      (_tile, firstDirection) => firstDirection === context.botCommittedDirection[player.id] ? 1 : 0,
    );
    if (direction) {
      return direction;
    }
  }

  return null;
}

function isRevengeWindowActive(player: PlayerState): boolean {
  return player.flameGuardMs > 0 || (player.breakawayBoostMs ?? 0) > 0;
}

function findEnemyBombLineDirection(
  player: PlayerState,
  enemy: PlayerState | null,
  enemyVulnerable: boolean,
  minSafetyWindowMs: number,
  context: BotContext,
): Direction | null {
  if (!enemy || !enemyVulnerable) {
    return null;
  }

  return findNearestReachableTarget(
    player,
    (tile) => (
      canBombReachTile(tile, enemy.tile, player.flameRange, context)
      && canBotPlaceBombAtTile(player, tile, false, context)
    ),
    minSafetyWindowMs,
    context,
  );
}

/**
 * Get priority score for a power-up type
 */
function getPowerUpPriority(player: PlayerState, type: any): number {
  return getPowerUpPriorityScore(player, type);
}

function getEscapeRouteScore(
  player: PlayerState,
  playerTile: TileCoord,
  candidateTile: TileCoord,
  dangerEtaMs: number | null,
  dangerMap: Map<string, number>,
  context: BotContext,
): number {
  return getEscapeRouteSignal(
    player,
    playerTile,
    candidateTile,
    dangerEtaMs,
    dangerMap,
    context,
  ).routeScore;
}

function getEscapeRouteSignal(
  player: PlayerState,
  playerTile: TileCoord,
  candidateTile: TileCoord,
  dangerEtaMs: number | null,
  dangerMap: Map<string, number>,
  context: BotContext,
): BotPowerUpEscapeRouteSignal {
  const powerUp = context.arena.powerUps.find((candidate) => (
    candidate.revealed
    && !candidate.collected
    && candidate.tile.x === candidateTile.x
    && candidate.tile.y === candidateTile.y
    && !isPowerUpMaxed(player, candidate.type)
  ));
  const utility = powerUp ? getPowerUpPriorityScore(player, powerUp.type) : 0;
  const distanceSteps = getTileDistance(playerTile, candidateTile);
  return getBotPowerUpEscapeRouteSignal({
    powerUpType: powerUp?.type ?? null,
    utility,
    safeNeighborCount: countSafeNeighborsAtArrival(
      player,
      candidateTile,
      distanceSteps,
      dangerMap,
      context,
    ),
    distanceSteps,
    moveDurationMs: getMoveDuration(player),
    dangerEtaMs,
  });
}

export function getBotPowerUpEscapeRouteSignalForTile(
  player: PlayerState,
  candidateTile: TileCoord,
  context: BotContext,
): BotPowerUpEscapeRouteSignal {
  const playerTile = getTileFromPosition(player.position);
  const dangerMap = resolveDangerMap(context);
  const dangerEtaMs = dangerMap.get(tileKey(playerTile.x, playerTile.y)) ?? null;
  return getEscapeRouteSignal(
    player,
    playerTile,
    candidateTile,
    dangerEtaMs,
    dangerMap,
    context,
  );
}

/**
 * Get direction to move away from sudden death pressure
 */
export function getSuddenDeathPressureDirection(player: PlayerState, danger: Map<string, number>, context: BotContext): Direction | null {
  if (!context.suddenDeathActive) {
    return null;
  }
  const start = getTileFromPosition(player.position);
  const moveDuration = getMoveDuration(player);
  const centerTile = {
    x: Math.floor(context.arena.config.grid.width / 2),
    y: Math.floor(context.arena.config.grid.height / 2),
  };
  const currentDistanceToCenter = getTileDistance(start, centerTile);
  const desiredSafetyWindowMs = Math.max(BOT_SUDDEN_DEATH_LOOKAHEAD_MS, moveDuration * 4);

  return findDirectionToNearestTile(
    player,
    (tile) => {
      const key = tileKey(tile.x, tile.y);
      const dangerMs = danger.get(key);
      const safeWindow = dangerMs === undefined || dangerMs > desiredSafetyWindowMs;
      if (!safeWindow) {
        return false;
      }

      const distanceToCenter = getTileDistance(tile, centerTile);
      const improvesCentering = distanceToCenter < currentDistanceToCenter;
      if (improvesCentering) {
        return true;
      }

      return countSafeNeighbors(player, tile, danger, context) >= 1;
    },
    danger,
    context,
    desiredSafetyWindowMs,
    (tile, firstDirection) => {
      const routeContinuityScore = firstDirection === context.botCommittedDirection[player.id] ? 1 : 0;
      return getSuddenDeathPressureSignal({
        candidateTile: tile,
        centerTile,
        currentDistanceToCenter,
        routeContinuity: routeContinuityScore > 0,
      }).score;
    },
    BOT_DANGER_ARRIVAL_BUFFER_MS,
  );
}

/**
 * Get patrol direction for idle bot movement
 */
function getPatrolDirection(
  player: PlayerState,
  danger: Map<string, number>,
  moveDuration: number,
  context: BotContext,
): Direction | null {
  const playerTile = getTileFromPosition(player.position);
  const centerTile = {
    x: Math.floor(context.arena.config.grid.width / 2),
    y: Math.floor(context.arena.config.grid.height / 2),
  };
  const currentCenterDistance = getTileDistance(playerTile, centerTile);
  const lastDirection = player.lastMoveDirection ?? player.direction;
  const reverseDirection = lastDirection
    ? lastDirection === "up"
      ? "down"
      : lastDirection === "down"
        ? "up"
        : lastDirection === "left"
          ? "right"
          : "left"
    : null;

  let bestDirection: Direction | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const patrolSafetyWindowMs = moveDuration * BOT_STRATEGIC_MOVE_WINDOW_STEPS + BOT_DANGER_ARRIVAL_BUFFER_MS;

  for (const direction of ["up", "right", "left", "down"] as const) {
    const delta = directionDelta[direction];
    const nextTile = { x: playerTile.x + delta.x, y: playerTile.y + delta.y };
    if (
      !isTilePathableForBot(player, nextTile, context)
      || !isTileSafeForArrivalWithWindow(danger, nextTile, moveDuration, patrolSafetyWindowMs)
    ) {
      continue;
    }
    const canBombFromTile = canBotPlaceBombAtTile(player, nextTile, false, context);
    if (hasAdjacentBreakable(nextTile, context) && !canBombFromTile) {
      continue;
    }

    let score = getTileDistance(nextTile, centerTile);
    if (direction === lastDirection) {
      score -= 0.5;
    }
    if (reverseDirection && direction === reverseDirection) {
      score += 3;
    }
    if (getTileDistance(nextTile, centerTile) < currentCenterDistance) {
      score -= 0.25;
    }

    if (score < bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

/**
 * Build a map of danger (explosive impact times) at each tile
 */
function resolveDangerMap(context: BotContext): Map<string, number> {
  return context.dangerMap ?? buildBotDangerMap(context);
}

export function buildBotDangerMap(
  context: BotContext,
  extraBomb?: ProjectedBomb,
): Map<string, number> {
  return buildDangerMap(context, extraBomb);
}

/**
 * Get all tiles affected by a bomb blast
 */
function getBombBlastKeys(origin: TileCoord, range: number, context: BotContext): Set<string> {
  return projectBombBlastKeys(origin, range, context.arena);
}

/**
 * Check if a tile is safe to arrive at given when we arrive
 */
function isTileSafeForArrival(danger: Map<string, number>, tile: TileCoord, arrivalMs: number): boolean {
  return isTileSafeForArrivalWithWindow(danger, tile, arrivalMs, BOT_DANGER_ARRIVAL_BUFFER_MS);
}

/**
 * Check if a tile is safe to arrive at with a minimum safety window
 */
function isTileSafeForArrivalWithWindow(
  danger: Map<string, number>,
  tile: TileCoord,
  arrivalMs: number,
  minSafetyWindowMs: number,
): boolean {
  const key = tileKey(tile.x, tile.y);
  const dangerMs = danger.get(key);
  return dangerMs === undefined || dangerMs > arrivalMs + minSafetyWindowMs;
}

/**
 * Count how many safe neighbors a tile has
 */
function countSafeNeighbors(player: PlayerState, tile: TileCoord, danger: Map<string, number>, context: BotContext): number {
  const moveDuration = getMoveDuration(player);
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  let count = 0;
  for (const neighbor of neighbors) {
    if (
      isTilePathableForBot(player, neighbor, context)
      && isTileSafeForArrival(danger, neighbor, moveDuration)
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Get how long (in ms) it takes a player to move one tile
 */
function getMoveDuration(player: PlayerState): number {
  return Math.max(MIN_MOVE_MS, BASE_MOVE_MS - player.speedLevel * SPEED_STEP_MS);
}

/**
 * Get stable bot direction with confirmation frames for reversals
 */
export function getStableBotDirection(
  player: PlayerState,
  desiredDirection: Direction | null,
  deltaMs: number,
  context: BotContext,
): Direction | null {
  if (!context.botCommittedDirection[player.id] && player.lastMoveDirection) {
    context.botCommittedDirection[player.id] = player.lastMoveDirection;
  }

  if (!desiredDirection) {
    clearBotReversePending(player.id, context);
    return null;
  }

  const committedDirection = context.botCommittedDirection[player.id] ?? player.lastMoveDirection ?? player.direction;
  if (
    !committedDirection
    || committedDirection === desiredDirection
  ) {
    clearBotReversePending(player.id, context);
    rememberBotDirection(player.id, desiredDirection, context);
    return desiredDirection;
  }

  const currentTile = getTileFromPosition(player.position);
  const dangerMap = resolveDangerMap(context);
  const moveDuration = getMoveDuration(player);
  const currentDangerMs = dangerMap.get(tileKey(currentTile.x, currentTile.y));
  const immediateDanger = currentDangerMs !== undefined
    && currentDangerMs <= moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS;
  const committedDelta = directionDelta[committedDirection];
  const committedTile = { x: currentTile.x + committedDelta.x, y: currentTile.y + committedDelta.y };
  const committedDangerMs = dangerMap.get(tileKey(committedTile.x, committedTile.y));
  const committedRouteDanger = committedDangerMs !== undefined
    && committedDangerMs <= moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS;
  if (immediateDanger || committedRouteDanger) {
    clearBotReversePending(player.id, context);
    rememberBotDirection(player.id, desiredDirection, context);
    return desiredDirection;
  }

  const continueOption = context.evaluateMovementOption(player, committedDirection, deltaMs);
  const canContinueForward = context.canMovementOptionAdvance(player.position, continueOption);
  const oppositeRequest = context.areOppositeDirections(committedDirection, desiredDirection);
  const reverseConfirmationFrames = context.botPendingReverseDirection[player.id] === desiredDirection
    ? context.botPendingReverseFrames[player.id] + 1
    : 1;
  const stabilitySignal = getBotDirectionStabilitySignal({
    position: player.position,
    committedDirection,
    requestedDirection: desiredDirection,
    pendingFrames: context.botPendingReverseFrames[player.id],
    oppositeRequest,
    immediateDanger: immediateDanger || committedRouteDanger,
    canContinueForward,
    centerTolerancePx: TILE_SIZE * deltaMs / moveDuration,
    requestConfirmed: reverseConfirmationFrames >= BOT_DIRECTION_CONFIRM_FRAMES,
  });
  if (stabilitySignal.phase !== "holding-route") {
    clearBotReversePending(player.id, context);
    rememberBotDirection(player.id, desiredDirection, context);
    return desiredDirection;
  }

  if (context.botPendingReverseDirection[player.id] !== desiredDirection) {
    context.botPendingReverseDirection[player.id] = desiredDirection;
    context.botPendingReverseFrames[player.id] = 1;
    return committedDirection;
  }

  context.botPendingReverseFrames[player.id] += 1;
  return committedDirection;
}

function countSafeNeighborsAtArrival(
  player: PlayerState,
  tile: TileCoord,
  distanceSteps: number,
  danger: Map<string, number>,
  context: BotContext,
): number {
  const moveDuration = getMoveDuration(player);
  const neighborArrivalMs = (Math.max(0, distanceSteps) + 1) * moveDuration;
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  return neighbors.filter((neighbor) => (
    isTilePathableForBot(player, neighbor, context)
    && isTileSafeForArrival(danger, neighbor, neighborArrivalMs)
  )).length;
}

function countTargetEscapeRoutes(player: PlayerState, context: BotContext): number {
  const neighbors = [
    { x: player.tile.x + 1, y: player.tile.y },
    { x: player.tile.x - 1, y: player.tile.y },
    { x: player.tile.x, y: player.tile.y + 1 },
    { x: player.tile.x, y: player.tile.y - 1 },
  ];
  return neighbors.filter((tile) => isTilePathableForBot(player, tile, context)).length;
}

function getOwnedBombCommitment(
  playerId: PlayerId,
  context: BotContext,
  dangerMap: Map<string, number>,
): { count: number; soonestFuseMs: number | null } {
  let count = 0;
  let soonestFuseMs: number | null = null;
  for (const bomb of context.bombs) {
    if (bomb.ownerId !== playerId) continue;
    count += 1;
    const effectiveFuseMs = dangerMap.get(tileKey(bomb.tile.x, bomb.tile.y)) ?? bomb.fuseMs;
    if (soonestFuseMs === null || effectiveFuseMs < soonestFuseMs) soonestFuseMs = effectiveFuseMs;
  }
  return { count, soonestFuseMs };
}

/**
 * Clear pending reverse direction for a bot
 */
export function clearBotReversePending(playerId: PlayerId, context: BotContext): void {
  context.botPendingReverseDirection[playerId] = null;
  context.botPendingReverseFrames[playerId] = 0;
}

/**
 * Remember the committed direction for a bot
 */
export function rememberBotDirection(playerId: PlayerId, direction: Direction | null, context: BotContext): void {
  if (context.botCommittedDirection[playerId] === direction) {
    return;
  }
  context.botCommittedDirection[playerId] = direction;
}
