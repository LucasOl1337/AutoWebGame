import type { ArenaDefinition, ArenaSpawnDefinition, TileCoord } from "../Gameplay/types";
import { validateArenaDefinition } from "./arena";
import { canonicalJson, sha256Canonical } from "../Shared/canonical-json";

export type ArenaMapLifecycle = "draft" | "validated" | "staged" | "published" | "retired";
export type ArenaMapExperience = "continuous-room" | "training" | "lab";
export type ArenaMapContentHash = `sha256:${string}`;

export interface ArenaMapRef {
  readonly id: string;
  readonly revision: string;
  readonly contentHash: ArenaMapContentHash;
}

export interface PublishedArenaMap extends ArenaMapRef {
  readonly schemaVersion: "arena-map.v1";
  readonly lifecycle: ArenaMapLifecycle;
  readonly eligibleExperiences: readonly ArenaMapExperience[];
  readonly locale: "pt-BR";
  readonly name: string;
  readonly description: string;
  readonly themeId: "arcane-citadel";
  readonly layout: {
    readonly grid: Readonly<{ width: number; height: number }>;
    readonly solid: readonly string[];
    readonly breakable: readonly string[];
    readonly spawns: readonly ArenaSpawnDefinition[];
    readonly portals: readonly Readonly<{
      id: "north" | "east" | "south" | "west";
      entry: TileCoord;
      exit: TileCoord;
    }>[];
    readonly floorLayers: Readonly<{
      base: readonly string[];
      lanes: readonly string[];
      spawns: readonly string[];
      portals: readonly string[];
      ritualAxis: readonly string[];
    }>;
  };
  readonly assets: Readonly<{
    assetSetId: "cidadela-arcana/r1";
    basePath: "/Assets/TileMaps/canonical/cidadela-arcana/r1/";
    atlas: Readonly<{ path: string; sha256: ArenaMapContentHash; mediaType: "image/svg+xml" }>;
    thumbnail: Readonly<{
      path: string;
      sha256: ArenaMapContentHash;
      mediaType: "image/svg+xml";
      derivedFrom: "layout";
    }>;
    fallback: Readonly<{
      renderMode: "procedural";
      floor: string;
      lane: string;
      spawn: string;
      portal: string;
      solid: string;
      breakable: string;
    }>;
    preload: readonly string[];
    budgetBytes: number;
  }>;
  readonly derived: Readonly<{
    dropDistributionKey: string;
    suddenDeathTraversal: "clockwise-inward-skip-solids";
    thumbnailAlgorithm: "arena-map-svg.v1";
  }>;
  readonly publication: Readonly<{
    publishedAt: string;
    immutable: true;
    rollbackRef: null;
  }>;
}

export interface ArenaMapVerificationIssue {
  readonly code: string;
  readonly message: string;
}

export interface ArenaMapVerificationResult {
  readonly ok: boolean;
  readonly computedHash: ArenaMapContentHash | null;
  readonly issues: readonly ArenaMapVerificationIssue[];
}

const CITADEL_CONTENT_HASH = "sha256:21711287367572f02d0766520f46d62005bd5eafb563cd0504840f45f21008fe" as const;
const CITADEL_CREATED_AT = "2026-07-16T00:00:00.000Z";
const CITADEL_ASSET_ROOT = "/Assets/TileMaps/canonical/cidadela-arcana/r1/" as const;

const INTERIOR_SOLIDS = [
  "3,2", "7,2",
  "2,3", "3,3", "4,3", "6,3", "7,3", "8,3",
  "3,4", "7,4",
  "2,5", "3,5", "4,5", "6,5", "7,5", "8,5",
  "3,6", "7,6",
] as const;

const BREAKABLES = [
  "2,2", "4,2", "6,2", "8,2", "5,3",
  "2,4", "4,4", "6,4", "8,4", "5,5",
  "2,6", "4,6", "6,6", "8,6",
] as const;

const PORTAL_KEYS = new Set(["5,0", "10,4", "5,8", "0,4"]);

function borderSolids(width: number, height: number): string[] {
  const result: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const key = `${x},${y}`;
      if (!PORTAL_KEYS.has(key)) result.push(key);
    }
  }
  return result;
}

function tileLayer(width: number, height: number): string[] {
  const result: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) result.push(`${x},${y}`);
  }
  return result;
}

const CITADEL_DRAFT: PublishedArenaMap = {
  schemaVersion: "arena-map.v1",
  id: "cidadela-arcana",
  revision: "r1",
  contentHash: CITADEL_CONTENT_HASH,
  lifecycle: "published",
  eligibleExperiences: ["continuous-room", "training", "lab"],
  locale: "pt-BR",
  name: "Cidadela Arcana",
  description: "Fortaleza mineral azul-grafite do Eixo Prismático, com quatro rotas cardinais e selo central aberto.",
  themeId: "arcane-citadel",
  layout: {
    grid: { width: 11, height: 9 },
    solid: [...borderSolids(11, 9), ...INTERIOR_SOLIDS].sort(compareTileKeys),
    breakable: [...BREAKABLES].sort(compareTileKeys),
    spawns: [
      { playerId: 1, tile: { x: 1, y: 1 }, direction: "down" },
      { playerId: 2, tile: { x: 9, y: 1 }, direction: "down" },
      { playerId: 3, tile: { x: 1, y: 7 }, direction: "up" },
      { playerId: 4, tile: { x: 9, y: 7 }, direction: "up" },
    ],
    portals: [
      { id: "north", entry: { x: 5, y: 0 }, exit: { x: 5, y: 8 } },
      { id: "east", entry: { x: 10, y: 4 }, exit: { x: 0, y: 4 } },
      { id: "south", entry: { x: 5, y: 8 }, exit: { x: 5, y: 0 } },
      { id: "west", entry: { x: 0, y: 4 }, exit: { x: 10, y: 4 } },
    ],
    floorLayers: {
      base: tileLayer(11, 9),
      lanes: ["5,0", "5,1", "5,2", "5,3", "5,4", "5,5", "5,6", "5,7", "5,8", "0,4", "1,4", "2,4", "3,4", "4,4", "6,4", "7,4", "8,4", "9,4", "10,4"],
      spawns: ["1,1", "9,1", "1,7", "9,7"],
      portals: ["5,0", "10,4", "5,8", "0,4"],
      ritualAxis: ["5,2", "5,3", "3,4", "4,4", "5,4", "6,4", "7,4", "5,5", "5,6"],
    },
  },
  assets: {
    assetSetId: "cidadela-arcana/r1",
    basePath: CITADEL_ASSET_ROOT,
    atlas: {
      path: `${CITADEL_ASSET_ROOT}tile-atlas.svg`,
      sha256: "sha256:ecf456e38e98f19fcc3b6612ba358b10a3780b54be22f4a68bdee68770f4601f",
      mediaType: "image/svg+xml",
    },
    thumbnail: {
      path: `${CITADEL_ASSET_ROOT}thumbnail.svg`,
      sha256: "sha256:d5d2b5116edee0831531a9f20f42659f1c61b675a1a05375d51b598a6f022ca1",
      mediaType: "image/svg+xml",
      derivedFrom: "layout",
    },
    fallback: {
      renderMode: "procedural",
      floor: "#10233d",
      lane: "#143152",
      spawn: "#163656",
      portal: "#22d3ee",
      solid: "#797b7d",
      breakable: "#cf7b45",
    },
    preload: [
      `${CITADEL_ASSET_ROOT}tile-atlas.svg`,
      `${CITADEL_ASSET_ROOT}thumbnail.svg`,
    ],
    budgetBytes: 32_768,
  },
  derived: {
    dropDistributionKey: "cidadela-arcana@r1",
    suddenDeathTraversal: "clockwise-inward-skip-solids",
    thumbnailAlgorithm: "arena-map-svg.v1",
  },
  publication: {
    publishedAt: CITADEL_CREATED_AT,
    immutable: true,
    rollbackRef: null,
  },
};

const CITADEL = deepFreeze(CITADEL_DRAFT);
const CATALOG = deepFreeze([CITADEL] as const);
const CATALOG_REFS = deepFreeze(CATALOG.map(arenaMapRef));

export function listPublishedArenaMaps(): readonly ArenaMapRef[] {
  return CATALOG_REFS;
}

export function getPublishedArenaMap(ref: ArenaMapRef): PublishedArenaMap {
  const map = CATALOG.find((candidate) => candidate.id === ref.id && candidate.revision === ref.revision);
  if (!map) throw new Error(`Arena map ${ref.id}@${ref.revision} is not published`);
  if (ref.contentHash !== map.contentHash) {
    throw new Error(`Incompatible arena map hash for ${ref.id}@${ref.revision}`);
  }
  return map;
}

export function getCanonicalArenaMap(): PublishedArenaMap {
  return CITADEL;
}

export async function verifyPublishedArenaMap(value: unknown): Promise<ArenaMapVerificationResult> {
  const issues: ArenaMapVerificationIssue[] = [];
  if (!isRecord(value)) {
    return deepFreeze({ ok: false, computedHash: null, issues: [{ code: "schema_invalid", message: "Arena map must be an object." }] });
  }

  let computedHash: ArenaMapContentHash | null = null;
  try {
    computedHash = await sha256Canonical(withoutContentHash(value));
  } catch (error) {
    issues.push({ code: "canonicalization_failed", message: safeError(error) });
  }
  if (value.contentHash !== computedHash) {
    issues.push({ code: "content_hash_mismatch", message: "Declared contentHash does not match canonical content." });
  }
  issues.push(...validatePublicationShape(value));
  try {
    if (canonicalJson(value) !== canonicalJson(CITADEL)) {
      issues.push({ code: "catalog_content_mismatch", message: "Published revision differs from the immutable catalog content." });
    }
  } catch (error) {
    issues.push({ code: "schema_invalid", message: safeError(error) });
  }
  return deepFreeze({ ok: issues.length === 0, computedHash, issues });
}

export function toArenaDefinition(map: PublishedArenaMap): ArenaDefinition {
  const published = getPublishedArenaMap(arenaMapRef(map));
  if (canonicalJson(map) !== canonicalJson(published)) {
    throw new Error(`Incompatible arena map content for ${map.id}@${map.revision}`);
  }
  const definition: ArenaDefinition = {
    id: map.id,
    name: map.name,
    status: "active",
    themeId: map.themeId,
    grid: { ...map.layout.grid },
    tiles: { solid: [...map.layout.solid], breakable: [...map.layout.breakable] },
    spawns: map.layout.spawns.map((spawn) => ({ ...spawn, tile: { ...spawn.tile } })),
    version: `${map.revision}@${map.contentHash}`,
    createdAt: map.publication.publishedAt,
    updatedAt: map.publication.publishedAt,
  };
  const validation = validateArenaDefinition(definition);
  if (!validation.ok) {
    throw new Error(`Published arena map failed runtime validation: ${validation.issues.map((issue) => issue.code).join(",")}`);
  }
  return definition;
}

export function deriveArenaMapThumbnailSvg(map: PublishedArenaMap): string {
  const size = 48;
  const padding = 12;
  const width = map.layout.grid.width * size + padding * 2;
  const height = map.layout.grid.height * size + padding * 2;
  const solid = new Set(map.layout.solid);
  const breakable = new Set(map.layout.breakable);
  const spawns = new Set(map.layout.spawns.map((spawn) => tileKey(spawn.tile)));
  const portals = new Set(map.layout.portals.map((portal) => tileKey(portal.entry)));
  const lanes = new Set(map.layout.floorLayers.lanes);
  const cells: string[] = [];
  for (let y = 0; y < map.layout.grid.height; y += 1) {
    for (let x = 0; x < map.layout.grid.width; x += 1) {
      const key = `${x},${y}`;
      const fill = solid.has(key) ? "#797b7d"
        : breakable.has(key) ? "#cf7b45"
          : portals.has(key) ? "#22d3ee"
            : spawns.has(key) ? "#163656"
              : lanes.has(key) ? "#143152"
                : "#10233d";
      cells.push(`<rect x="${padding + x * size}" y="${padding + y * size}" width="${size - 2}" height="${size - 2}" rx="4" fill="${fill}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cidadela Arcana r1"><rect width="100%" height="100%" fill="#07111f"/>${cells.join("")}</svg>\n`;
}

function validatePublicationShape(value: Record<string, unknown>): ArenaMapVerificationIssue[] {
  const issues: ArenaMapVerificationIssue[] = [];
  const fail = (code: string, message: string): void => { issues.push({ code, message }); };
  if (value.schemaVersion !== "arena-map.v1") fail("schema_version_invalid", "schemaVersion must be arena-map.v1.");
  if (value.id !== "cidadela-arcana" || value.revision !== "r1") fail("identity_invalid", "Only cidadela-arcana@r1 is published in this catalog revision.");
  if (value.lifecycle !== "published") fail("lifecycle_invalid", "Catalog entries must be published.");
  const layout = isRecord(value.layout) ? value.layout : null;
  const grid = layout && isRecord(layout.grid) ? layout.grid : null;
  if (!grid || grid.width !== 11 || grid.height !== 9) fail("grid_invalid", "Cidadela Arcana r1 must be 11x9.");
  if (!layout || !Array.isArray(layout.solid) || !Array.isArray(layout.breakable) || !Array.isArray(layout.spawns) || !Array.isArray(layout.portals)) {
    fail("layout_invalid", "Layout collections are required.");
    return issues;
  }
  const solid = stringSet(layout.solid, "solid", issues);
  const breakable = stringSet(layout.breakable, "breakable", issues);
  const blocked = new Set([...solid, ...breakable]);
  for (const key of breakable) if (solid.has(key)) fail("tile_overlap", `Tile ${key} is both solid and breakable.`);
  const spawns = layout.spawns.filter(isRecord);
  if (spawns.length !== 4) fail("spawn_count_invalid", "Exactly four spawns are required.");
  const spawnKeys = new Set<string>();
  for (const spawn of spawns) {
    const tile = isRecord(spawn.tile) ? spawn.tile : null;
    const key = tile && Number.isInteger(tile.x) && Number.isInteger(tile.y) ? `${tile.x},${tile.y}` : "invalid";
    if (key === "invalid" || blocked.has(key) || spawnKeys.has(key)) fail("spawn_invalid", `Invalid spawn ${key}.`);
    spawnKeys.add(key);
    if (key !== "invalid" && openNeighborCount(key, blocked, 11, 9) < 2) fail("spawn_safety", `Spawn ${key} needs two exits.`);
  }
  const expectedSpawns = ["1,1", "9,1", "1,7", "9,7"];
  if (!sameStringSet(spawnKeys, new Set(expectedSpawns))) fail("spawn_contract_mismatch", "Canonical spawn positions changed.");
  if (!sameStringSet(new Set(layout.portals.filter(isRecord).map((portal) => isRecord(portal.entry) ? `${portal.entry.x},${portal.entry.y}` : "invalid")), PORTAL_KEYS)) {
    fail("portal_contract_mismatch", "Canonical portal positions changed.");
  }
  if (!isRotationallySymmetric(solid, 11, 9) || !isRotationallySymmetric(breakable, 11, 9)) {
    fail("rotational_symmetry_failed", "Solid and breakable tiles must keep exact 180-degree symmetry.");
  }
  if (!isOpenFieldConnected(solid, 11, 9)) fail("arena_disconnected", "Walkable field is not connected after breakables open.");
  const assets = isRecord(value.assets) ? value.assets : null;
  if (!assets || assets.assetSetId !== "cidadela-arcana/r1" || assets.basePath !== CITADEL_ASSET_ROOT) {
    fail("asset_set_invalid", "Versioned asset-set root is required.");
  } else {
    const paths = [isRecord(assets.atlas) ? assets.atlas.path : null, isRecord(assets.thumbnail) ? assets.thumbnail.path : null];
    if (paths.some((path) => typeof path !== "string" || !path.startsWith(CITADEL_ASSET_ROOT) || path.includes(".."))) {
      fail("asset_path_invalid", "Asset paths must remain under the immutable revision root.");
    }
  }
  return issues;
}

function stringSet(value: unknown[], label: string, issues: ArenaMapVerificationIssue[]): Set<string> {
  const result = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !/^(?:0|[1-9]\d*),(?:0|[1-9]\d*)$/.test(item)) {
      issues.push({ code: `${label}_tile_invalid`, message: `Invalid ${label} tile ${String(item)}.` });
      continue;
    }
    const [x, y] = item.split(",").map(Number);
    if (x < 0 || x >= 11 || y < 0 || y >= 9) issues.push({ code: `${label}_tile_out_of_bounds`, message: `${item} is out of bounds.` });
    if (result.has(item)) issues.push({ code: `${label}_tile_duplicate`, message: `${item} is duplicated.` });
    result.add(item);
  }
  return result;
}

function openNeighborCount(key: string, blocked: ReadonlySet<string>, width: number, height: number): number {
  const [x, y] = key.split(",").map(Number);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .filter(([nextX, nextY]) => nextX >= 0 && nextX < width && nextY >= 0 && nextY < height && !blocked.has(`${nextX},${nextY}`)).length;
}

function isOpenFieldConnected(blocked: ReadonlySet<string>, width: number, height: number): boolean {
  const start = "1,1";
  const queue = [start];
  const seen = new Set(queue);
  while (queue.length) {
    const key = queue.shift()!;
    const [x, y] = key.split(",").map(Number);
    for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = `${nextX},${nextY}`;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height || blocked.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  let openCount = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (!blocked.has(`${x},${y}`)) openCount += 1;
  return seen.size === openCount;
}

function isRotationallySymmetric(keys: ReadonlySet<string>, width: number, height: number): boolean {
  return [...keys].every((key) => {
    const [x, y] = key.split(",").map(Number);
    return keys.has(`${width - 1 - x},${height - 1 - y}`);
  });
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function arenaMapRef(map: ArenaMapRef): ArenaMapRef {
  return deepFreeze({ id: map.id, revision: map.revision, contentHash: map.contentHash });
}

function withoutContentHash(value: Record<string, unknown>): Record<string, unknown> {
  const { contentHash: _ignored, ...content } = value;
  return content;
}

function compareTileKeys(left: string, right: string): number {
  const [leftX, leftY] = left.split(",").map(Number);
  const [rightX, rightY] = right.split(",").map(Number);
  return leftY - rightY || leftX - rightX;
}

function tileKey(tile: Readonly<TileCoord>): string {
  return `${tile.x},${tile.y}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
