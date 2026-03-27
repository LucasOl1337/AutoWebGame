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

export function createArena(): ArenaState {
  const solid = new Set<string>();
  const breakable = new Set<string>();
  const middleX = Math.floor(GRID_WIDTH / 2);
  const middleY = Math.floor(GRID_HEIGHT / 2);

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const isBorder = x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1;
      const isPillar = x % 2 === 1 && y % 2 === 1;
      if (isBorder || isPillar) {
        solid.add(tileKey(x, y));
      }
    }
  }

  const powerUpCandidates = [
    { tile: { x: middleX - 2, y: middleY }, type: "bomb-up" },
    { tile: { x: middleX - 1, y: middleY - 1 }, type: "bomb-up" },
    { tile: { x: middleX - 1, y: middleY + 1 }, type: "flame-up" },
    { tile: { x: middleX, y: sideRowForPowerUps(GRID_HEIGHT) }, type: "flame-up" },
    { tile: { x: middleX + 1, y: middleY - 1 }, type: "speed-up" },
    { tile: { x: middleX, y: middleY - 2 }, type: "remote-up" },
    { tile: { x: middleX + 1, y: middleY + 1 }, type: "shield-up" },
    { tile: { x: middleX - 2, y: middleY - 2 }, type: "bomb-pass-up" },
    { tile: { x: middleX + 2, y: middleY + 2 }, type: "kick-up" },
  ] as const;
  const powerUpPairs: Array<{ tile: TileCoord; type: PowerUpType }> = powerUpCandidates
    .filter((entry) => entry.tile.x > 0 && entry.tile.y > 0 && entry.tile.x < GRID_WIDTH - 1 && entry.tile.y < GRID_HEIGHT - 1)
    .map((entry) => ({ tile: { ...entry.tile }, type: entry.type }));

  const powerUps: PowerUpState[] = [];
  for (const entry of powerUpPairs) {
    const reflected = mirrorTile(entry.tile);
    powerUps.push(createPowerUp(entry.tile, entry.type));
    powerUps.push(createPowerUp(reflected, entry.type));
  }

  const forcedBreakables = new Set<string>(powerUps.map((powerUp) => tileKey(powerUp.tile.x, powerUp.tile.y)));
  const openTiles = createOpenTiles();

  for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
    for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
      const key = tileKey(x, y);
      if (solid.has(key)) {
        continue;
      }
      if (forcedBreakables.has(key)) {
        breakable.add(key);
        continue;
      }
      if (!openTiles.has(key)) {
        breakable.add(key);
      }
    }
  }

  return { solid, breakable, powerUps };
}

function sideRowForPowerUps(height: number): number {
  return Math.min(2, height - 3);
}

function createPowerUp(tile: TileCoord, type: PowerUpType): PowerUpState {
  return {
    tile,
    type,
    revealed: false,
    collected: false,
  };
}

function createOpenTiles(): Set<string> {
  const openTiles = new Set<string>();
  const middleX = Math.floor(GRID_WIDTH / 2);
  const middleY = Math.floor(GRID_HEIGHT / 2);
  const sideColumn = Math.min(2, GRID_WIDTH - 3);
  const farSideColumn = Math.max(GRID_WIDTH - 3, sideColumn + 1);
  const sideRow = Math.min(2, GRID_HEIGHT - 3);
  const farSideRow = Math.max(GRID_HEIGHT - 3, sideRow + 1);

  const add = (x: number, y: number): void => {
    if (x <= 0 || y <= 0 || x >= GRID_WIDTH - 1 || y >= GRID_HEIGHT - 1) {
      return;
    }
    openTiles.add(tileKey(x, y));
  };

  const addRow = (y: number, fromX = 1, toX = GRID_WIDTH - 2): void => {
    for (let x = fromX; x <= toX; x += 1) {
      add(x, y);
    }
  };

  const addColumn = (x: number, fromY = 1, toY = GRID_HEIGHT - 2): void => {
    for (let y = fromY; y <= toY; y += 1) {
      add(x, y);
    }
  };

  // Larger spawn bubbles reduce instant-death rounds on compact arenas.
  const addSpawnZone = (originX: number, originY: number, dirX: number, dirY: number): void => {
    for (let oy = 0; oy <= 3; oy += 1) {
      for (let ox = 0; ox <= 3; ox += 1) {
        const x = originX + ox * dirX;
        const y = originY + oy * dirY;
        if (Math.abs(ox) + Math.abs(oy) <= 5) {
          add(x, y);
        }
      }
    }
  };
  addSpawnZone(1, 1, 1, 1);
  addSpawnZone(GRID_WIDTH - 2, 1, -1, 1);
  addSpawnZone(1, GRID_HEIGHT - 2, 1, -1);
  addSpawnZone(GRID_WIDTH - 2, GRID_HEIGHT - 2, -1, -1);

  // Main combat lanes: quick spawn exits plus a contested central cross.
  addRow(sideRow);
  addRow(middleY);
  addRow(farSideRow);
  addColumn(sideColumn);
  addColumn(farSideColumn);
  addColumn(middleX);

  // Extra center flanks keep pressure rotating instead of stalling into
  // long farm corridors on the far edges.
  [
    { x: middleX - 2, y: sideRow + 1 },
    { x: middleX + 2, y: sideRow + 1 },
    { x: middleX - 2, y: sideRow + 2 },
    { x: middleX + 2, y: sideRow + 2 },
    { x: middleX - 2, y: middleY - 1 },
    { x: middleX - 1, y: middleY - 1 },
    { x: middleX, y: middleY - 1 },
    { x: middleX + 1, y: middleY - 1 },
    { x: middleX + 2, y: middleY - 1 },
    { x: middleX - 2, y: middleY },
    { x: middleX + 2, y: middleY },
    { x: middleX - 2, y: middleY + 1 },
    { x: middleX - 1, y: middleY + 1 },
    { x: middleX, y: middleY + 1 },
    { x: middleX + 1, y: middleY + 1 },
    { x: middleX + 2, y: middleY + 1 },
    { x: middleX - 2, y: farSideRow - 2 },
    { x: middleX + 2, y: farSideRow - 2 },
    { x: middleX - 2, y: farSideRow - 1 },
    { x: middleX + 2, y: farSideRow - 1 },
    { x: middleX - 3, y: middleY },
    { x: middleX + 3, y: middleY },
    { x: middleX - 3, y: middleY - 1 },
    { x: middleX + 3, y: middleY - 1 },
    { x: middleX - 3, y: middleY + 1 },
    { x: middleX + 3, y: middleY + 1 },
    { x: middleX, y: sideRow + 1 },
    { x: middleX, y: farSideRow - 1 },
  ].forEach((tile) => add(tile.x, tile.y));

  return openTiles;
}
