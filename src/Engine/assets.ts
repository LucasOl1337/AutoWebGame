import type { Direction, PlayerId, PowerUpType } from "../Gameplay/types";
import { assetUrl } from "./asset-url";
import type { ArenaThemeDefinition } from "../Arenas/arena-theme-library";
import { getArenaThemeById, resolveArenaTheme } from "../Arenas/arena-theme-library";
import { CHARACTER_ROSTER_MANIFEST } from "../Characters/Animations/character-roster-manifest";

export interface DirectionalSprites {
  up: HTMLImageElement | null;
  down: HTMLImageElement | null;
  left: HTMLImageElement | null;
  right: HTMLImageElement | null;
  idle: Record<Direction, HTMLImageElement[]>;
  walk: Record<Direction, HTMLImageElement[]>;
  run: Record<Direction, HTMLImageElement[]>;
  cast: Record<Direction, HTMLImageElement[]>;
  attack: Record<Direction, HTMLImageElement[]>;
  death: Record<Direction, HTMLImageElement[]>;
}

export interface CharacterRosterEntry {
  id: string;
  name: string;
  size: { width: number; height: number } | null;
  selectionIndex?: number;
  assetVersion?: string;
  sprites?: DirectionalSprites;
  animations?: {
    idle?: boolean;
    walk?: boolean;
    run?: boolean;
    cast?: boolean;
    attack?: boolean;
    death?: boolean;
  };
  pinned?: boolean;
  defaultSlot?: PlayerId;
  order?: number;
}

export interface GameAssets {
  players: Partial<Record<PlayerId, DirectionalSprites>>;
  characterRoster?: CharacterRosterEntry[];
  characterSpriteLoader: (entry: CharacterRosterEntry) => Promise<DirectionalSprites>;
  arenaTheme: ArenaThemeDefinition;
  floor: {
    base: HTMLImageElement | null;
    lane: HTMLImageElement | null;
    spawn: HTMLImageElement | null;
  };
  props: {
    wall: HTMLImageElement | null;
    crate: HTMLImageElement | null;
    crateBreakFrames?: HTMLImageElement[];
    bomb: HTMLImageElement | null;
    flame: HTMLImageElement | null;
  };
  effects?: {
    speedSparkTrail: HTMLImageElement | null;
  };
  ui?: {
    victoryEmblem: HTMLImageElement | null;
    stalemateEmblem: HTMLImageElement | null;
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
    run?: boolean;
    cast?: boolean;
    attack?: boolean;
    death?: boolean;
  };
  pinned?: boolean;
  defaultSlot?: PlayerId;
  order?: number;
}

interface CharacterManifestPayload {
  generatedAt?: string;
  characters?: CharacterManifestEntry[];
}

function createEmptyDirectionalFrameSet(): Record<Direction, HTMLImageElement[]> {
  return { up: [], down: [], left: [], right: [] };
}

function createEmptyDirectionalSprites(): DirectionalSprites {
  return {
    up: null,
    down: null,
    left: null,
    right: null,
    idle: createEmptyDirectionalFrameSet(),
    walk: createEmptyDirectionalFrameSet(),
    run: createEmptyDirectionalFrameSet(),
    cast: createEmptyDirectionalFrameSet(),
    attack: createEmptyDirectionalFrameSet(),
    death: createEmptyDirectionalFrameSet(),
  };
}

function appendAssetVersion(path: string, assetVersion?: string): string {
  if (!assetVersion) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(assetVersion)}`;
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

function assignDirectionalFrameSet(
  target: Record<Direction, HTMLImageElement[]>,
  frames: Record<Direction, HTMLImageElement[]>,
): void {
  target.up = frames.up;
  target.down = frames.down;
  target.left = frames.left;
  target.right = frames.right;
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

  const walk = createEmptyDirectionalFrameSet();
  void loadWalkCycle(prefix).then((frames) => {
    assignDirectionalFrameSet(walk, frames);
  }).catch(() => {
    // Walk-cycle sprites are a non-critical visual upgrade over static directional sprites.
  });

  return {
    up,
    down,
    left,
    right,
    idle: createEmptyDirectionalFrameSet(),
    walk,
    run: createEmptyDirectionalFrameSet(),
    cast: createEmptyDirectionalFrameSet(),
    attack: createEmptyDirectionalFrameSet(),
    death: createEmptyDirectionalFrameSet(),
  };
}

async function loadStaticDirectionalSprites(
  basePath: string,
  animations?: {
    idle?: boolean;
    walk?: boolean;
    run?: boolean;
    cast?: boolean;
    attack?: boolean;
    death?: boolean;
  },
  assetVersion?: string,
): Promise<DirectionalSprites> {
  const loadOptionalCycle = (
    animationName: "idle" | "walk" | "run" | "cast" | "attack" | "death",
  ): Promise<Record<Direction, HTMLImageElement[]>> => (
    animations?.[animationName]
      ? loadCharacterCycle(basePath, animationName, assetVersion)
      : Promise.resolve(createEmptyDirectionalFrameSet())
  );
  const [
    down,
    right,
    up,
    left,
    idleFrames,
    walkFrames,
    runFrames,
    castFrames,
    attackFrames,
    deathFrames,
  ] = await Promise.all([
    loadImage(appendAssetVersion(`${basePath}/south.png`, assetVersion)),
    loadImage(appendAssetVersion(`${basePath}/east.png`, assetVersion)),
    loadImage(appendAssetVersion(`${basePath}/north.png`, assetVersion)),
    loadImage(appendAssetVersion(`${basePath}/west.png`, assetVersion)),
    loadOptionalCycle("idle"),
    loadOptionalCycle("walk"),
    loadOptionalCycle("run"),
    loadOptionalCycle("cast"),
    loadOptionalCycle("attack"),
    loadOptionalCycle("death"),
  ]);
  return {
    up,
    down,
    left,
    right,
    idle: idleFrames,
    walk: {
      up: walkFrames.up.length > 0 ? walkFrames.up : runFrames.up,
      down: walkFrames.down.length > 0 ? walkFrames.down : runFrames.down,
      left: walkFrames.left.length > 0 ? walkFrames.left : runFrames.left,
      right: walkFrames.right.length > 0 ? walkFrames.right : runFrames.right,
    },
    run: runFrames,
    cast: castFrames,
    attack: attackFrames,
    death: deathFrames,
  };
}

async function loadWalkCycle(prefix: string): Promise<Record<Direction, HTMLImageElement[]>> {
  return loadCycleFromTemplate((suffix, index) => `${prefix}-walk-${suffix}-${index}.png`);
}

async function loadCharacterCycle(
  basePath: string,
  animationName: "idle" | "walk" | "run" | "cast" | "attack" | "death",
  assetVersion?: string,
): Promise<Record<Direction, HTMLImageElement[]>> {
  return loadCycleFromTemplate((suffix, index) => appendAssetVersion(`${basePath}/${animationName}-${suffix}-${index}.png`, assetVersion));
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

async function loadCharacterManifest(): Promise<CharacterManifestPayload> {
  try {
    const response = await fetch(assetUrl("/Assets/Characters/Animations/manifest.json"), { cache: "no-store" });
    if (!response.ok) {
      return {};
    }
    return await response.json() as CharacterManifestPayload;
  } catch {
    return {};
  }
}

function hasLoadedSpriteImage(sprites: DirectionalSprites): boolean {
  if (sprites.up || sprites.down || sprites.left || sprites.right) {
    return true;
  }

  return [
    sprites.idle,
    sprites.walk,
    sprites.run,
    sprites.cast,
    sprites.attack,
    sprites.death,
  ].some((framesByDirection) => Object.values(framesByDirection).some((frames) => frames.length > 0));
}

function isUsablePublicCharacterManifest(entries: CharacterManifestEntry[]): boolean {
  if (entries.length === 0) {
    return false;
  }

  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || seenIds.has(entry.id)) {
      return false;
    }
    seenIds.add(entry.id);
  }

  return CHARACTER_ROSTER_MANIFEST.every((entry) => seenIds.has(entry.id));
}

async function loadCharacterRoster(): Promise<CharacterRosterEntry[]> {
  const manifestPayload = await loadCharacterManifest();
  const publicManifestEntries = Array.isArray(manifestPayload.characters) ? manifestPayload.characters : [];
  const usePublicManifest = isUsablePublicCharacterManifest(publicManifestEntries);
  const manifestEntries: CharacterManifestEntry[] = usePublicManifest
    ? publicManifestEntries
    : CHARACTER_ROSTER_MANIFEST;
  const assetVersion = usePublicManifest ? manifestPayload.generatedAt ?? undefined : undefined;
  const sortedEntries = manifestEntries
    .map((entry, selectionIndex) => ({ entry, selectionIndex }))
    .sort((left, right) => {
      const orderA = typeof left.entry.order === "number" ? left.entry.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof right.entry.order === "number" ? right.entry.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return left.entry.name.localeCompare(right.entry.name);
    });

  const rosterEntries: Array<CharacterRosterEntry | null> = await Promise.all(sortedEntries.map(async ({ entry, selectionIndex }) => {
    if (!entry.id) {
      return null;
    }
    return {
      id: entry.id,
      name: entry.name || entry.id.slice(0, 8),
      size: entry.size ?? null,
      selectionIndex,
      assetVersion,
      animations: entry.animations,
      pinned: entry.pinned === true,
      defaultSlot: entry.defaultSlot,
      order: entry.order,
    } satisfies CharacterRosterEntry;
  }));

  return rosterEntries.filter((entry): entry is CharacterRosterEntry => entry !== null);
}

function getFallbackSpritesForRosterEntry(
  entry: CharacterRosterEntry,
  playerSprites: Partial<Record<PlayerId, DirectionalSprites>>,
): DirectionalSprites {
  const fallbackSlot = entry.defaultSlot ?? 1;
  return playerSprites[fallbackSlot]
    ?? playerSprites[1]
    ?? createEmptyDirectionalSprites();
}

function fillMissingStaticDirections(
  sprites: DirectionalSprites,
  fallback: DirectionalSprites,
): DirectionalSprites {
  return {
    ...sprites,
    up: sprites.up ?? fallback.up,
    down: sprites.down ?? fallback.down,
    left: sprites.left ?? fallback.left,
    right: sprites.right ?? fallback.right,
  };
}

function createCharacterSpriteLoader(
  playerSprites: Partial<Record<PlayerId, DirectionalSprites>>,
): (entry: CharacterRosterEntry) => Promise<DirectionalSprites> {
  const spriteLoadCache = new Map<string, Promise<DirectionalSprites>>();
  return (entry: CharacterRosterEntry): Promise<DirectionalSprites> => {
    const cached = spriteLoadCache.get(entry.id);
    if (cached) {
      return cached;
    }

    const loaded = loadStaticDirectionalSprites(
      assetUrl(`/Assets/Characters/Animations/${entry.id}`),
      entry.animations,
      entry.assetVersion,
    ).then((sprites) => {
      const fallback = getFallbackSpritesForRosterEntry(entry, playerSprites);
      return hasLoadedSpriteImage(sprites)
        ? fillMissingStaticDirections(sprites, fallback)
        : fallback;
    });
    spriteLoadCache.set(entry.id, loaded);
    return loaded;
  };
}

export async function loadGameAssets(arenaThemeId?: string | null): Promise<GameAssets> {
  const resolvedTheme = arenaThemeId ? getArenaThemeById(arenaThemeId) : null;
  const arenaTheme = resolvedTheme ?? resolveArenaTheme(typeof window !== "undefined" ? window.location.search : "");
  const arenaTilePaths = arenaTheme.renderMode === "sprite" ? arenaTheme.tilePaths ?? null : null;
  const [
    playerOne,
    playerTwo,
    characterRosterFromManifest,
    floorBase,
    floorLane,
    floorSpawn,
    wall,
    crate,
    crateBreak0,
    crateBreak1,
    crateBreak2,
    crateBreak3,
    bomb,
    flame,
    speedSparkTrail,
    victoryEmblem,
    stalemateEmblem,
    bombUp,
    flameUp,
    speedUp,
    remoteUp,
    shieldUp,
    bombPassUp,
    kickUp,
    shortFuseUp,
  ] = await Promise.all([
    loadDirectionalSprites(assetUrl("/Assets/Characters/Animations/default-players/player1"), ["hires", ""]),
    loadDirectionalSprites(assetUrl("/Assets/Characters/Animations/default-players/player2")),
    loadCharacterRoster(),
    arenaTilePaths
      ? loadFirstAvailableImage([assetUrl(arenaTilePaths.base), assetUrl("/Assets/TileMaps/floor-base.png")])
      : Promise.resolve(null),
    arenaTilePaths
      ? loadFirstAvailableImage([assetUrl(arenaTilePaths.lane), assetUrl("/Assets/TileMaps/floor-alt.png")])
      : Promise.resolve(null),
    arenaTilePaths
      ? loadFirstAvailableImage([assetUrl(arenaTilePaths.spawn), assetUrl("/Assets/TileMaps/floor-spawn.png")])
      : Promise.resolve(null),
    arenaTilePaths
      ? loadFirstAvailableImage([assetUrl(arenaTilePaths.wall), assetUrl("/Assets/TileMaps/wall.png")])
      : Promise.resolve(null),
    arenaTilePaths
      ? loadFirstAvailableImage([assetUrl(arenaTilePaths.crate), assetUrl("/Assets/TileMaps/crate.png")])
      : Promise.resolve(null),
    loadImage(assetUrl("/Assets/TileMaps/crate-break-0.png")),
    loadImage(assetUrl("/Assets/TileMaps/crate-break-1.png")),
    loadImage(assetUrl("/Assets/TileMaps/crate-break-2.png")),
    loadImage(assetUrl("/Assets/TileMaps/crate-break-3.png")),
    loadImage(assetUrl("/Assets/VisualEffects/bomb.png")),
    loadImage(assetUrl("/Assets/VisualEffects/flame.png")),
    loadImage(assetUrl("/Assets/VisualEffects/speed-spark-trail.png")),
    loadImage(assetUrl("/Assets/UiLayouts/arena-victory-emblem.webp")),
    loadImage(assetUrl("/Assets/UiLayouts/arena-stalemate-emblem.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-bomb.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-flame.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-speed-rastro-relampago.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-remote.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-shield.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-bomb-pass.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-kick.png")),
    loadImage(assetUrl("/Assets/UiLayouts/power-short-fuse-v2.png")),
  ]);
  const playerSprites: Partial<Record<PlayerId, DirectionalSprites>> = {
    1: playerOne,
    2: playerTwo,
    3: playerOne,
    4: playerTwo,
  };
  const characterSpriteLoader = createCharacterSpriteLoader(playerSprites);

  const fallbackRoster: CharacterRosterEntry[] = [
    {
      id: "default-p1",
      name: "Bomba Ranger Cyan",
      size: null,
      sprites: playerOne,
      pinned: true,
      defaultSlot: 1,
      order: 0,
    },
    {
      id: "default-p2",
      name: "Bomba Ranger Amber",
      size: null,
      sprites: playerTwo,
      pinned: true,
      defaultSlot: 2,
      order: 1,
    },
  ];

  return {
    players: playerSprites,
    arenaTheme,
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
      crateBreakFrames: [crateBreak0, crateBreak1, crateBreak2, crateBreak3]
        .filter((frame): frame is HTMLImageElement => frame !== null),
      bomb,
      flame,
    },
    effects: {
      speedSparkTrail,
    },
    ui: {
      victoryEmblem,
      stalemateEmblem,
    },
    powerUps: {
      "bomb-up": bombUp,
      "flame-up": flameUp,
      "speed-up": speedUp,
      "remote-up": remoteUp,
      "shield-up": shieldUp,
      "bomb-pass-up": bombPassUp,
      "kick-up": kickUp,
      "short-fuse-up": shortFuseUp,
    },
    characterSpriteLoader,
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
