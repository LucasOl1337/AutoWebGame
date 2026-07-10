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
export const SUDDEN_DEATH_TICK_MS = 800;

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
  const directionDeltas: TileCoord[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  for (const delta of directionDeltas) {
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
