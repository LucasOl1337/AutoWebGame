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
} from "../Gameplay/types";
import type { OnlineGameSnapshot, OnlineInputState } from "../NetCode/protocol";
import { FIXED_STEP_MS } from "../PersonalConfig/config";

export type HeadlessRoundStatus = "complete" | "timeout" | "error";
export type HeadlessPolicyMode = "built-in" | "external";

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
}

export interface HeadlessRoundRunConfig {
  build: string;
  ruleset: string;
  arena: ArenaDefinition;
  randomness: HeadlessDeterministicRandomnessConfig;
  activePlayerIds: PlayerId[];
  characterSelections?: Partial<Record<PlayerId, number>>;
  policies: HeadlessRoundPolicy[];
  maxSteps?: number;
  timeoutMs?: number;
  allowUnsafeInlineExternalPolicies?: boolean;
}

export interface HeadlessDeterministicRandomnessConfig {
  randomnessMode: "deterministic";
  expectedInitialStateHash: `sha256:${string}`;
}

export interface HeadlessDeterministicRandomnessReceipt extends HeadlessDeterministicRandomnessConfig {
  effectiveInitialStateHash: `sha256:${string}`;
  requestedSeed: null;
  effectiveSeed: null;
  rngAlgorithm: null;
  rngVersion: null;
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
  error?: string;
}

interface ExecutablePolicy extends HeadlessPolicyReceipt {
  decide?: (context: HeadlessPolicyContext) => OnlineInputState;
}

interface ParsedRunConfig {
  metadata: Readonly<{ build: string; ruleset: string }>;
  randomness: HeadlessDeterministicRandomnessConfig;
  arena: ArenaDefinition;
  activePlayerIds: readonly PlayerId[];
  characterSelections: Readonly<Record<PlayerId, number>>;
  policies: readonly ExecutablePolicy[];
  maxSteps: number;
  timeoutMs: number;
  allowUnsafeInlineExternalPolicies: boolean;
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

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("Unicode contains an unpaired surrogate and cannot be canonicalized");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("Unicode contains an unpaired surrogate and cannot be canonicalized");
    }
  }
}

function canonicalJson(value: unknown): string {
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Initial state contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
      })
      .join(",")}}`;
  }
  throw new Error(`Initial state contains unsupported ${typeof value}`);
}

async function sha256Canonical(value: unknown): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable in this runtime");
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
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

function parseRandomness(value: unknown): HeadlessDeterministicRandomnessConfig {
  const randomness = asRecord(value, "randomness");
  if (randomness.randomnessMode !== "deterministic") {
    throw new Error("randomness.randomnessMode must be deterministic; seeded mode is not implemented");
  }
  const expectedInitialStateHash = requiredString(
    randomness.expectedInitialStateHash,
    "randomness.expectedInitialStateHash",
  );
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedInitialStateHash)) {
    throw new Error("randomness.expectedInitialStateHash must be sha256:<64 lowercase hex>");
  }
  return deepFreeze({
    randomnessMode: "deterministic",
    expectedInitialStateHash: expectedInitialStateHash as `sha256:${string}`,
  });
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
    if (policy.mode !== "built-in" && policy.mode !== "external") {
      throw new Error(`invalid mode for policy ${id}: ${String(policy.mode)}`);
    }
    const mode = policy.mode as HeadlessPolicyMode;
    if (mode === "external" && typeof policy.decide !== "function") {
      throw new Error(`external policy ${id} requires decide()`);
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
  return {
    metadata,
    randomness: parseRandomness(config.randomness),
    arena: parseArena(config.arena),
    activePlayerIds,
    characterSelections: parseCharacterSelections(config.characterSelections),
    policies: parsePolicies(config.policies, activePlayerIds),
    maxSteps: parsePositiveInteger(config.maxSteps, DEFAULT_MAX_STEPS, "maxSteps"),
    timeoutMs: parsePositiveNumber(config.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs"),
    allowUnsafeInlineExternalPolicies: config.allowUnsafeInlineExternalPolicies === true,
  };
}

function policyReceipts(policies: readonly ExecutablePolicy[]): HeadlessPolicyReceipt[] {
  return policies.map(({ id, playerId, mode, appliedVia }) => ({ id, playerId, mode, appliedVia }));
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
  const policiesVerified = config.policies.every((policy) => policy.mode === "built-in")
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
      requestedSeed: null,
      effectiveSeed: null,
      rngAlgorithm: null,
      rngVersion: null,
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
      deterministicPolicyPath: config.policies.every((policy) => policy.mode === "built-in"),
      timeoutEnforced: config.policies.every((policy) => policy.mode === "built-in"),
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

export function runHeadlessRound(config: HeadlessRoundRunConfig): Promise<HeadlessRoundReceipt>;
export async function runHeadlessRound(config: unknown): Promise<HeadlessRoundReceipt> {
  const startedAt = clockNow();
  let context = createEmptyContext();
  let parsedConfig: ParsedRunConfig | null = null;
  let steps = 0;
  let initialSnapshot: OnlineGameSnapshot | null = null;
  let lastSnapshot: OnlineGameSnapshot | null = null;

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
      ...(error ? { error } : {}),
    };
  };

  try {
    parsedConfig = parseConfig(config);
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
        if (policy.mode !== "external") continue;
        const observation = cloneFrozen(lastSnapshot);
        const input = policy.decide?.({
          playerId: policy.playerId,
          step: steps,
          elapsedMs: steps * FIXED_STEP_MS,
          snapshot: observation,
        });
        if (!input) throw new Error(`external policy ${policy.id} returned no input`);
        game.setServerPlayerInput(policy.playerId, input);
      }
      if (wallClockExpired()) return receipt("timeout", "wall-clock");

      game.advanceServerSimulation(FIXED_STEP_MS);
      steps += 1;
      lastSnapshot = cloneFrozen(game.exportOnlineSnapshot());
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
