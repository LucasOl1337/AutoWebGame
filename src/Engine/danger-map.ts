import { BOMB_FUSE_MS } from "../PersonalConfig/config";
import type {
  ArenaState,
  BombState,
  FlameState,
  TileCoord,
} from "../Gameplay/types";
import { tileKey } from "../Arenas/arena";

export const DANGER_FORECAST_BOMB_FUSE_BUFFER_MS = 1000;
export const SUDDEN_DEATH_FALL_MS = 340;
export const SUDDEN_DEATH_TICK_MS = 900;

const BOMB_BLAST_DIRECTION_DELTAS: readonly TileCoord[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export interface DangerMapContext {
  bombs: BombState[];
  flames: FlameState[];
  arena: ArenaState;
  suddenDeathActive: boolean;
  suddenDeathTickMs: number;
  suddenDeathIndex: number;
  suddenDeathPath: TileCoord[];
  suddenDeathClosureEffects: Array<{ tile: TileCoord; elapsedMs: number; impacted: boolean }>;
}

export interface ProjectedBomb {
  tile: TileCoord;
  range: number;
  fuseMs: number;
}

interface BombDangerProjection {
  tile: TileCoord;
  fuseMs: number;
  blastKeys: Set<string>;
}

interface FuseQueueEntry {
  bombIndex: number;
  fuseMs: number;
}

function pushFuseEntry(queue: FuseQueueEntry[], entry: FuseQueueEntry): void {
  queue.push(entry);
  let index = queue.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (queue[parentIndex].fuseMs <= entry.fuseMs) {
      break;
    }
    queue[index] = queue[parentIndex];
    index = parentIndex;
  }
  queue[index] = entry;
}

function popFuseEntry(queue: FuseQueueEntry[]): FuseQueueEntry | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || queue.length === 0) {
    return first;
  }

  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    if (leftIndex >= queue.length) {
      break;
    }
    const rightIndex = leftIndex + 1;
    const childIndex = rightIndex < queue.length
      && queue[rightIndex].fuseMs < queue[leftIndex].fuseMs
      ? rightIndex
      : leftIndex;
    if (queue[childIndex].fuseMs >= last.fuseMs) {
      break;
    }
    queue[index] = queue[childIndex];
    index = childIndex;
  }
  queue[index] = last;
  return first;
}

function propagateChainReactionFuses(bombs: BombDangerProjection[]): void {
  const bombIndexesByTile = new Map<string, number[]>();
  bombs.forEach((bomb, bombIndex) => {
    const key = tileKey(bomb.tile.x, bomb.tile.y);
    const indexes = bombIndexesByTile.get(key);
    if (indexes) {
      indexes.push(bombIndex);
    } else {
      bombIndexesByTile.set(key, [bombIndex]);
    }
  });

  const triggeredBombIndexes = bombs.map((source, sourceIndex) => {
    const targets: number[] = [];
    for (const blastKey of source.blastKeys) {
      for (const targetIndex of bombIndexesByTile.get(blastKey) ?? []) {
        if (targetIndex !== sourceIndex) {
          targets.push(targetIndex);
        }
      }
    }
    return targets;
  });

  const queue: FuseQueueEntry[] = [];
  bombs.forEach((bomb, bombIndex) => {
    pushFuseEntry(queue, { bombIndex, fuseMs: bomb.fuseMs });
  });

  while (queue.length > 0) {
    const entry = popFuseEntry(queue);
    if (!entry || entry.fuseMs !== bombs[entry.bombIndex].fuseMs) {
      continue;
    }
    for (const targetIndex of triggeredBombIndexes[entry.bombIndex]) {
      if (bombs[targetIndex].fuseMs <= entry.fuseMs) {
        continue;
      }
      bombs[targetIndex].fuseMs = entry.fuseMs;
      pushFuseEntry(queue, { bombIndex: targetIndex, fuseMs: entry.fuseMs });
    }
  }
}

export function buildDangerMap(
  context: DangerMapContext,
  extraBomb?: ProjectedBomb,
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

  const bombsToProject = context.bombs
    .filter((bomb) => bomb.fuseMs <= BOMB_FUSE_MS + DANGER_FORECAST_BOMB_FUSE_BUFFER_MS)
    .map((bomb) => ({
      tile: bomb.tile,
      fuseMs: Math.max(0, bomb.fuseMs),
      blastKeys: getBombBlastKeys(bomb.tile, bomb.flameRange, context.arena),
    }));

  if (extraBomb) {
    bombsToProject.push({
      tile: extraBomb.tile,
      fuseMs: Math.max(0, extraBomb.fuseMs),
      blastKeys: getBombBlastKeys(extraBomb.tile, extraBomb.range, context.arena),
    });
  }

  propagateChainReactionFuses(bombsToProject);

  for (const bomb of bombsToProject) {
    for (const key of bomb.blastKeys) {
      registerDanger(key, bomb.fuseMs);
    }
  }

  for (const effect of context.suddenDeathClosureEffects) {
    if (!effect.impacted) {
      registerDanger(
        tileKey(effect.tile.x, effect.tile.y),
        Math.max(0, SUDDEN_DEATH_FALL_MS - effect.elapsedMs),
      );
    }
  }

  if (context.suddenDeathActive && context.suddenDeathIndex < context.suddenDeathPath.length) {
    const nextTickMs = Math.max(0, context.suddenDeathTickMs);
    for (let index = context.suddenDeathIndex; index < context.suddenDeathPath.length; index += 1) {
      const tile = context.suddenDeathPath[index];
      registerDanger(
        tileKey(tile.x, tile.y),
        nextTickMs + (index - context.suddenDeathIndex) * SUDDEN_DEATH_TICK_MS,
      );
    }
  }

  return danger;
}

export function getBombBlastKeys(
  origin: TileCoord,
  range: number,
  arena: Pick<ArenaState, "config" | "solid" | "breakable">,
): Set<string> {
  const keys = new Set<string>([tileKey(origin.x, origin.y)]);
  const arenaWidth = arena.config.grid.width;
  const arenaHeight = arena.config.grid.height;
  for (const delta of BOMB_BLAST_DIRECTION_DELTAS) {
    for (let step = 1; step <= range; step += 1) {
      const x = origin.x + delta.x * step;
      const y = origin.y + delta.y * step;
      if (x < 0 || y < 0 || x >= arenaWidth || y >= arenaHeight) {
        break;
      }
      const key = tileKey(x, y);
      if (arena.solid.has(key)) {
        break;
      }
      keys.add(key);
      if (arena.breakable.has(key)) {
        break;
      }
    }
  }

  return keys;
}
