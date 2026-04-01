import type {
  ArenaDefinition,
  ArenaDefinitionStatus,
  ArenaRuntimeConfig,
  ArenaSpawnDefinition,
  ArenaState,
  ArenaValidationIssue,
  PowerUpState,
  PowerUpType,
  TileCoord,
} from "../Gameplay/types";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  MAX_ARENA_GRID_HEIGHT,
  MAX_ARENA_GRID_WIDTH,
} from "../PersonalConfig/config";
import { ALL_PLAYER_IDS } from "../Gameplay/types";
import { DEFAULT_ARENA_THEME_ID } from "./arena-theme-library";

const BREAKABLE_POWERUP_DROP_RATE = 0.9;
const MIN_ARENA_WIDTH = 7;
const MIN_ARENA_HEIGHT = 7;
const MAX_ARENA_WIDTH = MAX_ARENA_GRID_WIDTH;
const MAX_ARENA_HEIGHT = MAX_ARENA_GRID_HEIGHT;

export interface ArenaValidationResult {
  ok: boolean;
  issues: ArenaValidationIssue[];
}

export interface ActiveArenaResponse {
  arena: ArenaDefinition;
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseTileKey(key: string): TileCoord {
  const [xText, yText] = key.split(",");
  return { x: Number(xText), y: Number(yText) };
}

export function createDefaultArenaDefinition(status: ArenaDefinitionStatus = "active"): ArenaDefinition {
  const width = GRID_WIDTH;
  const height = GRID_HEIGHT;
  const solid = createDefaultSolidTiles(width, height);
  const breakable = createDefaultBreakableTiles(width, height, solid);
  return {
    id: "default-live-arena",
    name: "Default Arena",
    status,
    themeId: DEFAULT_ARENA_THEME_ID,
    grid: { width, height },
    tiles: {
      solid: [...solid],
      breakable: [...breakable],
    },
    spawns: createDefaultSpawns(width, height),
    version: "default-v1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

export function cloneArenaDefinition(definition: ArenaDefinition): ArenaDefinition {
  return {
    ...definition,
    grid: { ...definition.grid },
    tiles: {
      solid: [...definition.tiles.solid],
      breakable: [...definition.tiles.breakable],
    },
    spawns: definition.spawns.map((spawn) => ({
      ...spawn,
      tile: { ...spawn.tile },
    })),
  };
}

export function buildArenaRuntimeConfig(definition: ArenaDefinition): ArenaRuntimeConfig {
  const normalized = normalizeArenaDefinition(definition);
  const wrapPortals = createWrapPortalTiles(normalized.grid.width, normalized.grid.height);
  const solid = new Set(normalized.tiles.solid);
  const suddenDeathPath = buildSuddenDeathPath(normalized.grid.width, normalized.grid.height, solid);
  const spawnMap = ALL_PLAYER_IDS.reduce((result, playerId) => {
    const spawn = normalized.spawns.find((entry) => entry.playerId === playerId) ?? normalized.spawns[0];
    result[playerId] = {
      playerId,
      direction: spawn.direction,
      tile: { ...spawn.tile },
    };
    return result;
  }, {} as ArenaRuntimeConfig["spawnMap"]);

  return {
    ...normalized,
    grid: { ...normalized.grid },
    tiles: {
      solid: [...normalized.tiles.solid],
      breakable: [...normalized.tiles.breakable],
    },
    spawns: normalized.spawns.map((spawn) => ({
      ...spawn,
      tile: { ...spawn.tile },
    })),
    wrapPortals,
    suddenDeathPath,
    spawnMap,
  };
}

export function buildArenaState(config: ArenaRuntimeConfig): ArenaState {
  const breakable = new Set(config.tiles.breakable);
  return {
    config,
    solid: new Set(config.tiles.solid),
    breakable,
    powerUps: createPowerUpsFromBreakables(breakable, config),
  };
}

export function createArena(definition: ArenaDefinition = createDefaultArenaDefinition()): ArenaState {
  return buildArenaState(buildArenaRuntimeConfig(definition));
}

export function normalizeArenaDefinition(definition: ArenaDefinition): ArenaDefinition {
  const width = clampOddDimension(definition.grid.width, MIN_ARENA_WIDTH, MAX_ARENA_WIDTH);
  const height = clampOddDimension(definition.grid.height, MIN_ARENA_HEIGHT, MAX_ARENA_HEIGHT);
  const solid = sanitizeTileList(definition.tiles?.solid ?? [], width, height);
  const breakable = sanitizeTileList(definition.tiles?.breakable ?? [], width, height, new Set(solid));
  const spawns = normalizeSpawns(definition.spawns ?? [], width, height);
  return {
    ...definition,
    name: (definition.name || "Untitled Arena").trim(),
    themeId: (definition.themeId || DEFAULT_ARENA_THEME_ID).trim().toLowerCase(),
    status: definition.status === "draft" ? "draft" : "active",
    grid: { width, height },
    tiles: {
      solid: [...solid],
      breakable: [...breakable],
    },
    spawns,
  };
}

export function validateArenaDefinition(definition: ArenaDefinition): ArenaValidationResult {
  const normalized = normalizeArenaDefinition(definition);
  const issues: ArenaValidationIssue[] = [];
  const { width, height } = normalized.grid;

  if (definition.grid.width !== width) {
    issues.push({ severity: "error", code: "width_invalid", message: `Width must be odd and between ${MIN_ARENA_WIDTH} and ${MAX_ARENA_WIDTH}.` });
  }
  if (definition.grid.height !== height) {
    issues.push({ severity: "error", code: "height_invalid", message: `Height must be odd and between ${MIN_ARENA_HEIGHT} and ${MAX_ARENA_HEIGHT}.` });
  }

  if (normalized.spawns.length !== ALL_PLAYER_IDS.length) {
    issues.push({ severity: "error", code: "spawn_count_invalid", message: "Exactly four spawn points are required." });
  }

  const occupiedSpawns = new Set<string>();
  for (const spawn of normalized.spawns) {
    const key = tileKey(spawn.tile.x, spawn.tile.y);
    if (occupiedSpawns.has(key)) {
      issues.push({ severity: "error", code: "spawn_overlap", message: `Spawn ${spawn.playerId} overlaps another spawn.` });
    }
    occupiedSpawns.add(key);
    if (!isInteriorTile(spawn.tile.x, spawn.tile.y, width, height)) {
      issues.push({ severity: "error", code: "spawn_border", message: `Spawn ${spawn.playerId} must be inside the arena border.` });
    }
    if (normalized.tiles.solid.includes(key) || normalized.tiles.breakable.includes(key)) {
      issues.push({ severity: "error", code: "spawn_blocked", message: `Spawn ${spawn.playerId} is blocked by a placed tile.` });
    }
    if (countOpenSpawnNeighbors(spawn.tile, normalized) < 2) {
      issues.push({ severity: "error", code: "spawn_safety", message: `Spawn ${spawn.playerId} needs at least two open adjacent tiles.` });
    }
  }

  if (!hasReachableOpenField(normalized)) {
    issues.push({ severity: "error", code: "arena_disconnected", message: "Open arena tiles must stay reachable as one connected field." });
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

export function isWrapPortalTile(x: number, y: number, config?: Pick<ArenaRuntimeConfig, "wrapPortals">): boolean {
  if (config) {
    return config.wrapPortals.some((tile) => tile.x === x && tile.y === y);
  }
  return createWrapPortalTiles(GRID_WIDTH, GRID_HEIGHT).some((tile) => tile.x === x && tile.y === y);
}

export async function fetchActiveArenaDefinition(): Promise<ArenaDefinition> {
  if (typeof fetch === "undefined") {
    return createDefaultArenaDefinition();
  }
  try {
    const response = await fetch("/api/arena/active", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      return createDefaultArenaDefinition();
    }
    const payload = await response.json() as ActiveArenaResponse;
    if (!payload?.arena) {
      return createDefaultArenaDefinition();
    }
    return normalizeArenaDefinition(payload.arena);
  } catch {
    return createDefaultArenaDefinition();
  }
}

function clampOddDimension(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : max;
  const clamped = Math.max(min, Math.min(max, normalized));
  return clamped % 2 === 0 ? Math.max(min, clamped - 1) : clamped;
}

function sanitizeTileList(
  keys: string[],
  width: number,
  height: number,
  disallow?: Set<string>,
): string[] {
  const unique = new Set<string>();
  for (const key of keys) {
    const tile = parseTileKey(key);
    if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) {
      continue;
    }
    if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) {
      continue;
    }
    const nextKey = tileKey(tile.x, tile.y);
    if (disallow?.has(nextKey)) {
      continue;
    }
    unique.add(nextKey);
  }
  return [...unique].sort();
}

function normalizeSpawns(spawns: ArenaSpawnDefinition[], width: number, height: number): ArenaSpawnDefinition[] {
  const defaults = createDefaultSpawns(width, height);
  const resolved = ALL_PLAYER_IDS.map((playerId, index) => {
    const input = spawns.find((spawn) => spawn.playerId === playerId) ?? defaults[index];
    return {
      playerId,
      direction: input.direction,
      tile: {
        x: Math.max(1, Math.min(width - 2, Math.floor(input.tile.x))),
        y: Math.max(1, Math.min(height - 2, Math.floor(input.tile.y))),
      },
    };
  });
  return resolved;
}

function createDefaultSpawns(width: number, height: number): ArenaSpawnDefinition[] {
  return [
    { playerId: 1, tile: { x: 1, y: 1 }, direction: "down" },
    { playerId: 2, tile: { x: width - 2, y: 1 }, direction: "down" },
    { playerId: 3, tile: { x: 1, y: height - 2 }, direction: "up" },
    { playerId: 4, tile: { x: width - 2, y: height - 2 }, direction: "up" },
  ];
}

function createDefaultSolidTiles(width: number, height: number): string[] {
  const solid = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (isBorder) {
        if (isSparseBorderWall(x, y, width, height) && !isWrapPortalTileForDimensions(x, y, width, height)) {
          solid.add(tileKey(x, y));
        }
      }
    }
  }

  const seeds: TileCoord[] = [
    { x: 3, y: 3 },
    { x: 5, y: 3 },
    { x: 2, y: 4 },
    { x: 4, y: 2 },
  ];
  for (const seed of seeds) {
    if (!isInteriorTile(seed.x, seed.y, width, height)) {
      continue;
    }
    solid.add(tileKey(seed.x, seed.y));
    const mirrored = mirrorTile(seed, width, height);
    if (isInteriorTile(mirrored.x, mirrored.y, width, height)) {
      solid.add(tileKey(mirrored.x, mirrored.y));
    }
  }
  return [...solid].sort();
}

function createDefaultBreakableTiles(width: number, height: number, solidKeys: string[]): string[] {
  const solid = new Set(solidKeys);
  const breakable = new Set<string>();
  const spawnSafe = createSpawnSafeTiles(width, height);
  const strategicOpen = createStrategicOpenTiles(width, height);
  const forcedBreakables = createForcedBreakableTiles(width, height, solid, spawnSafe, strategicOpen);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const key = tileKey(x, y);
      if (solid.has(key) || spawnSafe.has(key) || strategicOpen.has(key)) {
        continue;
      }
      if (forcedBreakables.has(key) || shouldPlaceBreakableTile({ x, y }, width, height, 0.97)) {
        breakable.add(key);
      }
    }
  }
  return [...breakable].sort();
}

function createPowerUpsFromBreakables(breakable: Set<string>, config: ArenaRuntimeConfig): PowerUpState[] {
  const dropPool: readonly PowerUpType[] = [
    "speed-up",
    "speed-up",
    "speed-up",
    "bomb-up",
    "bomb-up",
    "flame-up",
    "flame-up",
    "remote-up",
  ];
  const powerUps: PowerUpState[] = [];
  const breakableKeys = [...breakable].sort();
  const pairMap = new Map<string, { tile: TileCoord; mirroredTile: TileCoord; mirroredExists: boolean }>();

  for (const key of breakableKeys) {
    const tile = parseTileKey(key);
    const mirroredTile = mirrorTile(tile, config.grid.width, config.grid.height);
    const mirroredKey = tileKey(mirroredTile.x, mirroredTile.y);
    const pairKey = key <= mirroredKey ? `${key}|${mirroredKey}` : `${mirroredKey}|${key}`;
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, {
        tile,
        mirroredTile,
        mirroredExists: mirroredKey !== key && breakable.has(mirroredKey),
      });
    }
  }

  const pairEntries = [...pairMap.entries()]
    .map(([pairKey, pair]) => ({
      pairKey,
      pair,
      order: hashToUnit(`${config.version}|${pairKey}|order`),
    }))
    .sort((a, b) => (a.order - b.order) || a.pairKey.localeCompare(b.pairKey));

  const dropPairCount = Math.floor(pairEntries.length * BREAKABLE_POWERUP_DROP_RATE);
  for (let index = 0; index < dropPairCount; index += 1) {
    const { pairKey, pair } = pairEntries[index];
    const typeIndex = Math.floor(hashToUnit(`${config.version}|${pairKey}|type`) * dropPool.length);
    const type = dropPool[Math.max(0, Math.min(dropPool.length - 1, typeIndex))];
    powerUps.push({
      tile: { ...pair.tile },
      type,
      revealed: false,
      collected: false,
    });
    if (pair.mirroredExists) {
      powerUps.push({
        tile: { ...pair.mirroredTile },
        type,
        revealed: false,
        collected: false,
      });
    }
  }

  return powerUps;
}

function createWrapPortalTiles(width: number, height: number): TileCoord[] {
  const middleX = Math.floor(width / 2);
  const middleY = Math.floor(height / 2);
  return [
    { x: 0, y: middleY },
    { x: width - 1, y: middleY },
    { x: middleX, y: 0 },
    { x: middleX, y: height - 1 },
  ];
}

function buildSuddenDeathPath(width: number, height: number, solid: Set<string>): TileCoord[] {
  const spiral: TileCoord[] = [];
  let left = 0;
  let right = width - 1;
  let top = 0;
  let bottom = height - 1;

  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x += 1) {
      spiral.push({ x, y: top });
    }
    for (let y = top + 1; y <= bottom; y += 1) {
      spiral.push({ x: right, y });
    }
    if (bottom > top) {
      for (let x = right - 1; x >= left; x -= 1) {
        spiral.push({ x, y: bottom });
      }
    }
    if (right > left) {
      for (let y = bottom - 1; y > top; y -= 1) {
        spiral.push({ x: left, y });
      }
    }
    left += 1;
    right -= 1;
    top += 1;
    bottom -= 1;
  }

  return spiral.filter((tile) => !solid.has(tileKey(tile.x, tile.y)));
}

function createSpawnSafeTiles(width: number, height: number): Set<string> {
  const safe = new Set<string>();
  const add = (x: number, y: number): void => {
    if (!isInteriorTile(x, y, width, height)) {
      return;
    }
    safe.add(tileKey(x, y));
  };
  for (const spawn of createDefaultSpawns(width, height)) {
    add(spawn.tile.x, spawn.tile.y);
    add(spawn.tile.x + 1, spawn.tile.y);
    add(spawn.tile.x - 1, spawn.tile.y);
    add(spawn.tile.x, spawn.tile.y + (spawn.playerId <= 2 ? 1 : -1));
  }
  return safe;
}

function createStrategicOpenTiles(width: number, height: number): Set<string> {
  const open = new Set<string>();
  const add = (x: number, y: number): void => {
    if (!isInteriorTile(x, y, width, height)) {
      return;
    }
    open.add(tileKey(x, y));
  };
  const middleX = Math.floor(width / 2);
  const middleY = Math.floor(height / 2);
  [
    { x: middleX, y: middleY },
    { x: middleX - 1, y: middleY },
    { x: middleX + 1, y: middleY },
    { x: middleX, y: middleY - 1 },
    { x: middleX, y: middleY + 1 },
    { x: 1, y: middleY },
    { x: Math.min(2, width - 2), y: middleY },
    { x: width - 2, y: middleY },
    { x: Math.max(width - 3, 1), y: middleY },
    { x: middleX, y: 1 },
    { x: middleX, y: height - 2 },
  ].forEach((tile) => add(tile.x, tile.y));
  return open;
}

function createForcedBreakableTiles(
  width: number,
  height: number,
  solid: Set<string>,
  spawnSafe: Set<string>,
  strategicOpen: Set<string>,
): Set<string> {
  const forced = new Set<string>();
  const candidates: TileCoord[] = [
    { x: 2, y: 3 },
    { x: width - 3, y: 3 },
    { x: 2, y: height - 4 },
    { x: width - 3, y: height - 4 },
  ];
  for (const tile of candidates) {
    if (!isInteriorTile(tile.x, tile.y, width, height)) {
      continue;
    }
    const key = tileKey(tile.x, tile.y);
    if (solid.has(key) || spawnSafe.has(key) || strategicOpen.has(key)) {
      continue;
    }
    forced.add(key);
  }
  return forced;
}

function shouldPlaceBreakableTile(tile: TileCoord, width: number, height: number, density: number): boolean {
  const variants = [
    tileKey(tile.x, tile.y),
    tileKey(width - 1 - tile.x, tile.y),
    tileKey(tile.x, height - 1 - tile.y),
    tileKey(width - 1 - tile.x, height - 1 - tile.y),
  ].sort();
  return hashToUnit(`${variants[0]}|breakable`) < density;
}

function isSparseBorderWall(x: number, y: number, width: number, height: number): boolean {
  if (y === 0 || y === height - 1) {
    return x % 2 === 0;
  }
  if (x === 0 || x === width - 1) {
    return y % 2 === 0;
  }
  return false;
}

function isWrapPortalTileForDimensions(x: number, y: number, width: number, height: number): boolean {
  return createWrapPortalTiles(width, height).some((tile) => tile.x === x && tile.y === y);
}

function mirrorTile(tile: TileCoord, width: number, height: number): TileCoord {
  return {
    x: width - 1 - tile.x,
    y: height - 1 - tile.y,
  };
}

function isInteriorTile(x: number, y: number, width: number, height: number): boolean {
  return x > 0 && y > 0 && x < width - 1 && y < height - 1;
}

function countOpenSpawnNeighbors(tile: TileCoord, definition: ArenaDefinition): number {
  const blocked = new Set([...definition.tiles.solid, ...definition.tiles.breakable]);
  const neighbors = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ];
  return neighbors.filter((neighbor) => (
    neighbor.x >= 0
    && neighbor.y >= 0
    && neighbor.x < definition.grid.width
    && neighbor.y < definition.grid.height
    && !blocked.has(tileKey(neighbor.x, neighbor.y))
  )).length;
}

function hasReachableOpenField(definition: ArenaDefinition): boolean {
  const blocked = new Set(definition.tiles.solid);
  const openTiles: TileCoord[] = [];
  const { width, height } = definition.grid;
  for (let y = 0; y < definition.grid.height; y += 1) {
    for (let x = 0; x < definition.grid.width; x += 1) {
      if (!isInteriorTile(x, y, width, height) && !isWrapPortalTileForDimensions(x, y, width, height)) {
        continue;
      }
      const key = tileKey(x, y);
      if (!blocked.has(key)) {
        openTiles.push({ x, y });
      }
    }
  }
  if (openTiles.length === 0) {
    return false;
  }

  const start = openTiles[0];
  const visited = new Set<string>([tileKey(start.x, start.y)]);
  const queue: TileCoord[] = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= definition.grid.width || neighbor.y >= definition.grid.height) {
        continue;
      }
      if (!isInteriorTile(neighbor.x, neighbor.y, width, height) && !isWrapPortalTileForDimensions(neighbor.x, neighbor.y, width, height)) {
        continue;
      }
      const key = tileKey(neighbor.x, neighbor.y);
      if (blocked.has(key) || visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push(neighbor);
    }
  }

  return visited.size === openTiles.length;
}

function hashToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
