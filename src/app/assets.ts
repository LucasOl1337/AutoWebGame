import type { Direction, PlayerId, PowerUpType } from "../core/types";

export interface DirectionalSprites {
  up: HTMLImageElement | null;
  down: HTMLImageElement | null;
  left: HTMLImageElement | null;
  right: HTMLImageElement | null;
  walk: Record<Direction, HTMLImageElement[]>;
}

export interface GameAssets {
  players: Record<PlayerId, DirectionalSprites>;
  floor: {
    base: HTMLImageElement | null;
    lane: HTMLImageElement | null;
    spawn: HTMLImageElement | null;
  };
  props: {
    wall: HTMLImageElement | null;
    crate: HTMLImageElement | null;
    bomb: HTMLImageElement | null;
    flame: HTMLImageElement | null;
  };
  powerUps: Record<PowerUpType, HTMLImageElement | null>;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode();
      } catch {
        // Ignore decode failure and still use the loaded element.
      }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadFirstAvailableImage(paths: string[]): Promise<HTMLImageElement | null> {
  for (const path of paths) {
    const image = await loadImage(path);
    if (image) {
      return image;
    }
  }
  return null;
}

async function loadDirectionalSprites(prefix: string, baseVariants: string[] = [""]): Promise<DirectionalSprites> {
  const fileCandidates = (suffix: string): string[] => baseVariants.map((variant) => (
    variant.length > 0 ? `${prefix}-${suffix}-${variant}.png` : `${prefix}-${suffix}.png`
  ));
  const [down, right, up, left] = await Promise.all([
    loadFirstAvailableImage(fileCandidates("south")),
    loadFirstAvailableImage(fileCandidates("east")),
    loadFirstAvailableImage(fileCandidates("north")),
    loadFirstAvailableImage(fileCandidates("west")),
  ]);

  const walk = await loadWalkCycle(prefix);
  return { up, down, left, right, walk };
}

async function loadWalkCycle(prefix: string): Promise<Record<Direction, HTMLImageElement[]>> {
  const directions: Array<{ key: Direction; suffix: string }> = [
    { key: "down", suffix: "south" },
    { key: "right", suffix: "east" },
    { key: "up", suffix: "north" },
    { key: "left", suffix: "west" },
  ];
  const walk: Record<Direction, HTMLImageElement[]> = {
    up: [],
    down: [],
    left: [],
    right: [],
  };

  await Promise.all(
    directions.map(async ({ key, suffix }) => {
      const frames = await Promise.all(
        Array.from({ length: 12 }, (_, index) => loadImage(`${prefix}-walk-${suffix}-${index}.png`)),
      );
      walk[key] = frames.filter((frame): frame is HTMLImageElement => frame !== null);
    }),
  );

  return walk;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [
    playerOne,
    playerTwo,
    floorBase,
    floorLane,
    floorSpawn,
    wall,
    crate,
    bomb,
    flame,
    bombUp,
    flameUp,
    speedUp,
  ] = await Promise.all([
    loadDirectionalSprites("/assets/sprites/player1", ["hires", ""]),
    loadDirectionalSprites("/assets/sprites/player2"),
    loadImage("/assets/tiles/floor-base.png"),
    loadImage("/assets/tiles/floor-alt.png"),
    loadImage("/assets/tiles/floor-spawn.png"),
    loadImage("/assets/tiles/wall.png"),
    loadImage("/assets/tiles/crate.png"),
    loadImage("/assets/sprites/bomb.png"),
    loadImage("/assets/sprites/flame.png"),
    loadImage("/assets/ui/power-bomb.png"),
    loadImage("/assets/ui/power-flame.png"),
    loadImage("/assets/ui/power-speed.png"),
  ]);

  return {
    players: {
      1: playerOne,
      2: playerTwo,
    },
    floor: {
      base: floorBase,
      lane: floorLane,
      spawn: floorSpawn,
    },
    props: {
      wall,
      crate,
      bomb,
      flame,
    },
    powerUps: {
      "bomb-up": bombUp,
      "flame-up": flameUp,
      "speed-up": speedUp,
    },
  };
}

export function spriteForDirection(
  sprites: DirectionalSprites,
  direction: Direction,
): HTMLImageElement | null {
  if (direction === "up") return sprites.up;
  if (direction === "down") return sprites.down;
  if (direction === "left") return sprites.left;
  return sprites.right;
}
