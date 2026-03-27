import { GRID_HEIGHT, GRID_WIDTH } from "../core/config";
import type { ArenaState, PowerUpState, PowerUpType, TileCoord } from "../core/types";

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function mirrorTile(tile: TileCoord): TileCoord {
  return {
    x: GRID_WIDTH - 1 - tile.x,
    y: GRID_HEIGHT - 1 - tile.y,
  };
}

export function isWrapPortalTile(x: number, y: number): boolean {
  const middleX = Math.floor(GRID_WIDTH / 2);
  const middleY = Math.floor(GRID_HEIGHT / 2);
  return (
    (y === middleY && (x === 0 || x === GRID_WIDTH - 1))
    || (x === middleX && (y === 0 || y === GRID_HEIGHT - 1))
  );
}

export function createArena(): ArenaState {
  const solid = createSolidTiles();
  const breakable = createBreakableTiles(solid);
  const powerUps = createPowerUpsFromBreakables(breakable);
  return { solid, breakable, powerUps };
}

function createPowerUp(tile: TileCoord, type: PowerUpType): PowerUpState {
  return {
    tile,
    type,
    revealed: false,
    collected: false,
  };
}

function createSolidTiles(): Set<string> {
  const solid = new Set<string>();
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const isBorder = x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1;
      if (isBorder) {
        if (isSparseBorderWall(x, y) && !isWrapPortalTile(x, y)) {
          solid.add(tileKey(x, y));
        }
      }
    }
  }

  // Keep only a few interior anchors, all spaced so no indestructible blocks touch.
  const anchorSeeds: TileCoord[] = [
    { x: 3, y: 3 },
    { x: 5, y: 3 },
    { x: 2, y: 4 },
    { x: 4, y: 2 },
  ];
  for (const seed of anchorSeeds) {
    const mirrored = mirrorTile(seed);
    [seed, mirrored].forEach((tile) => {
      if (tile.x <= 0 || tile.y <= 0 || tile.x >= GRID_WIDTH - 1 || tile.y >= GRID_HEIGHT - 1) {
        return;
      }
      solid.add(tileKey(tile.x, tile.y));
    });
  }
  return solid;
}

function createBreakableTiles(solid: Set<string>): Set<string> {
  const breakable = new Set<string>();
  const spawnSafe = createSpawnSafeTiles();
  const strategicOpen = createStrategicOpenTiles();
  const forcedBreakables = createForcedBreakableTiles(solid, spawnSafe, strategicOpen);

  for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
    for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
      const key = tileKey(x, y);
      if (solid.has(key) || spawnSafe.has(key) || strategicOpen.has(key)) {
        continue;
      }
      if (forcedBreakables.has(key) || shouldPlaceBreakableTile({ x, y }, 0.97)) {
        breakable.add(key);
      }
    }
  }
  return breakable;
}

function createSpawnSafeTiles(): Set<string> {
  const safe = new Set<string>();
  const add = (x: number, y: number): void => {
    if (x <= 0 || y <= 0 || x >= GRID_WIDTH - 1 || y >= GRID_HEIGHT - 1) {
      return;
    }
    safe.add(tileKey(x, y));
  };
  const spawns = [
    { x: 2, y: 1, sx: 1, sy: 1 },
    { x: GRID_WIDTH - 3, y: 1, sx: -1, sy: 1 },
    { x: 2, y: GRID_HEIGHT - 2, sx: 1, sy: -1 },
    { x: GRID_WIDTH - 3, y: GRID_HEIGHT - 2, sx: -1, sy: -1 },
  ] as const;
  for (const spawn of spawns) {
    add(spawn.x, spawn.y);
    add(spawn.x + spawn.sx, spawn.y);
    add(spawn.x - spawn.sx, spawn.y);
    add(spawn.x, spawn.y + spawn.sy);
  }
  return safe;
}

function createStrategicOpenTiles(): Set<string> {
  const open = new Set<string>();
  const add = (x: number, y: number): void => {
    if (x <= 0 || y <= 0 || x >= GRID_WIDTH - 1 || y >= GRID_HEIGHT - 1) {
      return;
    }
    open.add(tileKey(x, y));
  };
  const middleX = Math.floor(GRID_WIDTH / 2);
  const middleY = Math.floor(GRID_HEIGHT / 2);

  [
    { x: middleX, y: middleY },
    { x: middleX - 1, y: middleY },
    { x: middleX + 1, y: middleY },
    { x: middleX, y: middleY - 1 },
    { x: middleX, y: middleY + 1 },
    { x: 1, y: middleY },
    { x: 2, y: middleY },
    { x: GRID_WIDTH - 2, y: middleY },
    { x: GRID_WIDTH - 3, y: middleY },
    { x: middleX, y: 1 },
    { x: middleX, y: GRID_HEIGHT - 2 },
  ].forEach((tile) => add(tile.x, tile.y));
  return open;
}

function createForcedBreakableTiles(
  solid: Set<string>,
  spawnSafe: Set<string>,
  strategicOpen: Set<string>,
): Set<string> {
  const forced = new Set<string>();
  const candidates: TileCoord[] = [
    { x: 2, y: 3 },
    { x: GRID_WIDTH - 3, y: 3 },
    { x: 2, y: GRID_HEIGHT - 4 },
    { x: GRID_WIDTH - 3, y: GRID_HEIGHT - 4 },
  ];
  for (const tile of candidates) {
    const key = tileKey(tile.x, tile.y);
    if (solid.has(key) || spawnSafe.has(key) || strategicOpen.has(key)) {
      continue;
    }
    forced.add(key);
  }
  return forced;
}

function createPowerUpsFromBreakables(breakable: Set<string>): PowerUpState[] {
  // Weighted to make speed boots appear more often than rare utilities.
  const dropPool: readonly PowerUpType[] = [
    "speed-up",
    "speed-up",
    "speed-up",
    "bomb-up",
    "bomb-up",
    "flame-up",
    "flame-up",
    "remote-up",
    "shield-up",
    "bomb-pass-up",
    "kick-up",
  ];
  const powerUps: PowerUpState[] = [];
  const breakableKeys = [...breakable].sort();
  const pairMap = new Map<string, { tile: TileCoord; mirroredTile: TileCoord; mirroredExists: boolean }>();

  for (const key of breakableKeys) {
    const tile = parseTileKey(key);
    const mirroredTile = mirrorTile(tile);
    const mirroredKey = tileKey(mirroredTile.x, mirroredTile.y);
    const pairKey = key <= mirroredKey
      ? `${key}|${mirroredKey}`
      : `${mirroredKey}|${key}`;
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
      order: hashToUnit(`${pairKey}|order`),
    }))
    .sort((a, b) => (a.order - b.order) || a.pairKey.localeCompare(b.pairKey));

  // Enforce deterministic 50% drop rate on breakable pairs.
  const dropPairCount = Math.floor(pairEntries.length * 0.5);
  for (let index = 0; index < dropPairCount; index += 1) {
    const { pairKey, pair } = pairEntries[index];
    const typeIndex = Math.floor(hashToUnit(`${pairKey}|type`) * dropPool.length);
    const type = dropPool[Math.max(0, Math.min(dropPool.length - 1, typeIndex))];
    powerUps.push(createPowerUp(pair.tile, type));
    if (pair.mirroredExists) {
      powerUps.push(createPowerUp(pair.mirroredTile, type));
    }
  }

  return powerUps;
}

function shouldPlaceBreakableTile(tile: TileCoord, density: number): boolean {
  // Use horizontal+vertical reflection class so all 4 corners get equivalent crate layout.
  const variants = [
    tileKey(tile.x, tile.y),
    tileKey(GRID_WIDTH - 1 - tile.x, tile.y),
    tileKey(tile.x, GRID_HEIGHT - 1 - tile.y),
    tileKey(GRID_WIDTH - 1 - tile.x, GRID_HEIGHT - 1 - tile.y),
  ].sort();
  const symmetryKey = variants[0];
  return hashToUnit(`${symmetryKey}|breakable`) < density;
}

function isSparseBorderWall(x: number, y: number): boolean {
  if (y === 0 || y === GRID_HEIGHT - 1) {
    return x % 2 === 0;
  }
  if (x === 0 || x === GRID_WIDTH - 1) {
    return y % 2 === 0;
  }
  return false;
}

function parseTileKey(key: string): TileCoord {
  const [xText, yText] = key.split(",");
  return { x: Number(xText), y: Number(yText) };
}

function hashToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
