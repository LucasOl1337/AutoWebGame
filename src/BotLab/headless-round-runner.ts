import { getArenaThemeById, ARENA_THEME_LIBRARY } from "../Arenas/arena-theme-library";
import { GameApp } from "../Engine/game-app";
import type { DirectionalSprites, GameAssets } from "../Engine/assets";
import {
  ALL_PLAYER_IDS,
  type ArenaDefinition,
  type MatchScore,
  type Mode,
  type PlayerId,
  type RoundOutcome,
  type TileCoord,
} from "../Gameplay/types";
import type { OnlineGameSnapshot, OnlineInputState } from "../NetCode/protocol";
import { FIXED_STEP_MS } from "../PersonalConfig/config";
import { sha256Canonical } from "../Shared/canonical-json";

export type HeadlessRoundStatus = "complete" | "timeout" | "error";
export type HeadlessPolicyMode = "built-in" | "external" | "registered";
export type HeadlessRegisteredPolicyScript = "neutral-v1" | "waypoint-v1" | "input-sequence-v1";

export interface HeadlessPolicyContext {
  playerId: PlayerId;
  step: number;
  elapsedMs: number;
  snapshot: Readonly<OnlineGameSnapshot>;
}

export interface HeadlessRoundPolicy {
  id: string;
  playerId: PlayerId;
  mode: HeadlessPolicyMode;
  decide?: (context: HeadlessPolicyContext) => OnlineInputState;
  scriptId?: HeadlessRegisteredPolicyScript;
  scriptConfig?: Readonly<{
    route?: readonly TileCoord[];
    variant?: number;
    segments?: readonly Readonly<{ untilStep: number; input: OnlineInputState }>[];
  }>;
  configHash?: `sha256:${string}`;
}

export interface HeadlessRoundRunConfig {
  build: string;
  ruleset: string;
  arena: ArenaDefinition;
  randomness: HeadlessRandomnessConfig;
  activePlayerIds: PlayerId[];
  characterSelections?: Partial<Record<PlayerId, number>>;
  policies: HeadlessRoundPolicy[];
  maxSteps?: number;
  timeoutMs?: number;
  allowUnsafeInlineExternalPolicies?: boolean;
  traceMode?: "snapshot-trace-v1";
}

export type HeadlessRandomnessConfig = Readonly<{
  randomnessMode: "deterministic";
  expectedInitialStateHash: `sha256:${string}`;
} | {
  randomnessMode: "seeded";
  requestedSeed: string;
  rngAlgorithm: "arena-seed-hash";
  rngVersion: "arena-runtime.v1";
  expectedInitialStateHash: `sha256:${string}`;
}>;

export interface HeadlessDeterministicRandomnessReceipt {
  randomnessMode: "deterministic" | "seeded";
  expectedInitialStateHash: `sha256:${string}`;
  effectiveInitialStateHash: `sha256:${string}`;
  requestedSeed: string | null;
  effectiveSeed: string | null;
  rngAlgorithm: "arena-seed-hash" | null;
  rngVersion: "arena-runtime.v1" | null;
}

export interface ArenaReceiptIdentity {
  id: string;
  version: string;
  themeId: string;
}

export interface HeadlessPolicyReceipt {
  id: string;
  playerId: PlayerId;
  mode: HeadlessPolicyMode;
  appliedVia: "startServerAuthoritativeMatch.botPlayerIds" | "setServerPlayerInput";
  scriptId?: HeadlessRegisteredPolicyScript;
  scriptHash?: `sha256:${string}`;
  configHash?: `sha256:${string}`;
}

export interface HeadlessReceiptProvenance {
  build: { claimed: string | null; verified: false; source: "caller" | "unavailable" };
  ruleset: { claimed: string | null; verified: false; source: "caller" | "unavailable" };
  arena: {
    claimed: ArenaReceiptIdentity | null;
    effective: ArenaReceiptIdentity | null;
    verified: boolean;
    source: "initial-snapshot" | "unavailable";
  };
  policies: {
    claimed: HeadlessPolicyReceipt[];
    verified: boolean;
    source: "initial-snapshot" | "unavailable";
  };
}

export interface HeadlessReproducibilityReceipt {
  /** Verification is scoped to the declared build/ruleset identity and the semantic state below. */
  status: "verified" | "unverified";
  scope: "declared-identity-and-semantic-initial-state";
  deterministicPolicyPath: boolean;
  timeoutEnforced: boolean;
  reasons: string[];
}

export interface HeadlessTerminalProof {
  valid: boolean;
  checks: {
    initialNonTerminal: boolean;
    freshRoundOutcome: boolean;
    roundNumberStable: boolean;
    modeCoherent: boolean;
    outcomeCoherent: boolean;
  };
  initial: {
    mode: Mode;
    roundNumber: number;
    roundOutcome: RoundOutcome | null;
    matchWinner: PlayerId | null;
  } | null;
  final: {
    mode: Mode;
    roundNumber: number;
    roundOutcome: RoundOutcome | null;
    matchWinner: PlayerId | null;
    score: MatchScore;
  } | null;
}

export interface HeadlessRoundReceipt {
  status: HeadlessRoundStatus;
  termination: "round-outcome" | "max-steps" | "wall-clock" | "error";
  build: string | null;
  ruleset: string | null;
  arena: ArenaReceiptIdentity | null;
  randomness: HeadlessDeterministicRandomnessReceipt | null;
  policies: HeadlessPolicyReceipt[];
  provenance: HeadlessReceiptProvenance;
  reproducibility: HeadlessReproducibilityReceipt;
  steps: number;
  stepMs: number;
  simulatedDurationMs: number;
  durationMs: number;
  winner: PlayerId | null;
  roundNumber: number;
  roundOutcome: RoundOutcome | null;
  matchWinner: PlayerId | null;
  score: MatchScore | null;
  terminalProof: HeadlessTerminalProof;
  limitations: string[];
  trace: Readonly<{
    scriptId: "snapshot-trace-v1";
    scriptHash: `sha256:${string}`;
    entries: readonly HeadlessSnapshotTraceEntry[];
  }> | null;
  error?: string;
}

export interface HeadlessSnapshotTraceEntry {
  readonly step: number;
  readonly players: Readonly<Record<PlayerId, Readonly<{ alive: boolean; tile: TileCoord }>>>;
  readonly powerUps: readonly Readonly<{ type: string; tile: TileCoord; revealed: boolean; collected: boolean }>[];
  readonly suddenDeathActive: boolean;
  readonly suddenDeathClosedTiles: readonly string[];
}

interface ExecutablePolicy extends HeadlessPolicyReceipt {
  decide?: (context: HeadlessPolicyContext) => OnlineInputState;
  scriptConfig?: HeadlessRoundPolicy["scriptConfig"];
}

const REGISTERED_POLICY_ARTIFACTS = deepFreeze({
  "neutral-v1": {
    artifact: "headless-registered-policy.v1",
    scriptId: "neutral-v1",
    input: "neutral-online-input",
    config: "none",
  },
  "waypoint-v1": {
    artifact: "headless-registered-policy.v1",
    scriptId: "waypoint-v1",
    input: "route-and-integer-variant",
    routing: "axis-priority-with-400-step-waypoints",
    portals: "outward-edge-direction-derived-from-snapshot-arena-grid",
    bombing: "after-step-600-every-120-steps-when-unowned",
  },
  "input-sequence-v1": {
    artifact: "headless-registered-policy.v1",
    scriptId: "input-sequence-v1",
    input: "bounded-step-segments-of-online-input-state",
    sequencing: "first-segment-whose-exclusive-until-step-is-greater-than-current-step",
    fallback: "last-segment",
    limits: { minimumSegments: 1, maximumSegments: 120, maximumUntilStep: 30000 },
  },
} as const);

const REGISTERED_POLICY_HASHES = deepFreeze({
  "neutral-v1": "sha256:5d24b6f22e92ddd0621913e18b53af58f23a15180534ebaca6f0a1a277b80b4f",
  "waypoint-v1": "sha256:7701a427660306ff94bb561cb3e416c19bc878715baa722b11cb76ed8fc817c4",
  "input-sequence-v1": "sha256:01c33d600c422aa5127e9c47011b86179a96fe426995d61df60d434960e65d83",
} as const);

const SNAPSHOT_TRACE_ARTIFACT = deepFreeze({
  artifact: "snapshot-trace.v1",
  canonicalization: "strict-canonical-json.v1",
  digest: "sha256-webcrypto",
  projection: {
    step: "non-negative-simulation-step",
    players: "player-id-to-alive-and-integer-tile",
    powerUps: "type-tile-revealed-collected-in-runtime-order",
    suddenDeathActive: "boolean",
    suddenDeathClosedTiles: "runtime-ordered-tile-keys",
  },
} as const);

const SNAPSHOT_TRACE_ARTIFACT_HASH = "sha256:75dc1674d467423bb26dd0aed6747798fda2ad908ad3687263ec7186eff234f3" as const;

interface ParsedRunConfig {
  metadata: Readonly<{ build: string; ruleset: string }>;
  randomness: HeadlessRandomnessConfig;
  arena: ArenaDefinition;
  activePlayerIds: readonly PlayerId[];
  characterSelections: Readonly<Record<PlayerId, number>>;
  policies: readonly ExecutablePolicy[];
  maxSteps: number;
  timeoutMs: number;
  allowUnsafeInlineExternalPolicies: boolean;
  traceMode?: "snapshot-trace-v1";
}

interface ReceiptContext {
  build: string | null;
  ruleset: string | null;
  arena: ArenaReceiptIdentity | null;
  randomness: HeadlessDeterministicRandomnessReceipt | null;
  policies: HeadlessPolicyReceipt[];
  provenance: HeadlessReceiptProvenance;
  reproducibility: HeadlessReproducibilityReceipt;
  limitations: string[];
}

const DEFAULT_MAX_STEPS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const cloneWithPlatform = typeof structuredClone === "function"
  ? structuredClone.bind(globalThis)
  : <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function clockNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(cloneWithPlatform(value));
}

/**
 * Simulation-only initial state. Transport clocks/acks/frame ids and presentation
 * flags are deliberately excluded; every field below can affect rules or policy
 * observations. Collections whose order is not semantic are sorted before JCS.
 */
function initialSemanticState(snapshot: OnlineGameSnapshot): unknown {
  return {
    mode: snapshot.mode,
    roomMode: snapshot.roomMode,
    arena: snapshot.arena,
    breakableTiles: [...snapshot.breakableTiles].sort(),
    powerUps: [...snapshot.powerUps].sort((left, right) => (
      `${left.tile.x},${left.tile.y},${left.type}`.localeCompare(`${right.tile.x},${right.tile.y},${right.type}`)
    )),
    players: snapshot.players,
    bombs: snapshot.bombs,
    flames: snapshot.flames,
    magicBeams: snapshot.magicBeams,
    nextBombId: snapshot.nextBombId,
    score: snapshot.score,
    roundNumber: snapshot.roundNumber,
    roundTimeMs: snapshot.roundTimeMs,
    paused: snapshot.paused,
    roundOutcome: snapshot.roundOutcome,
    matchWinner: snapshot.matchWinner,
    suddenDeathActive: snapshot.suddenDeathActive,
    suddenDeathTickMs: snapshot.suddenDeathTickMs,
    suddenDeathIndex: snapshot.suddenDeathIndex,
    suddenDeathClosedTiles: [...snapshot.suddenDeathClosedTiles].sort(),
    suddenDeathClosingTiles: snapshot.suddenDeathClosingTiles,
    selectedCharacterIndex: snapshot.selectedCharacterIndex,
    activePlayerIds: [...snapshot.activePlayerIds].sort(),
    botPlayerIds: [...snapshot.botPlayerIds].sort(),
    endlessStats: snapshot.endlessStats,
  };
}

function createEmptyDirectionalSprites(): DirectionalSprites {
  const emptyDirections = () => ({ up: [], down: [], left: [], right: [] });
  return {
    up: null,
    down: null,
    left: null,
    right: null,
    idle: emptyDirections(),
    walk: emptyDirections(),
    run: emptyDirections(),
    cast: emptyDirections(),
    attack: emptyDirections(),
    death: emptyDirections(),
  };
}

function createHeadlessAssets(arena: ArenaDefinition): GameAssets {
  const sprites = createEmptyDirectionalSprites();
  const arenaTheme = getArenaThemeById(arena.themeId) ?? ARENA_THEME_LIBRARY[0];
  return {
    players: { 1: sprites, 2: sprites, 3: sprites, 4: sprites },
    characterSpriteLoader: async () => sprites,
    arenaTheme,
    floor: { base: null, lane: null, spawn: null },
    props: { wall: null, crate: null, bomb: null, flame: null },
    powerUps: {},
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requiredSha256(value: unknown, label: string): `sha256:${string}` {
  const digest = requiredString(value, label);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  return digest as `sha256:${string}`;
}

function parsePositiveInteger(value: unknown, fallback: number, label: string): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isInteger(resolved) || (resolved as number) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return resolved as number;
}

function parsePositiveNumber(value: unknown, fallback: number, label: string): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${label} must be positive`);
  }
  return resolved;
}

function parseRandomness(value: unknown): HeadlessRandomnessConfig {
  const randomness = asRecord(value, "randomness");
  if (randomness.randomnessMode !== "deterministic" && randomness.randomnessMode !== "seeded") {
    throw new Error("randomness.randomnessMode must be deterministic or seeded");
  }
  const expectedInitialStateHash = requiredString(
    randomness.expectedInitialStateHash,
    "randomness.expectedInitialStateHash",
  );
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedInitialStateHash)) {
    throw new Error("randomness.expectedInitialStateHash must be sha256:<64 lowercase hex>");
  }
  if (randomness.randomnessMode === "seeded") {
    if (randomness.rngAlgorithm !== "arena-seed-hash" || randomness.rngVersion !== "arena-runtime.v1") {
      throw new Error("seeded randomness requires arena-seed-hash arena-runtime.v1");
    }
    return deepFreeze({
      randomnessMode: "seeded",
      requestedSeed: requiredString(randomness.requestedSeed, "randomness.requestedSeed"),
      rngAlgorithm: "arena-seed-hash",
      rngVersion: "arena-runtime.v1",
      expectedInitialStateHash: expectedInitialStateHash as `sha256:${string}`,
    });
  }
  return deepFreeze({ randomnessMode: "deterministic", expectedInitialStateHash: expectedInitialStateHash as `sha256:${string}` });
}

function parseArena(value: unknown): ArenaDefinition {
  const arena = cloneWithPlatform(asRecord(value, "arena")) as unknown as ArenaDefinition;
  requiredString(arena.id, "arena.id");
  requiredString(arena.name, "arena.name");
  requiredString(arena.themeId, "arena.themeId");
  requiredString(arena.version, "arena.version");
  requiredString(arena.createdAt, "arena.createdAt");
  requiredString(arena.updatedAt, "arena.updatedAt");
  if (!arena.grid || !Number.isInteger(arena.grid.width) || !Number.isInteger(arena.grid.height)) {
    throw new Error("arena.grid must contain integer width and height");
  }
  if (!arena.tiles || !Array.isArray(arena.tiles.solid) || !Array.isArray(arena.tiles.breakable)) {
    throw new Error("arena.tiles must contain solid and breakable arrays");
  }
  if (!Array.isArray(arena.spawns)) throw new Error("arena.spawns must be an array");
  return deepFreeze(arena);
}

function parsePlayerIds(value: unknown): readonly PlayerId[] {
  if (!Array.isArray(value)) throw new Error("activePlayerIds must be an array");
  const players = value.map((item) => {
    if (typeof item !== "number" || !ALL_PLAYER_IDS.includes(item as PlayerId)) {
      throw new Error(`invalid active player: ${String(item)}`);
    }
    return item as PlayerId;
  });
  if (new Set(players).size !== players.length || players.length < 2) {
    throw new Error("activePlayerIds must contain at least two unique players");
  }
  return deepFreeze([...players]);
}

function parseCharacterSelections(value: unknown): Readonly<Record<PlayerId, number>> {
  const selections = value === undefined ? {} : asRecord(value, "characterSelections");
  const result = ALL_PLAYER_IDS.reduce((record, playerId) => {
    const selected = selections[playerId];
    if (selected !== undefined && (typeof selected !== "number" || !Number.isInteger(selected))) {
      throw new Error(`characterSelections.${playerId} must be an integer`);
    }
    record[playerId] = (selected as number | undefined) ?? 0;
    return record;
  }, {} as Record<PlayerId, number>);
  return deepFreeze(result);
}

function createRegisteredPolicy(
  scriptId: HeadlessRegisteredPolicyScript,
  value: unknown,
): NonNullable<ExecutablePolicy["decide"]> {
  if (scriptId === "neutral-v1") {
    if (value !== undefined && Object.keys(asRecord(value, "scriptConfig")).length > 0) {
      throw new Error("neutral-v1 does not accept scriptConfig");
    }
    return () => ({
      direction: null,
      bombPressed: false,
      detonatePressed: false,
      skillPressed: false,
      skillHeld: false,
    });
  }
  const config = asRecord(value, "scriptConfig");
  if (scriptId === "input-sequence-v1") {
    if (!Array.isArray(config.segments) || config.segments.length < 1 || config.segments.length > 120) {
      throw new Error("input-sequence-v1 requires 1-120 segments");
    }
    let previousUntilStep = 0;
    const segments = config.segments.map((value, index) => {
      const segment = asRecord(value, `scriptConfig.segments[${index}]`);
      if (!Number.isInteger(segment.untilStep) || (segment.untilStep as number) <= previousUntilStep || (segment.untilStep as number) > 30_000) {
        throw new Error(`scriptConfig.segments[${index}].untilStep must increase within 1..30000`);
      }
      previousUntilStep = segment.untilStep as number;
      return { untilStep: previousUntilStep, input: parseOnlineInput(segment.input, `scriptConfig.segments[${index}].input`) };
    });
    return ({ step }) => segments.find((segment) => step < segment.untilStep)?.input ?? segments.at(-1)!.input;
  }
  if (!Array.isArray(config.route) || config.route.length === 0) throw new Error("waypoint-v1 requires a non-empty route");
  const route = config.route.map((value, index) => {
    const tile = asRecord(value, `scriptConfig.route[${index}]`);
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) throw new Error(`scriptConfig.route[${index}] must be an integer tile`);
    return { x: tile.x as number, y: tile.y as number };
  });
  const variant = config.variant;
  if (!Number.isInteger(variant)) throw new Error("waypoint-v1 requires an integer variant");
  return ({ playerId, step, snapshot }) => {
    const player = snapshot.players[playerId];
    const target = route[Math.floor(step / 400) % route.length];
    const deltaX = target.x - player.tile.x;
    const deltaY = target.y - player.tile.y;
    const horizontalFirst = target.y === 0
      || target.y === snapshot.arena.grid.height - 1
      || (variant as number) % 2 === 1;
    const direction = deltaX === 0 && deltaY === 0
      ? registeredPortalExitDirection(target, snapshot.arena.grid)
      : registeredDirectionFor(deltaX, deltaY, horizontalFirst);
    const ownedBomb = snapshot.bombs.some((bomb) => bomb.ownerId === playerId);
    return {
      direction,
      bombPressed: !ownedBomb && step >= 600 && step % 120 === 0,
      detonatePressed: false,
      skillPressed: false,
      skillHeld: false,
    };
  };
}

function parseOnlineInput(value: unknown, label: string): OnlineInputState {
  const input = asRecord(value, label);
  if (input.direction !== null && input.direction !== "up" && input.direction !== "down"
    && input.direction !== "left" && input.direction !== "right") throw new Error(`${label}.direction is invalid`);
  if (typeof input.bombPressed !== "boolean" || typeof input.detonatePressed !== "boolean"
    || typeof input.skillPressed !== "boolean" || typeof input.skillHeld !== "boolean") {
    throw new Error(`${label} action flags must be boolean`);
  }
  return deepFreeze({
    direction: input.direction,
    bombPressed: input.bombPressed,
    detonatePressed: input.detonatePressed,
    skillPressed: input.skillPressed,
    skillHeld: input.skillHeld,
  } as OnlineInputState);
}

function registeredPortalExitDirection(
  tile: Readonly<TileCoord>,
  grid: Readonly<{ width: number; height: number }>,
): OnlineInputState["direction"] {
  if (tile.y === 0) return "up";
  if (tile.y === grid.height - 1) return "down";
  if (tile.x === 0) return "left";
  if (tile.x === grid.width - 1) return "right";
  return null;
}

function registeredDirectionFor(deltaX: number, deltaY: number, horizontalFirst: boolean): OnlineInputState["direction"] {
  if (horizontalFirst && deltaX !== 0) return deltaX > 0 ? "right" : "left";
  if (deltaY !== 0) return deltaY > 0 ? "down" : "up";
  if (deltaX !== 0) return deltaX > 0 ? "right" : "left";
  return null;
}

export async function getRegisteredPolicyArtifactHash(
  scriptId: HeadlessRegisteredPolicyScript,
): Promise<`sha256:${string}`> {
  return sha256Canonical(REGISTERED_POLICY_ARTIFACTS[scriptId]);
}

export async function verifyRegisteredPolicyArtifact(
  scriptId: HeadlessRegisteredPolicyScript,
  expectedHash: `sha256:${string}`,
): Promise<void> {
  const effectiveHash = await getRegisteredPolicyArtifactHash(scriptId);
  if (effectiveHash !== expectedHash) throw new Error(`registered policy ${scriptId} artifact hash mismatch`);
}

function parsePolicies(value: unknown, activePlayerIds: readonly PlayerId[]): readonly ExecutablePolicy[] {
  if (!Array.isArray(value)) throw new Error("policies must be an array");
  const activePlayers = new Set(activePlayerIds);
  const policyIds = new Set<string>();
  const policiesByPlayer = new Set<PlayerId>();
  const policies = value.map((item, index) => {
    const policy = asRecord(item, `policies[${index}]`);
    const id = requiredString(policy.id, `policies[${index}].id`);
    if (policyIds.has(id)) throw new Error(`duplicate policy id: ${id}`);
    if (typeof policy.playerId !== "number" || !ALL_PLAYER_IDS.includes(policy.playerId as PlayerId)) {
      throw new Error(`invalid player for policy ${id}`);
    }
    const playerId = policy.playerId as PlayerId;
    if (!activePlayers.has(playerId)) throw new Error(`policy ${id} targets an inactive player`);
    if (policiesByPlayer.has(playerId)) throw new Error(`multiple policies target player ${playerId}`);
    if (policy.mode !== "built-in" && policy.mode !== "external" && policy.mode !== "registered") {
      throw new Error(`invalid mode for policy ${id}: ${String(policy.mode)}`);
    }
    const mode = policy.mode as HeadlessPolicyMode;
    if (mode === "external" && typeof policy.decide !== "function") {
      throw new Error(`external policy ${id} requires decide()`);
    }
    let registered: Pick<ExecutablePolicy, "decide" | "scriptId" | "scriptHash" | "scriptConfig" | "configHash"> | null = null;
    if (mode === "registered") {
      const scriptId = policy.scriptId;
      if (scriptId !== "neutral-v1" && scriptId !== "waypoint-v1" && scriptId !== "input-sequence-v1") {
        throw new Error(`registered policy ${id} has an unknown scriptId`);
      }
      registered = {
        scriptId,
        scriptHash: REGISTERED_POLICY_HASHES[scriptId],
        decide: createRegisteredPolicy(scriptId, policy.scriptConfig),
        ...(policy.scriptConfig === undefined
          ? {}
          : { scriptConfig: cloneWithPlatform(policy.scriptConfig) as ExecutablePolicy["scriptConfig"] }),
        configHash: requiredSha256(policy.configHash, `registered policy ${id} configHash`),
      };
    }
    policyIds.add(id);
    policiesByPlayer.add(playerId);
    return {
      id,
      playerId,
      mode,
      appliedVia: mode === "built-in"
        ? "startServerAuthoritativeMatch.botPlayerIds" as const
        : "setServerPlayerInput" as const,
      ...(mode === "external"
        ? { decide: policy.decide as ExecutablePolicy["decide"] }
        : {}),
      ...(registered ?? {}),
    };
  });
  for (const playerId of activePlayers) {
    if (!policiesByPlayer.has(playerId)) throw new Error(`missing policy for active player ${playerId}`);
  }
  return deepFreeze(policies);
}

function parseConfig(value: unknown): ParsedRunConfig {
  const config = asRecord(value, "config");
  if (config.seed !== undefined && config.seed !== null) {
    throw new Error("seed is not supported; use deterministic randomness with an expected initial-state hash");
  }
  const activePlayerIds = parsePlayerIds(config.activePlayerIds);
  const metadata = deepFreeze({
    build: requiredString(config.build, "build"),
    ruleset: requiredString(config.ruleset, "ruleset"),
  });
  if (config.traceMode !== undefined && config.traceMode !== "snapshot-trace-v1") throw new Error("traceMode is invalid");
  const randomness = parseRandomness(config.randomness);
  const arena = parseArena(config.arena);
  return {
    metadata,
    randomness,
    arena: randomness.randomnessMode === "seeded"
      ? deepFreeze({ ...arena, randomSeed: randomness.requestedSeed })
      : arena,
    activePlayerIds,
    characterSelections: parseCharacterSelections(config.characterSelections),
    policies: parsePolicies(config.policies, activePlayerIds),
    maxSteps: parsePositiveInteger(config.maxSteps, DEFAULT_MAX_STEPS, "maxSteps"),
    timeoutMs: parsePositiveNumber(config.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs"),
    allowUnsafeInlineExternalPolicies: config.allowUnsafeInlineExternalPolicies === true,
    ...(config.traceMode ? { traceMode: "snapshot-trace-v1" as const } : {}),
  };
}

function policyReceipts(policies: readonly ExecutablePolicy[]): HeadlessPolicyReceipt[] {
  return policies.map(({ id, playerId, mode, appliedVia, scriptId, scriptHash, configHash }) => ({
    id,
    playerId,
    mode,
    appliedVia,
    ...(scriptId && scriptHash && configHash ? { scriptId, scriptHash, configHash } : {}),
  }));
}

function arenaIdentity(arena: Pick<ArenaDefinition, "id" | "version" | "themeId">): ArenaReceiptIdentity {
  return { id: arena.id, version: arena.version, themeId: arena.themeId };
}

function sameArenaIdentity(left: ArenaReceiptIdentity, right: ArenaReceiptIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.themeId === right.themeId;
}

function createEmptyContext(): ReceiptContext {
  return {
    build: null,
    ruleset: null,
    arena: null,
    randomness: null,
    policies: [],
    provenance: {
      build: { claimed: null, verified: false, source: "unavailable" },
      ruleset: { claimed: null, verified: false, source: "unavailable" },
      arena: { claimed: null, effective: null, verified: false, source: "unavailable" },
      policies: { claimed: [], verified: false, source: "unavailable" },
    },
    reproducibility: {
      status: "unverified",
      scope: "declared-identity-and-semantic-initial-state",
      deterministicPolicyPath: false,
      timeoutEnforced: false,
      reasons: ["configuration-not-validated"],
    },
    limitations: [],
  };
}

function contextFromConfig(config: ParsedRunConfig): ReceiptContext {
  const policies = policyReceipts(config.policies);
  const hasExternalPolicies = config.policies.some((policy) => policy.mode === "external");
  const claimedArena = arenaIdentity(config.arena);
  const limitations: string[] = [
    "build-and-ruleset-identities-are-caller-declared; binary provenance is not verified by this runner.",
  ];
  if (hasExternalPolicies) {
    limitations.push(
      "unsafe-inline-external-policy: synchronous decide() cannot be preempted; wall-clock timeout is detected only after it returns.",
    );
  }
  const reasons = hasExternalPolicies ? ["external-policy-code-and-state-not-verified"] : [];
  return deepFreeze({
    build: config.metadata.build,
    ruleset: config.metadata.ruleset,
    arena: null,
    randomness: null,
    policies,
    provenance: {
      build: { claimed: config.metadata.build, verified: false, source: "caller" },
      ruleset: { claimed: config.metadata.ruleset, verified: false, source: "caller" },
      arena: { claimed: claimedArena, effective: null, verified: false, source: "unavailable" },
      policies: { claimed: policies, verified: false, source: "unavailable" },
    },
    reproducibility: {
      status: "unverified",
      scope: "declared-identity-and-semantic-initial-state",
      deterministicPolicyPath: !hasExternalPolicies,
      timeoutEnforced: !hasExternalPolicies,
      reasons,
    },
    limitations,
  });
}

function contextFromInitialSnapshot(
  context: ReceiptContext,
  config: ParsedRunConfig,
  snapshot: OnlineGameSnapshot,
  effectiveInitialStateHash: `sha256:${string}`,
): ReceiptContext {
  const effectiveArena = arenaIdentity(snapshot.arena);
  const claimedArena = context.provenance.arena.claimed;
  const expectedBuiltIns = config.policies
    .filter((policy) => policy.mode === "built-in")
    .map((policy) => policy.playerId)
    .sort();
  const observedBuiltIns = [...snapshot.botPlayerIds].sort();
  const policiesVerified = config.policies.every((policy) => policy.mode !== "external")
    && expectedBuiltIns.length === observedBuiltIns.length
    && expectedBuiltIns.every((playerId, index) => playerId === observedBuiltIns[index]);
  const arenaVerified = claimedArena !== null && sameArenaIdentity(claimedArena, effectiveArena);
  const initialStateVerified = config.randomness.expectedInitialStateHash === effectiveInitialStateHash;
  const reasons = [
    ...(!arenaVerified ? ["arena-identity-mismatch"] : []),
    ...(!policiesVerified ? ["policy-identity-not-verifiable"] : []),
    ...(!initialStateVerified ? ["randomness_mismatch"] : []),
  ];
  return deepFreeze({
    ...context,
    arena: effectiveArena,
    randomness: {
      ...config.randomness,
      effectiveInitialStateHash,
      requestedSeed: config.randomness.randomnessMode === "seeded" ? config.randomness.requestedSeed : null,
      effectiveSeed: config.randomness.randomnessMode === "seeded" ? snapshot.arena.randomSeed ?? null : null,
      rngAlgorithm: config.randomness.randomnessMode === "seeded" ? config.randomness.rngAlgorithm : null,
      rngVersion: config.randomness.randomnessMode === "seeded" ? config.randomness.rngVersion : null,
    },
    provenance: {
      ...context.provenance,
      arena: {
        claimed: claimedArena,
        effective: effectiveArena,
        verified: arenaVerified,
        source: "initial-snapshot",
      },
      policies: {
        claimed: context.policies,
        verified: policiesVerified,
        source: "initial-snapshot",
      },
    },
    reproducibility: {
      status: reasons.length === 0 ? "verified" : "unverified",
      scope: "declared-identity-and-semantic-initial-state",
      deterministicPolicyPath: config.policies.every((policy) => policy.mode !== "external"),
      timeoutEnforced: config.policies.every((policy) => policy.mode !== "external"),
      reasons,
    },
  });
}

function createTerminalProof(
  initialSnapshot: OnlineGameSnapshot | null,
  finalSnapshot: OnlineGameSnapshot | null,
  activePlayerIds: readonly PlayerId[],
): HeadlessTerminalProof {
  const initialNonTerminal = initialSnapshot !== null
    && initialSnapshot.mode === "match"
    && initialSnapshot.roundOutcome === null;
  const roundNumberStable = initialSnapshot !== null
    && finalSnapshot !== null
    && initialSnapshot.roundNumber === finalSnapshot.roundNumber;
  const freshRoundOutcome = initialNonTerminal
    && finalSnapshot !== null
    && finalSnapshot.roundOutcome !== null;
  const modeCoherent = finalSnapshot !== null && finalSnapshot.mode === "match";
  const outcome = finalSnapshot?.roundOutcome ?? null;
  const outcomeCoherent = outcome !== null && (
    outcome.reason === "elimination"
      ? outcome.winner !== null && activePlayerIds.includes(outcome.winner)
      : outcome.winner === null
  );
  return {
    valid: initialNonTerminal && freshRoundOutcome && roundNumberStable && modeCoherent && outcomeCoherent,
    checks: { initialNonTerminal, freshRoundOutcome, roundNumberStable, modeCoherent, outcomeCoherent },
    initial: initialSnapshot ? {
      mode: initialSnapshot.mode,
      roundNumber: initialSnapshot.roundNumber,
      roundOutcome: initialSnapshot.roundOutcome ? { ...initialSnapshot.roundOutcome } : null,
      matchWinner: initialSnapshot.matchWinner,
    } : null,
    final: finalSnapshot ? {
      mode: finalSnapshot.mode,
      roundNumber: finalSnapshot.roundNumber,
      roundOutcome: finalSnapshot.roundOutcome ? { ...finalSnapshot.roundOutcome } : null,
      matchWinner: finalSnapshot.matchWinner,
      score: { ...finalSnapshot.score },
    } : null,
  };
}

function safeErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "Unknown runner error";
  }
}

function snapshotTraceEntry(snapshot: Readonly<OnlineGameSnapshot>, step: number): HeadlessSnapshotTraceEntry {
  const players = ALL_PLAYER_IDS.reduce((result, playerId) => {
    result[playerId] = { alive: snapshot.players[playerId].alive, tile: { ...snapshot.players[playerId].tile } };
    return result;
  }, {} as Record<PlayerId, { alive: boolean; tile: TileCoord }>);
  return deepFreeze({
    step,
    players,
    powerUps: snapshot.powerUps.map((powerUp) => ({
      type: powerUp.type,
      tile: { ...powerUp.tile },
      revealed: powerUp.revealed,
      collected: powerUp.collected,
    })),
    suddenDeathActive: snapshot.suddenDeathActive,
    suddenDeathClosedTiles: [...snapshot.suddenDeathClosedTiles],
  });
}

export async function getSnapshotTraceArtifactHash(): Promise<`sha256:${string}`> {
  return sha256Canonical(SNAPSHOT_TRACE_ARTIFACT);
}

export async function verifySnapshotTraceArtifact(expectedHash: `sha256:${string}`): Promise<void> {
  const effectiveHash = await getSnapshotTraceArtifactHash();
  if (effectiveHash !== expectedHash) throw new Error("snapshot trace artifact hash mismatch");
}

async function snapshotTraceArtifactHash(): Promise<`sha256:${string}`> {
  await verifySnapshotTraceArtifact(SNAPSHOT_TRACE_ARTIFACT_HASH);
  return SNAPSHOT_TRACE_ARTIFACT_HASH;
}

export function runHeadlessRound(config: HeadlessRoundRunConfig): Promise<HeadlessRoundReceipt>;
export async function runHeadlessRound(config: unknown): Promise<HeadlessRoundReceipt> {
  const startedAt = clockNow();
  let context = createEmptyContext();
  let parsedConfig: ParsedRunConfig | null = null;
  let steps = 0;
  let initialSnapshot: OnlineGameSnapshot | null = null;
  let lastSnapshot: OnlineGameSnapshot | null = null;
  const traceEntries: HeadlessSnapshotTraceEntry[] = [];
  let traceScriptHash: `sha256:${string}` | null = null;

  const receipt = (
    status: HeadlessRoundStatus,
    termination: HeadlessRoundReceipt["termination"],
    error?: string,
  ): HeadlessRoundReceipt => {
    const outcome = lastSnapshot?.roundOutcome ? { ...lastSnapshot.roundOutcome } : null;
    return {
      status,
      termination,
      build: context.build,
      ruleset: context.ruleset,
      arena: context.arena,
      randomness: context.randomness,
      policies: context.policies,
      provenance: context.provenance,
      reproducibility: context.reproducibility,
      steps,
      stepMs: FIXED_STEP_MS,
      simulatedDurationMs: steps * FIXED_STEP_MS,
      durationMs: Math.max(0, clockNow() - startedAt),
      winner: outcome?.winner ?? null,
      roundNumber: lastSnapshot?.roundNumber ?? 0,
      roundOutcome: outcome,
      matchWinner: lastSnapshot?.matchWinner ?? null,
      score: lastSnapshot ? { ...lastSnapshot.score } : null,
      terminalProof: createTerminalProof(initialSnapshot, lastSnapshot, parsedConfig?.activePlayerIds ?? []),
      limitations: context.limitations,
      trace: parsedConfig?.traceMode === "snapshot-trace-v1" && traceScriptHash
        ? deepFreeze({ scriptId: "snapshot-trace-v1" as const, scriptHash: traceScriptHash, entries: [...traceEntries] })
        : null,
      ...(error ? { error } : {}),
    };
  };

  try {
    parsedConfig = parseConfig(config);
    if (parsedConfig.traceMode === "snapshot-trace-v1") traceScriptHash = await snapshotTraceArtifactHash();
    for (const policy of parsedConfig.policies) {
      if (policy.mode !== "registered") continue;
      await verifyRegisteredPolicyArtifact(policy.scriptId!, policy.scriptHash!);
      const effectiveConfigHash = await sha256Canonical({
        scriptId: policy.scriptId,
        scriptHash: policy.scriptHash,
        ...(policy.scriptConfig === undefined ? {} : { scriptConfig: policy.scriptConfig }),
      });
      if (effectiveConfigHash !== policy.configHash) {
        throw new Error(`registered policy ${policy.id} registry/config hash mismatch`);
      }
    }
    context = contextFromConfig(parsedConfig);
    const hasExternalPolicies = parsedConfig.policies.some((policy) => policy.mode === "external");
    if (hasExternalPolicies && !parsedConfig.allowUnsafeInlineExternalPolicies) {
      throw new Error(
        "External policies require allowUnsafeInlineExternalPolicies: true because synchronous decide() cannot be preempted.",
      );
    }

    const root = { appendChild: () => undefined } as unknown as HTMLElement;
    const game = new GameApp(root, createHeadlessAssets(parsedConfig.arena), parsedConfig.arena);
    const builtInPlayers = parsedConfig.policies
      .filter((policy) => policy.mode === "built-in")
      .map((policy) => policy.playerId);
    game.startServerAuthoritativeMatch(
      [...parsedConfig.activePlayerIds],
      { ...parsedConfig.characterSelections },
      { arena: parsedConfig.arena, roomMode: "classic", botPlayerIds: builtInPlayers },
    );
    initialSnapshot = cloneFrozen(game.exportOnlineSnapshot());
    lastSnapshot = initialSnapshot;
    if (parsedConfig.traceMode === "snapshot-trace-v1") traceEntries.push(snapshotTraceEntry(initialSnapshot, 0));
    const effectiveInitialStateHash = await sha256Canonical(initialSemanticState(initialSnapshot));
    context = contextFromInitialSnapshot(context, parsedConfig, initialSnapshot, effectiveInitialStateHash);
    if (initialSnapshot.mode !== "match" || initialSnapshot.roundOutcome !== null) {
      return receipt("error", "error", "GameApp did not start from a fresh non-terminal round");
    }
    if (context.reproducibility.reasons.includes("randomness_mismatch")) {
      return receipt("error", "error", "randomness_mismatch: initial semantic state differs from expectation");
    }

    const wallClockExpired = () => clockNow() - startedAt >= parsedConfig!.timeoutMs;
    while (steps < parsedConfig.maxSteps) {
      if (wallClockExpired()) return receipt("timeout", "wall-clock");

      for (const policy of parsedConfig.policies) {
        if (policy.mode === "built-in") continue;
        const observation = cloneFrozen(lastSnapshot);
        const input = policy.decide?.({
          playerId: policy.playerId,
          step: steps,
          elapsedMs: steps * FIXED_STEP_MS,
          snapshot: observation,
        });
        if (!input) throw new Error(`${policy.mode} policy ${policy.id} returned no input`);
        game.setServerPlayerInput(policy.playerId, input);
      }
      if (wallClockExpired()) return receipt("timeout", "wall-clock");

      game.advanceServerSimulation(FIXED_STEP_MS);
      steps += 1;
      lastSnapshot = cloneFrozen(game.exportOnlineSnapshot());
      if (parsedConfig.traceMode === "snapshot-trace-v1") traceEntries.push(snapshotTraceEntry(lastSnapshot, steps));
      if (wallClockExpired()) return receipt("timeout", "wall-clock");
      if (lastSnapshot.roundOutcome !== null) {
        const proof = createTerminalProof(initialSnapshot, lastSnapshot, parsedConfig.activePlayerIds);
        if (!proof.valid) {
          return receipt("error", "error", "Terminal round snapshot failed coherence checks");
        }
        return receipt("complete", "round-outcome");
      }
    }

    return receipt("timeout", "max-steps");
  } catch (error) {
    return receipt("error", "error", safeErrorMessage(error));
  }
}
