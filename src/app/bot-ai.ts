import {
  BASE_MOVE_MS,
  BOMB_FUSE_MS,
  GRID_HEIGHT,
  GRID_WIDTH,
  MIN_MOVE_MS,
  SPEED_STEP_MS,
  TILE_SIZE,
} from "../core/config";
import type {
  ArenaState,
  BombState,
  Direction,
  FlameState,
  PixelCoord,
  PlayerId,
  PlayerState,
  TileCoord,
} from "../core/types";
import { tileKey } from "../game/arena";
import { getPowerUpPriorityScore } from "../core/powerups";

// Bot-specific constants
const BOT_DANGER_FUSE_MS = 1000;
const BOT_DANGER_ARRIVAL_BUFFER_MS = 140;
const BOT_SCAN_RADIUS = 7;
const BOT_SUDDEN_DEATH_LOOKAHEAD_MS = 2100;
const BOT_STRATEGIC_MOVE_WINDOW_STEPS = 2;
const BOT_PREEMPTIVE_ESCAPE_STEPS = 4;
const BOT_DIRECTION_CONFIRM_FRAMES = 2;

// Sudden death constants
const SUDDEN_DEATH_FALL_MS = 340;
const SUDDEN_DEATH_TICK_MS = 800;

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

/**
 * Main bot decision logic
 */
export function getBotDecision(player: PlayerState, context: BotContext): BotDecision {
  const enemy = context.players[1];
  const playerTile = getTileFromPosition(player.position);
  const dangerMap = getDangerMap(context);
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
  if (shouldPreemptivelyEscape) {
    const plannedEscape = findDirectionToNearestTile(
      player,
      (tile) => countSafeNeighbors(player, tile, dangerMap, context) >= 1,
      dangerMap,
      context,
      strategicSafetyWindowMs,
    );
    const immediateEscape = findDirectionToNearestTile(
      player,
      (tile) => isTileSafeForArrival(dangerMap, tile, getMoveDuration(player)),
      dangerMap,
      context,
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
    );
    const fallbackEscape = findDirectionToNearestTile(
      player,
      (tile) => isTileSafeForArrival(dangerMap, tile, getMoveDuration(player)),
      dangerMap,
      context,
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

  const enemyVulnerable = enemy.alive && enemy.spawnProtectionMs <= 0;
  const openingProtected = player.spawnProtectionMs > 0;
  const remoteDetonationBomb = getRemoteDetonationBomb(player, enemy, enemyVulnerable, context);
  if (remoteDetonationBomb) {
    return { direction: null, placeBomb: false, detonate: true };
  }
  const adjacentEnemy = enemyVulnerable && getTileDistance(playerTile, enemy.tile) <= 1;
  const enemyInBombLine = enemyVulnerable && canBombReachTile(playerTile, enemy.tile, player.flameRange, context);
  const adjacentBreakable = hasAdjacentBreakable(playerTile, context);
  const shouldDropBomb = !openingProtected
    && (adjacentEnemy || adjacentBreakable || enemyInBombLine)
    && canBotPlaceBomb(player, context);
  if (shouldDropBomb) {
    return { direction: null, placeBomb: true };
  }

  const powerUpTarget = findValuablePowerUpDirection(player, strategicSafetyWindowMs, context);
  if (powerUpTarget) {
    return { direction: powerUpTarget, placeBomb: false };
  }

  const breakableTarget = findNearestReachableTarget(
    player,
    (tile) => hasAdjacentBreakable(tile, context) && canBotPlaceBombAtTile(player, tile, false, context),
    strategicSafetyWindowMs,
    context,
  );
  if (breakableTarget) {
    return { direction: breakableTarget, placeBomb: false };
  }

  const attackPositionTarget = findNearestReachableTarget(
    player,
    (tile) => (
      enemyVulnerable
      && canBombReachTile(tile, enemy.tile, player.flameRange, context)
      && canBotPlaceBombAtTile(player, tile, false, context)
    ),
    strategicSafetyWindowMs,
    context,
  );
  if (attackPositionTarget) {
    return { direction: attackPositionTarget, placeBomb: false };
  }

  const chaseEnemy = findDirectionToNearestTile(
    player,
    (tile) => getTileDistance(tile, enemy.tile) <= 1,
    undefined,
    context,
    strategicSafetyWindowMs,
  );
  const patrolDirection = getPatrolDirection(player, dangerMap, moveDuration, context);
  if (chaseEnemy || patrolDirection) {
    return { direction: chaseEnemy ?? patrolDirection, placeBomb: false };
  }

  return { direction: null, placeBomb: false };
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
    if (!bestMatch || bomb.fuseMs < bestMatch.fuseMs || (bomb.ownerId === player.id && bestMatch.ownerId !== player.id)) {
      bestMatch = bomb;
    }
  }
  return bestMatch;
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
    if (!bestMatch || bomb.fuseMs < bestMatch.fuseMs) {
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
 * Get the oldest bomb owned by a player
 */
function getOldestOwnedBomb(playerId: PlayerId, context: BotContext): BombState | null {
  let selectedBomb: BombState | null = null;
  for (const bomb of context.bombs) {
    if (bomb.ownerId !== playerId) {
      continue;
    }
    if (!selectedBomb || bomb.id < selectedBomb.id) {
      selectedBomb = bomb;
    }
  }
  return selectedBomb;
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
  if (!player.alive || player.remoteLevel <= 0) {
    return null;
  }
  const remoteBomb = getOldestOwnedBomb(player.id, context);
  if (!remoteBomb) {
    return null;
  }

  const blastKeys = getBombBlastKeys(remoteBomb.tile, remoteBomb.flameRange, context);
  const playerTile = getTileFromPosition(player.position);
  if (blastKeys.has(tileKey(playerTile.x, playerTile.y))) {
    return null;
  }
  if (enemyVulnerable && blastKeys.has(tileKey(enemy.tile.x, enemy.tile.y))) {
    return remoteBomb;
  }
  return null;
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
  const dangerAfterBomb = getDangerMap(context, {
    tile: bombTile,
    range: player.flameRange,
    fuseMs: BOMB_FUSE_MS,
  });

  const maxEscapeSteps = Math.max(1, Math.floor((BOMB_FUSE_MS - 250) / getMoveDuration(player)));
  const queue: Array<{ tile: TileCoord; distance: number }> = [{ tile: bombTile, distance: 0 }];
  const visited = new Set<string>([tileKey(bombTile.x, bombTile.y)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const survivesDetonation = isTileSafeForArrival(dangerAfterBomb, current.tile, BOMB_FUSE_MS);
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
): Direction | null {
  const dangerMap = getDangerMap(context);
  return findDirectionToNearestTile(player, predicate, dangerMap, context, minSafetyWindowMs);
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
): Direction | null {
  // Handle overloaded parameter signature
  let actualContext: BotContext;
  let actualDanger: Map<string, number> | undefined;
  let actualMinSafetyWindowMs = minSafetyWindowMs;

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
  const danger = actualDanger ?? getDangerMap(actualContext);
  const moveDuration = getMoveDuration(player);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const arrivalMs = current.distance * moveDuration;
    const currentSafe = isTileSafeForArrivalWithWindow(danger, current.tile, arrivalMs, actualMinSafetyWindowMs);
    if ((current.tile.x !== start.x || current.tile.y !== start.y) && currentSafe && predicate(current.tile)) {
      return current.first;
    }

    if (current.distance >= BOT_SCAN_RADIUS) {
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
        || !isTileSafeForArrivalWithWindow(danger, neighbor.tile, neighborArrivalMs, actualMinSafetyWindowMs)
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
  if (tile.x < 0 || tile.y < 0 || tile.x >= GRID_WIDTH || tile.y >= GRID_HEIGHT) {
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
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  return neighbors.some((neighbor) => context.arena.breakable.has(tileKey(neighbor.x, neighbor.y)));
}

/**
 * Find direction to a valuable power-up
 */
function findValuablePowerUpDirection(player: PlayerState, minSafetyWindowMs: number, context: BotContext): Direction | null {
  const priorityGroups = new Map<number, Set<string>>();
  for (const powerUp of context.arena.powerUps) {
    if (!powerUp.revealed || powerUp.collected) {
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
    );
    if (direction) {
      return direction;
    }
  }

  return null;
}

/**
 * Get priority score for a power-up type
 */
function getPowerUpPriority(player: PlayerState, type: any): number {
  return getPowerUpPriorityScore(player, type);
}

/**
 * Get direction to move away from sudden death pressure
 */
function getSuddenDeathPressureDirection(player: PlayerState, danger: Map<string, number>, context: BotContext): Direction | null {
  if (!context.suddenDeathActive) {
    return null;
  }
  const start = getTileFromPosition(player.position);
  const moveDuration = getMoveDuration(player);
  const centerTile = {
    x: Math.floor(GRID_WIDTH / 2),
    y: Math.floor(GRID_HEIGHT / 2),
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

      return countSafeNeighbors(player, tile, danger, context) >= 2;
    },
    danger,
    context,
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
    x: Math.floor(GRID_WIDTH / 2),
    y: Math.floor(GRID_HEIGHT / 2),
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

  for (const direction of ["up", "right", "left", "down"] as const) {
    const delta = directionDelta[direction];
    const nextTile = { x: playerTile.x + delta.x, y: playerTile.y + delta.y };
    if (
      !isTilePathableForBot(player, nextTile, context)
      || !isTileSafeForArrival(danger, nextTile, moveDuration)
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
function getDangerMap(
  context: BotContext,
  extraBomb?: { tile: TileCoord; range: number; fuseMs: number },
): Map<string, number> {
  const danger = new Map<string, number>();
  const registerDanger = (key: string, fuseMs: number): void => {
    const previous = danger.get(key);
    if (previous === undefined || fuseMs < previous) {
      danger.set(key, fuseMs);
    }
  };

  for (const flame of context.flames) {
    registerDanger(tileKey(flame.tile.x, flame.tile.y), 0);
  }

  const bombsToProject: Array<{ tile: TileCoord; range: number; fuseMs: number; blastKeys: Set<string> }> = context.bombs
    .filter((bomb) => bomb.fuseMs <= BOMB_FUSE_MS + BOT_DANGER_FUSE_MS)
    .map((bomb) => ({
      tile: bomb.tile,
      range: bomb.flameRange,
      fuseMs: Math.max(0, bomb.fuseMs),
      blastKeys: getBombBlastKeys(bomb.tile, bomb.flameRange, context),
    }));

  if (extraBomb) {
    bombsToProject.push({
      tile: extraBomb.tile,
      range: extraBomb.range,
      fuseMs: Math.max(0, extraBomb.fuseMs),
      blastKeys: getBombBlastKeys(extraBomb.tile, extraBomb.range, context),
    });
  }

  let updated = true;
  while (updated) {
    updated = false;
    for (const source of bombsToProject) {
      for (const target of bombsToProject) {
        if (source === target || source.fuseMs >= target.fuseMs) {
          continue;
        }
        if (source.blastKeys.has(tileKey(target.tile.x, target.tile.y))) {
          target.fuseMs = source.fuseMs;
          updated = true;
        }
      }
    }
  }

  for (const bomb of bombsToProject) {
    for (const key of bomb.blastKeys) {
      registerDanger(key, bomb.fuseMs);
    }
  }

  for (const effect of context.suddenDeathClosureEffects) {
    if (effect.impacted) {
      continue;
    }
    const impactMs = Math.max(0, SUDDEN_DEATH_FALL_MS - effect.elapsedMs);
    registerDanger(tileKey(effect.tile.x, effect.tile.y), impactMs);
  }

  if (context.suddenDeathActive && context.suddenDeathPath.length > 0 && context.suddenDeathIndex < context.suddenDeathPath.length) {
    const nextTickMs = Math.max(0, context.suddenDeathTickMs);
    for (let index = context.suddenDeathIndex; index < context.suddenDeathPath.length; index += 1) {
      const stepFromNow = index - context.suddenDeathIndex;
      const impactMs = nextTickMs + stepFromNow * SUDDEN_DEATH_TICK_MS;
      const tile = context.suddenDeathPath[index];
      registerDanger(tileKey(tile.x, tile.y), impactMs);
    }
  }

  return danger;
}

/**
 * Get all tiles affected by a bomb blast
 */
function getBombBlastKeys(origin: TileCoord, range: number, context: BotContext): Set<string> {
  const keys = new Set<string>([tileKey(origin.x, origin.y)]);
  for (const delta of Object.values(directionDelta)) {
    for (let step = 1; step <= range; step += 1) {
      const x = origin.x + delta.x * step;
      const y = origin.y + delta.y * step;
      if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
        break;
      }
      const key = tileKey(x, y);
      if (context.arena.solid.has(key)) {
        break;
      }
      keys.add(key);
      if (context.arena.breakable.has(key)) {
        break;
      }
    }
  }
  return keys;
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
  const currentDangerMs = getDangerMap(context).get(tileKey(currentTile.x, currentTile.y));
  const immediateDanger = currentDangerMs !== undefined
    && currentDangerMs <= getMoveDuration(player) + BOT_DANGER_ARRIVAL_BUFFER_MS;
  if (immediateDanger) {
    clearBotReversePending(player.id, context);
    rememberBotDirection(player.id, desiredDirection, context);
    return desiredDirection;
  }

  const continueOption = context.evaluateMovementOption(player, committedDirection, deltaMs);
  const canContinueForward = context.canMovementOptionAdvance(player.position, continueOption);
  if (!context.areOppositeDirections(committedDirection, desiredDirection) || !canContinueForward) {
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
  if (context.botPendingReverseFrames[player.id] < BOT_DIRECTION_CONFIRM_FRAMES) {
    return committedDirection;
  }

  clearBotReversePending(player.id, context);
  rememberBotDirection(player.id, desiredDirection, context);
  return desiredDirection;
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
