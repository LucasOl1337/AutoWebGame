import { GRID_HEIGHT, GRID_WIDTH } from "../output/esm/PersonalConfig/config.js";
import { createArena, tileKey } from "../output/esm/Arenas/arena.js";

const arena = createArena();
const spawns = arena.config.spawns.map((spawn) => ({ id: spawn.playerId, tile: spawn.tile }));

const neighbors = (tile) => ([
  { x: tile.x + 1, y: tile.y },
  { x: tile.x - 1, y: tile.y },
  { x: tile.x, y: tile.y + 1 },
  { x: tile.x, y: tile.y - 1 },
]);

const isInside = (tile) => (
  tile.x > 0 &&
  tile.y > 0 &&
  tile.x < GRID_WIDTH - 1 &&
  tile.y < GRID_HEIGHT - 1
);

const isPathable = (tile) => {
  if (!isInside(tile)) {
    return false;
  }
  const key = tileKey(tile.x, tile.y);
  return !arena.solid.has(key) && !arena.breakable.has(key);
};

function reachableOpenTiles(startTile) {
  const visited = new Set();
  const queue = [startTile];
  while (queue.length > 0) {
    const current = queue.shift();
    const key = tileKey(current.x, current.y);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    for (const next of neighbors(current)) {
      if (!isPathable(next)) {
        continue;
      }
      const nextKey = tileKey(next.x, next.y);
      if (!visited.has(nextKey)) {
        queue.push(next);
      }
    }
  }
  return visited.size;
}

const report = spawns.map(({ id, tile }) => {
  const spawnKey = tileKey(tile.x, tile.y);
  const freeNeighbors = neighbors(tile).filter(isPathable);
  return {
    id,
    tile,
    spawnPathable: !arena.solid.has(spawnKey) && !arena.breakable.has(spawnKey),
    freeNeighborCount: freeNeighbors.length,
    reachableOpenTiles: reachableOpenTiles(tile),
  };
});

console.log(JSON.stringify(report, null, 2));

const pass = report.every((entry) => (
  entry.spawnPathable &&
  entry.freeNeighborCount >= 2 &&
  entry.reachableOpenTiles >= 3
));

if (!pass) {
  process.exit(1);
}
