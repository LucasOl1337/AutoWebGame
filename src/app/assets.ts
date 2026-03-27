import type { Direction, PlayerId, PowerUpType } from "../core/types";
import { assetUrl } from "./asset-url";

export interface DirectionalSprites {
  up: HTMLImageElement | null;
  down: HTMLImageElement | null;
  left: HTMLImageElement | null;
  right: HTMLImageElement | null;
  idle: Record<Direction, HTMLImageElement[]>;
  walk: Record<Direction, HTMLImageElement[]>;
}

export interface CharacterRosterEntry {
  id: string;
  name: string;
  size: { width: number; height: number } | null;
  sprites: DirectionalSprites;
  animations?: {
    idle?: boolean;
    walk?: boolean;
  };
  pinned?: boolean;
  defaultSlot?: PlayerId;
  order?: number;
}

export interface GameAssets {
  players: Record<PlayerId, DirectionalSprites>;
  characterRoster?: CharacterRosterEntry[];
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
  powerUps: Partial<Record<PowerUpType, HTMLImageElement | null>>;
}

interface CharacterManifestEntry {
  id: string;
  name: string;
  size?: { width: number; height: number } | null;
  animations?: {
    idle?: boolean;
    walk?: boolean;
  };
  pinned?: boolean;
  defaultSlot?: PlayerId;
  order?: number;
}

interface CharacterManifestPayload {
  characters?: CharacterManifestEntry[];
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
  return {
    up,
    down,
    left,
    right,
    idle: { up: [], down: [], left: [], right: [] },
    walk,
  };
}

async function loadStaticDirectionalSprites(
  basePath: string,
  animations?: { idle?: boolean; walk?: boolean },
): Promise<DirectionalSprites> {
  const [down, right, up, left] = await Promise.all([
    loadImage(`${basePath}/south.png`),
    loadImage(`${basePath}/east.png`),
    loadImage(`${basePath}/north.png`),
    loadImage(`${basePath}/west.png`),
  ]);
  return {
    up,
    down,
    left,
    right,
    idle: animations?.idle ? await loadCharacterCycle(basePath, "idle") : { up: [], down: [], left: [], right: [] },
    walk: animations?.walk ? await loadCharacterCycle(basePath, "walk") : { up: [], down: [], left: [], right: [] },
  };
}

async function loadWalkCycle(prefix: string): Promise<Record<Direction, HTMLImageElement[]>> {
  return loadCycleFromTemplate((suffix, index) => `${prefix}-walk-${suffix}-${index}.png`);
}

async function loadCharacterCycle(
  basePath: string,
  animationName: "idle" | "walk",
): Promise<Record<Direction, HTMLImageElement[]>> {
  return loadCycleFromTemplate((suffix, index) => `${basePath}/${animationName}-${suffix}-${index}.png`);
}

async function loadCycleFromTemplate(
  buildPath: (suffix: string, index: number) => string,
): Promise<Record<Direction, HTMLImageElement[]>> {
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
        Array.from({ length: 12 }, (_, index) => loadImage(buildPath(suffix, index))),
      );
      walk[key] = frames.filter((frame): frame is HTMLImageElement => frame !== null);
    }),
  );

  return walk;
}

async function loadCharacterManifest(): Promise<CharacterManifestEntry[]> {
  try {
    const response = await fetch(assetUrl("/assets/characters/manifest.json"), { cache: "force-cache" });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json() as CharacterManifestPayload;
    return Array.isArray(payload.characters) ? payload.characters : [];
  } catch {
    return [];
  }
}

async function loadCharacterRoster(): Promise<CharacterRosterEntry[]> {
  const manifestEntries = await loadCharacterManifest();
  const sortedEntries = [...manifestEntries].sort((a, b) => {
    const orderA = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name);
  });

  const rosterEntries: Array<CharacterRosterEntry | null> = await Promise.all(sortedEntries.map(async (entry) => {
    if (!entry.id) {
      return null;
    }
    const sprites = await loadStaticDirectionalSprites(assetUrl(`/assets/characters/${entry.id}`), entry.animations);
    if (!sprites.down && !sprites.up && !sprites.left && !sprites.right) {
      return null;
    }
    return {
      id: entry.id,
      name: entry.name || entry.id.slice(0, 8),
      size: entry.size ?? null,
      sprites,
      animations: entry.animations,
      pinned: entry.pinned === true,
      defaultSlot: entry.defaultSlot,
      order: entry.order,
    } satisfies CharacterRosterEntry;
  }));

  return rosterEntries.filter((entry): entry is CharacterRosterEntry => entry !== null);
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [
    playerOne,
    playerTwo,
    characterRosterFromManifest,
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
    remoteUp,
    shieldUp,
    bombPassUp,
    kickUp,
  ] = await Promise.all([
    loadDirectionalSprites(assetUrl("/assets/sprites/player1"), ["hires", ""]),
    loadDirectionalSprites(assetUrl("/assets/sprites/player2")),
    loadCharacterRoster(),
    loadImage(assetUrl("/assets/tiles/floor-base.png")),
    loadImage(assetUrl("/assets/tiles/floor-alt.png")),
    loadImage(assetUrl("/assets/tiles/floor-spawn.png")),
    loadImage(assetUrl("/assets/tiles/wall.png")),
    loadImage(assetUrl("/assets/tiles/crate.png")),
    loadImage(assetUrl("/assets/sprites/bomb.png")),
    loadImage(assetUrl("/assets/sprites/flame.png")),
    loadImage(assetUrl("/assets/ui/power-bomb.png")),
    loadImage(assetUrl("/assets/ui/power-flame.png")),
    loadImage(assetUrl("/assets/ui/power-speed.png")),
    loadImage(assetUrl("/assets/ui/power-remote.png")),
    loadImage(assetUrl("/assets/ui/power-shield.png")),
    loadImage(assetUrl("/assets/ui/power-bomb-pass.png")),
    loadImage(assetUrl("/assets/ui/power-kick.png")),
  ]);

  const fallbackRoster: CharacterRosterEntry[] = [
    {
      id: "default-p1",
      name: "Mistbridge Ranger Cyan",
      size: null,
      sprites: playerOne,
      pinned: true,
      defaultSlot: 1,
      order: 0,
    },
    {
      id: "default-p2",
      name: "Mistbridge Ranger Amber",
      size: null,
      sprites: playerTwo,
      pinned: true,
      defaultSlot: 2,
      order: 1,
    },
  ];

  return {
    players: {
      1: playerOne,
      2: playerTwo,
    },
    characterRoster: characterRosterFromManifest.length > 0
      ? characterRosterFromManifest
      : fallbackRoster,
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
      "remote-up": remoteUp,
      "shield-up": shieldUp,
      "bomb-pass-up": bombPassUp,
      "kick-up": kickUp,
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
