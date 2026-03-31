export interface ArenaThemeTilePaths {
  base: string;
  lane: string;
  spawn: string;
  wall: string;
  crate: string;
}

export interface ArenaThemePalette {
  floorBase: string;
  floorBaseAlt: string;
  floorLane: string;
  floorLaneAlt: string;
  floorSpawn: string;
  floorSpawnAlt: string;
  floorPortal: string;
  floorPortalAlt: string;
  floorEdgeLight: string;
  floorEdgeDark: string;
  floorBorder: string;
  floorCenterMark: string;
  spawnRing: string;
  portalRing: string;
  wallShadow: string;
  wallOuter: string;
  wallInner: string;
  wallTop: string;
  wallAccent: string;
  wallBorder: string;
  crateShadow: string;
  crateOuter: string;
  crateInner: string;
  crateBand: string;
  crateMark: string;
  suddenDeathWash: string;
  suddenDeathStroke: string;
  arenaFrame: string;
  arenaGlow: string;
  arenaMistTop: string;
  arenaMistBottom: string;
}

export interface ArenaThemeMotif {
  floorPattern: "dot" | "diamond" | "vein";
  lanePattern: "cross" | "stripe" | "chevron";
  spawnPattern: "ring" | "diamond" | "seal";
  wallStyle: "slab" | "royal" | "frost" | "obsidian";
  crateStyle: "classic" | "trimmed" | "expedition";
}

export interface ArenaThemeDefinition {
  id: string;
  name: string;
  summary: string;
  layoutFocus: string[];
  visualFocus: string[];
  pixellabDescription: string;
  renderMode: "sprite" | "procedural";
  tilePaths?: ArenaThemeTilePaths;
  palette: ArenaThemePalette;
  motif: ArenaThemeMotif;
}

export const DEFAULT_ARENA_THEME_ID = "tournament-clean";
export const ARENA_THEME_QUERY_PARAM = "arenaTheme";

export const ARENA_THEME_LIBRARY: readonly ArenaThemeDefinition[] = [
  {
    id: "tournament-clean",
    name: "Tournament Clean",
    summary: "Bright, quiet stone floor with strict category colors and minimal texture noise.",
    layoutFocus: [
      "Routes are brighter than the neutral floor, but stay in the same family.",
      "Spawn tiles use a restrained ring accent instead of loud texture work.",
      "Walls and crates remain readable from silhouette and value before detail.",
    ],
    visualFocus: [
      "Floor family stays cool-neutral and low noise.",
      "Wall family is dark steel-blue and structural.",
      "Crate family is the only warm terrain category, so breakables pop instantly.",
    ],
    pixellabDescription: "Not used directly. This theme is procedurally rendered to keep the arena clean, structured, and category-led.",
    renderMode: "procedural",
    palette: {
      floorBase: "#d9e1ec",
      floorBaseAlt: "#ced8e6",
      floorLane: "#eef3f9",
      floorLaneAlt: "#e1e9f4",
      floorSpawn: "#f6f8fc",
      floorSpawnAlt: "#e7eef8",
      floorPortal: "#edf5ff",
      floorPortalAlt: "#deebfb",
      floorEdgeLight: "rgba(255, 255, 255, 0.78)",
      floorEdgeDark: "rgba(122, 137, 160, 0.52)",
      floorBorder: "rgba(132, 146, 170, 0.32)",
      floorCenterMark: "rgba(105, 127, 157, 0.14)",
      spawnRing: "rgba(84, 153, 214, 0.82)",
      portalRing: "rgba(65, 189, 214, 0.88)",
      wallShadow: "rgba(32, 43, 61, 0.22)",
      wallOuter: "#46556b",
      wallInner: "#64758d",
      wallTop: "#8595a9",
      wallAccent: "#d7dfeb",
      wallBorder: "rgba(28, 39, 56, 0.72)",
      crateShadow: "rgba(58, 37, 18, 0.2)",
      crateOuter: "#916342",
      crateInner: "#b9855d",
      crateBand: "#6e4b2d",
      crateMark: "#e5bb90",
      suddenDeathWash: "rgba(126, 24, 24, 0.2)",
      suddenDeathStroke: "rgba(214, 106, 76, 0.46)",
      arenaFrame: "rgba(138, 157, 184, 0.42)",
      arenaGlow: "rgba(225, 233, 246, 0.22)",
      arenaMistTop: "rgba(255, 255, 255, 0.04)",
      arenaMistBottom: "rgba(104, 121, 150, 0.08)",
    },
    motif: {
      floorPattern: "dot",
      lanePattern: "cross",
      spawnPattern: "ring",
      wallStyle: "slab",
      crateStyle: "classic",
    },
  },
  {
    id: "arcane-citadel",
    name: "Arcane Citadel",
    summary: "Cool blue-gray stone with bright lanes and restrained rune accents for maximum blast readability.",
    layoutFocus: [
      "Center cross and side lanes read brighter than neutral floor.",
      "Spawn bays are visibly protected without becoming visually louder than hazards.",
      "Walls keep a chunky silhouette so sudden-death closures remain obvious.",
    ],
    visualFocus: [
      "Neutralacool floor palette keeps flames and danger overlays hot by comparison.",
      "Detail stays concentrated on tile edges instead of the tile center.",
      "Spawn rune is strong enough to orient players at a glance, but not noisy.",
    ],
    pixellabDescription: "1). cool blue-gray fortress floor tile with subtle wear and clean center 2). brighter combat-lane slab tile with clearer edge cuts and readable path rhythm 3). protected spawn tile with restrained cyan-gold rune ring and open center 4). thick carved stone wall tile with clear top lip and strong silhouette 5). reinforced wooden crate with iron bands, readable crack seams and low-top-down depth 6). optional accent tile with faint rune fracture and moss only on the edge",
    renderMode: "sprite",
    tilePaths: {
      base: "aassetsatilesathemesaarcane-citadelafloor-base.png",
      lane: "aassetsatilesathemesaarcane-citadelafloor-lane.png",
      spawn: "aassetsatilesathemesaarcane-citadelafloor-spawn.png",
      wall: "aassetsatilesathemesaarcane-citadelawall.png",
      crate: "aassetsatilesathemesaarcane-citadelacrate.png",
    },
    palette: {
      floorBase: "#10233d",
      floorBaseAlt: "#0b1830",
      floorLane: "#143152",
      floorLaneAlt: "#112947",
      floorSpawn: "#163656",
      floorSpawnAlt: "#13304f",
      floorPortal: "#1f3a52",
      floorPortalAlt: "#183149",
      floorEdgeLight: "rgba(255, 255, 255, 0.12)",
      floorEdgeDark: "rgba(0, 0, 0, 0.18)",
      floorBorder: "rgba(146, 208, 255, 0.08)",
      floorCenterMark: "rgba(110, 214, 255, 0.1)",
      spawnRing: "rgba(82, 191, 226, 0.72)",
      portalRing: "rgba(126, 206, 255, 0.74)",
      wallShadow: "rgba(8, 10, 14, 0.35)",
      wallOuter: "#5b5d5f",
      wallInner: "#797b7d",
      wallTop: "#9c9d97",
      wallAccent: "rgba(185, 191, 185, 0.45)",
      wallBorder: "rgba(24, 25, 28, 0.5)",
      crateShadow: "rgba(10, 6, 2, 0.28)",
      crateOuter: "#8a512c",
      crateInner: "#cf7b45",
      crateBand: "#5e3118",
      crateMark: "rgba(255, 214, 168, 0.22)",
      suddenDeathWash: "rgba(40, 11, 8, 0.28)",
      suddenDeathStroke: "rgba(255, 156, 102, 0.32)",
      arenaFrame: "rgba(188, 223, 255, 0.16)",
      arenaGlow: "rgba(173, 204, 232, 0.04)",
      arenaMistTop: "rgba(194, 220, 247, 0.05)",
      arenaMistBottom: "rgba(4, 8, 14, 0.1)",
    },
    motif: {
      floorPattern: "dot",
      lanePattern: "cross",
      spawnPattern: "ring",
      wallStyle: "slab",
      crateStyle: "classic",
    },
  },
  {
    id: "verdant-ruins",
    name: "Verdant Ruins",
    summary: "Mossy stone and warmer masonry for experimentation with a softer adventure tone.",
    layoutFocus: [
      "Normal floor stays quieter than the lane tile so routes still read quickly.",
      "Spawn tile uses a large circular marker for immediate orientation.",
      "Crate face remains high-contrast against the greener floor candidate.",
    ],
    visualFocus: [
      "Earthier floor palette introduces more atmosphere without changing collision shapes.",
      "Wall moss is pushed to the upper edge so the collision body stays readable.",
      "Use as a library variant, not the default, until blast contrast is re-reviewed.",
    ],
    pixellabDescription: "1). moss-kissed ruin floor tile with large readable slab breakup and dark grout 2). clean sandstone combat lane tile with brighter value grouping and minimal noise 3). ancient spawn seal tile with teal circular rune inset and open negative space 4). ruined garden wall tile with moss only on the crown and crisp block silhouette 5). sturdy travel crate with brass bindings and bright lid planes 6). optional cracked obsidian accent tile with vine edge detail",
    renderMode: "sprite",
    tilePaths: {
      base: "aassetsatilesathemesaverdant-ruinsafloor-base.png",
      lane: "aassetsatilesathemesaverdant-ruinsafloor-lane.png",
      spawn: "aassetsatilesathemesaverdant-ruinsafloor-spawn.png",
      wall: "aassetsatilesathemesaverdant-ruinsawall.png",
      crate: "aassetsatilesathemesaverdant-ruinsacrate.png",
    },
    palette: {
      floorBase: "#60733b",
      floorBaseAlt: "#546831",
      floorLane: "#c3b27b",
      floorLaneAlt: "#b2a16e",
      floorSpawn: "#1d8785",
      floorSpawnAlt: "#167677",
      floorPortal: "#1fa0a1",
      floorPortalAlt: "#168d8e",
      floorEdgeLight: "rgba(255, 255, 255, 0.15)",
      floorEdgeDark: "rgba(0, 0, 0, 0.18)",
      floorBorder: "rgba(255, 255, 255, 0.08)",
      floorCenterMark: "rgba(255, 255, 255, 0.06)",
      spawnRing: "rgba(106, 232, 227, 0.82)",
      portalRing: "rgba(90, 228, 223, 0.82)",
      wallShadow: "rgba(35, 28, 18, 0.28)",
      wallOuter: "#8d7f5a",
      wallInner: "#b4a67e",
      wallTop: "#d5cbab",
      wallAccent: "rgba(255, 251, 227, 0.45)",
      wallBorder: "rgba(61, 51, 34, 0.42)",
      crateShadow: "rgba(40, 23, 7, 0.24)",
      crateOuter: "#7b5329",
      crateInner: "#ab7440",
      crateBand: "#5e3c1d",
      crateMark: "rgba(255, 214, 168, 0.22)",
      suddenDeathWash: "rgba(70, 21, 18, 0.24)",
      suddenDeathStroke: "rgba(241, 135, 98, 0.34)",
      arenaFrame: "rgba(216, 227, 194, 0.18)",
      arenaGlow: "rgba(234, 239, 218, 0.04)",
      arenaMistTop: "rgba(255, 255, 255, 0.04)",
      arenaMistBottom: "rgba(16, 20, 10, 0.1)",
    },
    motif: {
      floorPattern: "dot",
      lanePattern: "cross",
      spawnPattern: "ring",
      wallStyle: "slab",
      crateStyle: "classic",
    },
  },
  {
    id: "skyfoundry-bastion",
    name: "Skyfoundry Bastion",
    summary: "Steel-blue masonry with crisp amber route cuts and a heavy industrial wall silhouette.",
    layoutFocus: [
      "Normal floor stays quiet while the lane tile marks rush routes with edge-only trim.",
      "Spawn tile reads as a clear landmark without flooding the entire board with bright color.",
      "Wall and crate shapes remain distinct even when players, bombs, and flames overlap them.",
    ],
    visualFocus: [
      "Cool floor palette preserves contrast for hot VFX and pickups.",
      "Industrial wall tile carries most of the visual weight instead of the floor center.",
      "Crate uses warmer wood planes so destructibility is still obvious.",
    ],
    pixellabDescription: "1). steel-blue bastion floor tile with subtle riveted slab seams and dark center 2). brighter route lane tile with amber guide cuts near edges only 3). restrained spawn dais tile with circular brass inlay and open center 4). heavy skyforge wall tile with layered stone-metal crown and strong silhouette 5). breakable cargo crate with wood face, steel corners and readable crack geometry 6). optional accent tile with tiny spark vent and soot edge",
    renderMode: "sprite",
    tilePaths: {
      base: "aassetsatilesathemesaskyfoundry-bastionafloor-base.png",
      lane: "aassetsatilesathemesaskyfoundry-bastionafloor-lane.png",
      spawn: "aassetsatilesathemesaskyfoundry-bastionafloor-spawn.png",
      wall: "aassetsatilesathemesaskyfoundry-bastionawall.png",
      crate: "aassetsatilesathemesaskyfoundry-bastionacrate.png",
    },
    palette: {
      floorBase: "#5f7490",
      floorBaseAlt: "#566884",
      floorLane: "#d3d7df",
      floorLaneAlt: "#c5cad4",
      floorSpawn: "#d0b56a",
      floorSpawnAlt: "#bea259",
      floorPortal: "#a38b3a",
      floorPortalAlt: "#8d772f",
      floorEdgeLight: "rgba(255, 255, 255, 0.14)",
      floorEdgeDark: "rgba(0, 0, 0, 0.2)",
      floorBorder: "rgba(31, 36, 51, 0.28)",
      floorCenterMark: "rgba(255, 255, 255, 0.05)",
      spawnRing: "rgba(255, 214, 112, 0.84)",
      portalRing: "rgba(232, 185, 60, 0.82)",
      wallShadow: "rgba(14, 18, 28, 0.3)",
      wallOuter: "#324157",
      wallInner: "#42556d",
      wallTop: "#687991",
      wallAccent: "rgba(230, 236, 243, 0.34)",
      wallBorder: "rgba(15, 20, 32, 0.58)",
      crateShadow: "rgba(46, 27, 12, 0.24)",
      crateOuter: "#8c633d",
      crateInner: "#b58155",
      crateBand: "#5e4027",
      crateMark: "rgba(255, 214, 168, 0.22)",
      suddenDeathWash: "rgba(64, 14, 10, 0.24)",
      suddenDeathStroke: "rgba(233, 142, 94, 0.34)",
      arenaFrame: "rgba(182, 194, 214, 0.18)",
      arenaGlow: "rgba(219, 226, 239, 0.04)",
      arenaMistTop: "rgba(255, 255, 255, 0.03)",
      arenaMistBottom: "rgba(6, 10, 18, 0.1)",
    },
    motif: {
      floorPattern: "dot",
      lanePattern: "cross",
      spawnPattern: "ring",
      wallStyle: "slab",
      crateStyle: "classic",
    },
  },
  {
    id: "royal-marble",
    name: "Royal Marble",
    summary: "Premium pale marble arena with deep navy structure and restrained gold ceremony accents.",
    layoutFocus: [
      "Bright marble lanes still stay calmer than bombs and powerups.",
      "Spawn markers feel ceremonial without covering whole tiles in gold.",
      "Walls read as noble architecture, not decorative clutter.",
    ],
    visualFocus: [
      "Luxurious material identity with clean board readability.",
      "Navy wall family anchors the board while warm trim stays sparse.",
      "Crates feel crafted and valuable, but still obviously breakable.",
    ],
    pixellabDescription: "high-resolution clean royal marble arena, pale cool stone floor, navy fortress walls, restrained gold trim, elegant readable destructible crates, low top-down, minimal noise, crisp silhouettes",
    renderMode: "procedural",
    palette: {
      floorBase: "#e9e7e4",
      floorBaseAlt: "#ddd9d5",
      floorLane: "#f4f1ec",
      floorLaneAlt: "#ebe5de",
      floorSpawn: "#faf7f1",
      floorSpawnAlt: "#efe9df",
      floorPortal: "#f5efe3",
      floorPortalAlt: "#e7dcc9",
      floorEdgeLight: "rgba(255,255,255,0.72)",
      floorEdgeDark: "rgba(142,133,126,0.38)",
      floorBorder: "rgba(124,116,126,0.22)",
      floorCenterMark: "rgba(166,146,112,0.12)",
      spawnRing: "rgba(201, 160, 83, 0.9)",
      portalRing: "rgba(99, 155, 222, 0.88)",
      wallShadow: "rgba(19, 25, 40, 0.24)",
      wallOuter: "#34435f",
      wallInner: "#4a5b79",
      wallTop: "#7182a1",
      wallAccent: "#d9c7a1",
      wallBorder: "rgba(18, 24, 39, 0.7)",
      crateShadow: "rgba(77, 49, 25, 0.22)",
      crateOuter: "#8c643f",
      crateInner: "#be9265",
      crateBand: "#6b4c32",
      crateMark: "#e8c8a1",
      suddenDeathWash: "rgba(126, 34, 24, 0.2)",
      suddenDeathStroke: "rgba(214, 111, 88, 0.46)",
      arenaFrame: "rgba(191, 177, 146, 0.34)",
      arenaGlow: "rgba(245, 240, 230, 0.18)",
      arenaMistTop: "rgba(255,255,255,0.03)",
      arenaMistBottom: "rgba(84,92,116,0.08)",
    },
    motif: {
      floorPattern: "vein",
      lanePattern: "stripe",
      spawnPattern: "seal",
      wallStyle: "royal",
      crateStyle: "trimmed",
    },
  },
  {
    id: "glacier-sanctum",
    name: "Glacier Sanctum",
    summary: "Cold sanctuary stone with icy route light and frost-cut architectural walls.",
    layoutFocus: [
      "Frozen floor stays low-noise and supports hot combat effects.",
      "Spawn seals read like sacred ice glyphs instead of bright targets.",
      "Walls feel cold and sharp without becoming too dark.",
    ],
    visualFocus: [
      "Calm blue-white atmosphere.",
      "Frost detail is concentrated on edges and caps only.",
      "Warm crates preserve breakability contrast against the icy board.",
    ],
    pixellabDescription: "clean glacier sanctum arena, pale icy stone floor, dark frozen walls, subtle sacred frost seals, warm expedition crates, high resolution, low noise, readable downscaled",
    renderMode: "procedural",
    palette: {
      floorBase: "#dfe9f2",
      floorBaseAlt: "#d2dee9",
      floorLane: "#eef7ff",
      floorLaneAlt: "#e1eef8",
      floorSpawn: "#f6fbff",
      floorSpawnAlt: "#e4eff8",
      floorPortal: "#d8f0fa",
      floorPortalAlt: "#c4e4f2",
      floorEdgeLight: "rgba(255,255,255,0.78)",
      floorEdgeDark: "rgba(118,141,165,0.36)",
      floorBorder: "rgba(137,164,188,0.24)",
      floorCenterMark: "rgba(125,170,210,0.12)",
      spawnRing: "rgba(152, 212, 245, 0.92)",
      portalRing: "rgba(91, 205, 227, 0.9)",
      wallShadow: "rgba(30, 44, 61, 0.2)",
      wallOuter: "#5a7189",
      wallInner: "#7590ab",
      wallTop: "#afc2d4",
      wallAccent: "#e8f3fb",
      wallBorder: "rgba(43, 58, 76, 0.56)",
      crateShadow: "rgba(61, 42, 26, 0.2)",
      crateOuter: "#8f6844",
      crateInner: "#bf9367",
      crateBand: "#6f5238",
      crateMark: "#f0d4b6",
      suddenDeathWash: "rgba(97, 39, 39, 0.18)",
      suddenDeathStroke: "rgba(211, 122, 108, 0.42)",
      arenaFrame: "rgba(189, 223, 244, 0.28)",
      arenaGlow: "rgba(236, 247, 255, 0.2)",
      arenaMistTop: "rgba(255,255,255,0.04)",
      arenaMistBottom: "rgba(88,109,132,0.08)",
    },
    motif: {
      floorPattern: "diamond",
      lanePattern: "chevron",
      spawnPattern: "ring",
      wallStyle: "frost",
      crateStyle: "expedition",
    },
  },
  {
    id: "obsidian-garden",
    name: "Obsidian Garden",
    summary: "Dark volcanic court with jade landmark accents and restrained polished stone reflections.",
    layoutFocus: [
      "Dark floor remains readable because lanes and crates hold a strong value break.",
      "Jade accents stay limited to landmark guidance.",
      "The board feels dramatic without drowning hazards in darkness.",
    ],
    visualFocus: [
      "High-contrast premium dark theme.",
      "Polished obsidian identity with careful negative space.",
      "Warm crate family stops the arena from becoming monochrome.",
    ],
    pixellabDescription: "clean obsidian garden arena, polished dark volcanic floor, structured charcoal walls, restrained jade landmark accents, warm elegant crates, high resolution, premium readability, minimal noise",
    renderMode: "procedural",
    palette: {
      floorBase: "#40454f",
      floorBaseAlt: "#343944",
      floorLane: "#5a606d",
      floorLaneAlt: "#4b5260",
      floorSpawn: "#48535a",
      floorSpawnAlt: "#3f4a51",
      floorPortal: "#41595b",
      floorPortalAlt: "#394d4f",
      floorEdgeLight: "rgba(219,226,232,0.22)",
      floorEdgeDark: "rgba(12,16,22,0.34)",
      floorBorder: "rgba(164,177,188,0.15)",
      floorCenterMark: "rgba(193,223,211,0.08)",
      spawnRing: "rgba(114, 214, 183, 0.88)",
      portalRing: "rgba(89, 195, 204, 0.88)",
      wallShadow: "rgba(10, 12, 17, 0.28)",
      wallOuter: "#242a33",
      wallInner: "#3a424f",
      wallTop: "#566171",
      wallAccent: "#97b7ae",
      wallBorder: "rgba(8, 10, 14, 0.76)",
      crateShadow: "rgba(50, 31, 16, 0.24)",
      crateOuter: "#8e6844",
      crateInner: "#be9063",
      crateBand: "#6b4c31",
      crateMark: "#e8c79d",
      suddenDeathWash: "rgba(97, 25, 25, 0.2)",
      suddenDeathStroke: "rgba(210, 106, 96, 0.42)",
      arenaFrame: "rgba(129, 150, 158, 0.24)",
      arenaGlow: "rgba(213, 227, 218, 0.08)",
      arenaMistTop: "rgba(255,255,255,0.015)",
      arenaMistBottom: "rgba(4,6,10,0.1)",
    },
    motif: {
      floorPattern: "vein",
      lanePattern: "stripe",
      spawnPattern: "diamond",
      wallStyle: "obsidian",
      crateStyle: "trimmed",
    },
  },
] as const;

const ARENA_THEME_MAP = new Map(
  ARENA_THEME_LIBRARY.map((theme) => [theme.id, theme] as const),
);

export function getArenaThemeById(id: string | null | undefined): ArenaThemeDefinition | null {
  if (!id) {
    return null;
  }
  return ARENA_THEME_MAP.get(id.trim().toLowerCase()) ?? null;
}

export function resolveArenaTheme(search: string): ArenaThemeDefinition {
  const params = new URLSearchParams(search);
  return getArenaThemeById(params.get(ARENA_THEME_QUERY_PARAM))
    ?? ARENA_THEME_MAP.get(DEFAULT_ARENA_THEME_ID)
    ?? ARENA_THEME_LIBRARY[0];
}
