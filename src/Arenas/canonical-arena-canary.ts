import { runHeadlessRound, type HeadlessRoundReceipt, type HeadlessSnapshotTraceEntry } from "../BotLab/headless-round-runner";
import type { PlayerId, TileCoord } from "../Gameplay/types";
import { FIXED_STEP_MS } from "../PersonalConfig/config";
import { sha256Canonical } from "../Shared/canonical-json";
import { buildArenaRuntimeConfig } from "./arena";
import {
  getPublishedArenaMap,
  toArenaDefinition,
  verifyPublishedArenaMap,
  type ArenaMapRef,
  type PublishedArenaMap,
} from "./canonical-arena-catalog";

export interface ArenaCanaryBudgets {
  readonly roundCount: number;
  readonly maxStepsPerRound: number;
  readonly timeoutMsPerRound: number;
  readonly thresholds: Readonly<{
    latestCentralContestMs: number;
    maxCentralOccupancyRatio: number;
    maxCentralDominanceMs: number;
    minimumRouteEdges: number;
    minimumEliminationSectors: number;
    minimumPortalUsage: number;
  }>;
}

type Sector = "north-west" | "north-east" | "south-west" | "south-east" | "center";

interface MutableMetrics {
  firstCentralContestStep: number | null;
  centralParticipantSteps: number;
  aliveParticipantSteps: number;
  exclusiveCentralControlSteps: number;
  eligibleCentralControlSteps: number;
  maxCentralStreakSteps: number;
  centralStreakByPlayer: Record<PlayerId, number>;
  routeEdges: Set<string>;
  routeEdgesByPlayer: Record<PlayerId, Set<string>>;
  lastTileByPlayer: Partial<Record<PlayerId, TileCoord>>;
  lastAliveByPlayer: Partial<Record<PlayerId, boolean>>;
  eliminationsBySector: Record<Sector, number>;
  portalUsage: number;
  revealedDrops: Set<string>;
}

const VERIFIED_INITIAL_HASH = "sha256:47901101340c7cd8585dd96d72e2e1db408790bcebcd2cdcf45eb21e5095fc27";
const WAYPOINT_SCRIPT_HASH = "sha256:7701a427660306ff94bb561cb3e416c19bc878715baa722b11cb76ed8fc817c4";
const NEUTRAL_SCRIPT_HASH = "sha256:5d24b6f22e92ddd0621913e18b53af58f23a15180534ebaca6f0a1a277b80b4f";
const NEUTRAL_CONFIG_HASH = "sha256:b00955e80fc35858f039a15c65863ea13f5273dc553a98ca34d69191715eaaf7";
const SUDDEN_DEATH_INITIAL_HASH = "sha256:de7199883db22894d2577ab0fdf3c2d03bfcaef1da77d7f121a536b2641a1f57";
const TERMINAL_SEED = "cidadela-arcana-r1-terminal-v1";
const SUDDEN_DEATH_SEED = "cidadela-arcana-r1-sudden-death-0";
const PUBLICATION_THRESHOLDS = deepFreeze({
  latestCentralContestMs: 90_000,
  maxCentralOccupancyRatio: 0.35,
  maxCentralDominanceMs: 20_000,
  minimumRouteEdges: 20,
  minimumEliminationSectors: 2,
  minimumPortalUsage: 1,
});
const ACTIVE_PLAYERS = [1, 2, 3, 4] as const;
const PLAYTEST_CELLS = [
  { id: "north-center", seed: "cidadela-arcana-r1-cell-a", route: [{ x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }], characters: { 1: 0, 2: 1, 3: 2, 4: 3 }, expectedInitialStateHash: "sha256:a0ec9e437412a26ed5c63fb19258ff28485cbd954acf2597c76e5d2816b51881" },
  { id: "north-east", seed: "cidadela-arcana-r1-cell-b-0", route: [{ x: 5, y: 0 }, { x: 10, y: 4 }, { x: 5, y: 4 }], characters: { 1: 1, 2: 2, 3: 3, 4: 0 }, expectedInitialStateHash: "sha256:f863072c38d697597713b9d3fa1791b5f95845905a57b775efd01012c03f59c9" },
  { id: "north-south", seed: "cidadela-arcana-r1-cell-c", route: [{ x: 5, y: 0 }, { x: 5, y: 8 }, { x: 5, y: 4 }], characters: { 1: 2, 2: 3, 3: 0, 4: 1 }, expectedInitialStateHash: "sha256:c1f59264053d59971093f583ee252967ca5d30b891ffc9563b6b603a72c14602" },
  { id: "north-west", seed: "cidadela-arcana-r1-cell-d", route: [{ x: 5, y: 0 }, { x: 0, y: 4 }, { x: 5, y: 4 }], characters: { 1: 3, 2: 0, 3: 1, 4: 2 }, expectedInitialStateHash: "sha256:774efa7f02e3545718b6c5f05d151b86871d7996ba27819006e55f8a92357949" },
] as const;

export async function runArenaCanary(ref: ArenaMapRef, budgets: ArenaCanaryBudgets) {
  validateBudgets(budgets);
  const map = getPublishedArenaMap(ref);
  const publicationVerification = await verifyPublishedArenaMap(map);
  const arena = toArenaDefinition(map);
  const builtInPolicies = ACTIVE_PLAYERS.map((playerId) => ({
    id: `citadel-built-in-${playerId}`,
    playerId,
    mode: "built-in" as const,
  }));
  const terminalRound = await runHeadlessRound({
    build: `arena-canary:${map.contentHash}`,
    ruleset: "classic-v1",
    arena,
    randomness: {
      randomnessMode: "seeded",
      requestedSeed: TERMINAL_SEED,
      rngAlgorithm: "arena-seed-hash",
      rngVersion: "arena-runtime.v1",
      expectedInitialStateHash: VERIFIED_INITIAL_HASH,
    },
    activePlayerIds: [...ACTIVE_PLAYERS],
    policies: builtInPolicies,
    maxSteps: budgets.maxStepsPerRound,
    timeoutMs: budgets.timeoutMsPerRound,
  });

  const runSuddenDeathRound = () => runHeadlessRound({
    build: `arena-sudden-death:${map.contentHash}`,
    ruleset: "classic-v1",
    arena,
    randomness: {
      randomnessMode: "seeded",
      requestedSeed: SUDDEN_DEATH_SEED,
      rngAlgorithm: "arena-seed-hash",
      rngVersion: "arena-runtime.v1",
      expectedInitialStateHash: SUDDEN_DEATH_INITIAL_HASH,
    },
    activePlayerIds: [...ACTIVE_PLAYERS],
    policies: ACTIVE_PLAYERS.map((playerId) => ({
      id: `citadel-neutral-${playerId}`,
      playerId,
      mode: "registered" as const,
      scriptId: "neutral-v1" as const,
      configHash: NEUTRAL_CONFIG_HASH,
    })),
    maxSteps: budgets.maxStepsPerRound,
    timeoutMs: budgets.timeoutMsPerRound,
    traceMode: "snapshot-trace-v1",
  });
  const suddenDeathRound = await runSuddenDeathRound();
  const repeatedSuddenDeathRound = await runSuddenDeathRound();
  const expectedSuddenDeathPath = buildArenaRuntimeConfig(arena).suddenDeathPath
    .map((tile) => `${tile.x},${tile.y}`);
  const suddenDeathObservation = observeSuddenDeathTrace(suddenDeathRound.trace?.entries ?? []);
  const repeatedSuddenDeathObservation = observeSuddenDeathTrace(repeatedSuddenDeathRound.trace?.entries ?? []);
  const [suddenDeathTraceHash, repeatedSuddenDeathTraceHash] = await Promise.all([
    sha256Canonical(suddenDeathRound.trace),
    sha256Canonical(repeatedSuddenDeathRound.trace),
  ]);
  const suddenDeathRepeatability = suddenDeathTraceHash === repeatedSuddenDeathTraceHash
    && suddenDeathRound.status === repeatedSuddenDeathRound.status
    && suddenDeathRound.steps === repeatedSuddenDeathRound.steps
    && JSON.stringify(suddenDeathObservation) === JSON.stringify(repeatedSuddenDeathObservation)
    ? "verified" as const
    : "failed" as const;

  const aggregate = createMetrics();
  const rounds: Array<{
    cell: Readonly<{ id: string; route: readonly TileCoord[]; cellHash: `sha256:${string}` }>;
    trajectoryHash: `sha256:${string}`;
    receipt: HeadlessRoundReceipt;
    metrics: ReturnType<typeof finishMetrics>;
    repeatability: Readonly<{
      status: "verified" | "failed";
      receipt: HeadlessRoundReceipt;
      trajectoryHash: `sha256:${string}`;
      metrics: ReturnType<typeof finishMetrics>;
    }>;
  }> = [];
  for (let variant = 0; variant < budgets.roundCount; variant += 1) {
    const descriptor = PLAYTEST_CELLS[variant % PLAYTEST_CELLS.length];
    const scriptConfig = deepFreeze({ route: descriptor.route.map((tile) => ({ ...tile })), variant });
    const policyConfigHash = await sha256Canonical({
      scriptId: "waypoint-v1",
      scriptHash: WAYPOINT_SCRIPT_HASH,
      scriptConfig,
    });
    const cell = deepFreeze({
      id: `${descriptor.id}-${Math.floor(variant / PLAYTEST_CELLS.length) + 1}`,
      route: descriptor.route.map((tile) => ({ ...tile })),
      characters: { ...descriptor.characters },
      policy: { scriptId: "waypoint-v1" as const, scriptHash: WAYPOINT_SCRIPT_HASH, configHash: policyConfigHash, scriptConfig },
      cellHash: await sha256Canonical({ descriptor, policyConfigHash, repetition: Math.floor(variant / PLAYTEST_CELLS.length) }),
    });
    const roundMetrics = createMetrics();
    const runCell = () => runHeadlessRound({
      build: `arena-playtest:${map.contentHash}`,
      ruleset: "classic-v1",
      arena,
      randomness: {
        randomnessMode: "seeded",
        requestedSeed: descriptor.seed,
        rngAlgorithm: "arena-seed-hash",
        rngVersion: "arena-runtime.v1",
        expectedInitialStateHash: descriptor.expectedInitialStateHash,
      },
      activePlayerIds: [...ACTIVE_PLAYERS],
      characterSelections: { ...descriptor.characters },
      policies: [
        {
          id: `citadel-waypoint-${cell.id}`,
          playerId: 1,
          mode: "registered",
          scriptId: "waypoint-v1",
          scriptConfig,
          configHash: policyConfigHash,
        },
        ...ACTIVE_PLAYERS.slice(1).map((playerId) => ({
          id: `citadel-built-in-${playerId}`,
          playerId,
          mode: "built-in" as const,
        })),
      ],
      maxSteps: budgets.maxStepsPerRound,
      timeoutMs: budgets.timeoutMsPerRound,
      traceMode: "snapshot-trace-v1",
    });
    const receipt = await runCell();
    observeTrace(roundMetrics, receipt.trace?.entries ?? [], map);
    mergeMetrics(aggregate, roundMetrics);
    const cellMetrics = finishMetrics(roundMetrics);
    const trajectoryHash = await sha256Canonical({
      initialStateHash: receipt.randomness?.effectiveInitialStateHash,
      policyConfigHash,
      trace: receipt.trace,
      edges: [...roundMetrics.routeEdges].sort(),
      eliminations: cellMetrics.eliminationsBySector,
      drops: cellMetrics.drops,
      portalUsage: cellMetrics.portalUsage,
      steps: receipt.steps,
      winner: receipt.winner,
    });
    const repeatedMetricsState = createMetrics();
    const repeatedReceipt = await runCell();
    observeTrace(repeatedMetricsState, repeatedReceipt.trace?.entries ?? [], map);
    const repeatedMetrics = finishMetrics(repeatedMetricsState);
    const repeatedTrajectoryHash = await sha256Canonical({
      initialStateHash: repeatedReceipt.randomness?.effectiveInitialStateHash,
      policyConfigHash,
      trace: repeatedReceipt.trace,
      edges: [...repeatedMetricsState.routeEdges].sort(),
      eliminations: repeatedMetrics.eliminationsBySector,
      drops: repeatedMetrics.drops,
      portalUsage: repeatedMetrics.portalUsage,
      steps: repeatedReceipt.steps,
      winner: repeatedReceipt.winner,
    });
    const repeatabilityStatus = repeatedTrajectoryHash === trajectoryHash
      && repeatedReceipt.status === receipt.status
      && repeatedReceipt.steps === receipt.steps
      && repeatedReceipt.winner === receipt.winner
      && JSON.stringify(repeatedReceipt.roundOutcome) === JSON.stringify(receipt.roundOutcome)
      && JSON.stringify(repeatedReceipt.score) === JSON.stringify(receipt.score)
      && JSON.stringify(repeatedMetrics) === JSON.stringify(cellMetrics)
      ? "verified" as const
      : "failed" as const;
    rounds.push({
      cell,
      trajectoryHash,
      receipt,
      metrics: cellMetrics,
      repeatability: {
        status: repeatabilityStatus,
        receipt: repeatedReceipt,
        trajectoryHash: repeatedTrajectoryHash,
        metrics: repeatedMetrics,
      },
    });
  }

  const aggregateMetrics = finishMetrics(aggregate);
  const everyCellContested = rounds.every((round) => round.metrics.centralContest.firstMs !== null);
  const metrics = deepFreeze({
    ...aggregateMetrics,
    centralContest: {
      firstMs: everyCellContested
        ? Math.max(...rounds.map((round) => round.metrics.centralContest.firstMs!))
        : null,
    },
  });
  const blockers: string[] = [];
  if (!publicationVerification.ok) blockers.push("publication-verification-failed");
  if (terminalRound.status !== "complete" || !terminalRound.terminalProof.valid) blockers.push("terminal-round-failed");
  if (terminalRound.reproducibility.status !== "verified") blockers.push("terminal-round-not-reproducible");
  const deterministicGate = evaluateArenaDeterministicEvidence({
    roundStatus: suddenDeathRound.status,
    reproducibilityStatus: suddenDeathRound.reproducibility.status,
    activeObserved: suddenDeathObservation.activeObserved,
    maximumClosedTiles: suddenDeathObservation.maximumClosedTiles,
    expectedSuddenDeathPath,
    observedSuddenDeathSequence: suddenDeathObservation.closedSequence,
    grid: map.layout.grid,
    solidTiles: map.layout.solid,
    expectedSpawns: map.layout.spawns,
    observedSpawns: suddenDeathObservation.initialSpawns,
    dropTiles: suddenDeathObservation.initialDrops.map((drop) => drop.tile),
  });
  blockers.push(...deterministicGate.blockers);
  if (suddenDeathRepeatability !== "verified") blockers.push("sudden-death-repeatability-failed");
  if (rounds.some((round) => round.receipt.status !== "complete")) blockers.push("playtest-round-incomplete");
  if (rounds.some((round) => round.receipt.reproducibility.status !== "verified")) blockers.push("playtest-round-not-reproducible");
  if (rounds.some((round) => round.repeatability.status !== "verified")) blockers.push("playtest-repeatability-failed");
  if (metrics.centralContest.firstMs === null || metrics.centralContest.firstMs > budgets.thresholds.latestCentralContestMs) blockers.push("central-contest-too-late");
  if (metrics.centralOccupancy.ratio > budgets.thresholds.maxCentralOccupancyRatio) blockers.push("central-occupancy-too-high");
  if (metrics.centralDominance.maxSustainedMs > budgets.thresholds.maxCentralDominanceMs) blockers.push("sustained-central-dominance");
  if (metrics.routeVariety.uniqueEdges < budgets.thresholds.minimumRouteEdges) blockers.push("route-variety-too-low");
  const occupiedEliminationSectors = Object.values(metrics.eliminationsBySector).filter((count) => count > 0).length;
  if (occupiedEliminationSectors < budgets.thresholds.minimumEliminationSectors) blockers.push("elimination-sectors-too-narrow");
  if (metrics.portalUsage < budgets.thresholds.minimumPortalUsage) blockers.push("portal-usage-too-low");
  if (metrics.drops.revealed === 0) blockers.push("drop-event-not-observed");

  return deepFreeze({
    map: { id: map.id, revision: map.revision, contentHash: map.contentHash },
    publicationVerification,
    terminalRound,
    deterministicRuntime: {
      randomness: {
        terminal: terminalRound.randomness,
        suddenDeath: suddenDeathRound.randomness,
        playtest: rounds.map((round) => round.receipt.randomness),
      },
      registeredScripts: {
        waypoint: WAYPOINT_SCRIPT_HASH,
        neutral: NEUTRAL_SCRIPT_HASH,
      },
      suddenDeath: {
        receipt: suddenDeathRound,
        observation: { ...suddenDeathObservation, expectedPath: expectedSuddenDeathPath },
        repeatability: {
          status: suddenDeathRepeatability,
          traceHash: suddenDeathTraceHash,
          receipt: repeatedSuddenDeathRound,
          repeatedTraceHash: repeatedSuddenDeathTraceHash,
        },
      },
      dropsBySector: deterministicGate.dropsBySector,
    },
    playtest: { rounds, metrics },
    thresholds: budgets.thresholds,
    verdict: blockers.length === 0 ? "publish" as const : "block" as const,
    blockers,
  });
}

function observeTrace(
  metrics: MutableMetrics,
  entries: readonly HeadlessSnapshotTraceEntry[],
  map: PublishedArenaMap,
): void {
  const portalTransitions = new Set(map.layout.portals.map((portal) => (
    `${portal.entry.x},${portal.entry.y}>${portal.exit.x},${portal.exit.y}`
  )));
  for (const entry of entries) observeSnapshot(metrics, entry, entry.step, portalTransitions);
}

function observeSnapshot(
  metrics: MutableMetrics,
  snapshot: Pick<HeadlessSnapshotTraceEntry, "players" | "powerUps">,
  step: number,
  portalTransitions: ReadonlySet<string>,
): void {
  const alivePlayers: PlayerId[] = [];
  const centralAlivePlayers: PlayerId[] = [];
  for (const playerId of ACTIVE_PLAYERS) {
    const player = snapshot.players[playerId];
    const tile = { ...player.tile };
    const previous = metrics.lastTileByPlayer[playerId];
    const wasAlive = metrics.lastAliveByPlayer[playerId];
    if (previous && (previous.x !== tile.x || previous.y !== tile.y)) {
      const previousKey = `${previous.x},${previous.y}`;
      const tileKey = `${tile.x},${tile.y}`;
      const directedTransition = `${previousKey}>${tileKey}`;
      const isPortalTransition = portalTransitions.has(directedTransition);
      const physicalEdge = isPortalTransition
        ? `portal:${[previousKey, tileKey].sort().join("|")}`
        : [previousKey, tileKey].sort().join("|");
      if (isPortalTransition || Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y) === 1) {
        metrics.routeEdges.add(physicalEdge);
        metrics.routeEdgesByPlayer[playerId].add(physicalEdge);
      }
      if (isPortalTransition) metrics.portalUsage += 1;
    }
    if (wasAlive === true && !player.alive) metrics.eliminationsBySector[sectorFor(previous ?? tile)] += 1;
    metrics.lastTileByPlayer[playerId] = tile;
    metrics.lastAliveByPlayer[playerId] = player.alive;
    if (!player.alive) {
      continue;
    }
    alivePlayers.push(playerId);
    metrics.aliveParticipantSteps += 1;
    if (isCentral(tile)) {
      centralAlivePlayers.push(playerId);
      metrics.centralParticipantSteps += 1;
    }
  }
  if (alivePlayers.length >= 2) metrics.eligibleCentralControlSteps += 1;
  const exclusiveController = alivePlayers.length >= 2 && centralAlivePlayers.length === 1
    ? centralAlivePlayers[0]
    : null;
  for (const playerId of ACTIVE_PLAYERS) {
    if (playerId === exclusiveController) {
      metrics.exclusiveCentralControlSteps += 1;
      metrics.centralStreakByPlayer[playerId] += 1;
      metrics.maxCentralStreakSteps = Math.max(metrics.maxCentralStreakSteps, metrics.centralStreakByPlayer[playerId]);
    } else {
      metrics.centralStreakByPlayer[playerId] = 0;
    }
  }
  for (const drop of snapshot.powerUps) {
    if (drop.revealed) metrics.revealedDrops.add(`${drop.type}:${drop.tile.x},${drop.tile.y}`);
  }
  if (centralAlivePlayers.length >= 2 && metrics.firstCentralContestStep === null) metrics.firstCentralContestStep = step;
}

function createMetrics(): MutableMetrics {
  return {
    firstCentralContestStep: null,
    centralParticipantSteps: 0,
    aliveParticipantSteps: 0,
    exclusiveCentralControlSteps: 0,
    eligibleCentralControlSteps: 0,
    maxCentralStreakSteps: 0,
    centralStreakByPlayer: { 1: 0, 2: 0, 3: 0, 4: 0 },
    routeEdges: new Set(),
    routeEdgesByPlayer: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
    lastTileByPlayer: {},
    lastAliveByPlayer: {},
    eliminationsBySector: { "north-west": 0, "north-east": 0, "south-west": 0, "south-east": 0, center: 0 },
    portalUsage: 0,
    revealedDrops: new Set(),
  };
}

function mergeMetrics(target: MutableMetrics, source: MutableMetrics): void {
  if (source.firstCentralContestStep !== null) target.firstCentralContestStep = target.firstCentralContestStep === null
    ? source.firstCentralContestStep
    : Math.min(target.firstCentralContestStep, source.firstCentralContestStep);
  target.centralParticipantSteps += source.centralParticipantSteps;
  target.aliveParticipantSteps += source.aliveParticipantSteps;
  target.exclusiveCentralControlSteps += source.exclusiveCentralControlSteps;
  target.eligibleCentralControlSteps += source.eligibleCentralControlSteps;
  target.maxCentralStreakSteps = Math.max(target.maxCentralStreakSteps, source.maxCentralStreakSteps);
  for (const edge of source.routeEdges) target.routeEdges.add(edge);
  for (const playerId of ACTIVE_PLAYERS) {
    for (const edge of source.routeEdgesByPlayer[playerId]) target.routeEdgesByPlayer[playerId].add(edge);
  }
  for (const sector of Object.keys(target.eliminationsBySector) as Sector[]) target.eliminationsBySector[sector] += source.eliminationsBySector[sector];
  target.portalUsage += source.portalUsage;
  for (const drop of source.revealedDrops) target.revealedDrops.add(drop);
}

function finishMetrics(metrics: MutableMetrics) {
  return deepFreeze({
    centralContest: { firstMs: metrics.firstCentralContestStep === null ? null : metrics.firstCentralContestStep * FIXED_STEP_MS },
    centralOccupancy: {
      participantSteps: metrics.centralParticipantSteps,
      aliveParticipantSteps: metrics.aliveParticipantSteps,
      ratio: metrics.aliveParticipantSteps === 0 ? 0 : metrics.centralParticipantSteps / metrics.aliveParticipantSteps,
    },
    centralDominance: {
      exclusiveControlSteps: metrics.exclusiveCentralControlSteps,
      eligibleControlSteps: metrics.eligibleCentralControlSteps,
      ratio: metrics.eligibleCentralControlSteps === 0
        ? 0
        : metrics.exclusiveCentralControlSteps / metrics.eligibleCentralControlSteps,
      maxSustainedMs: metrics.maxCentralStreakSteps * FIXED_STEP_MS,
    },
    eliminationsBySector: { ...metrics.eliminationsBySector },
    routeVariety: {
      uniqueEdges: metrics.routeEdges.size,
      perPlayerUniqueEdges: Object.fromEntries(ACTIVE_PLAYERS.map((playerId) => (
        [playerId, metrics.routeEdgesByPlayer[playerId].size]
      ))) as Record<PlayerId, number>,
    },
    portalUsage: metrics.portalUsage,
    drops: { revealed: metrics.revealedDrops.size, keys: [...metrics.revealedDrops].sort() },
  });
}

function sectorCounts(tiles: readonly TileCoord[]): Record<Sector, number> {
  const counts: Record<Sector, number> = { "north-west": 0, "north-east": 0, "south-west": 0, "south-east": 0, center: 0 };
  for (const tile of tiles) counts[sectorFor(tile)] += 1;
  return counts;
}

function observeSuddenDeathTrace(entries: readonly HeadlessSnapshotTraceEntry[]) {
  const initialSpawns = {} as Partial<Record<PlayerId, TileCoord>>;
  const initialDrops: Array<Readonly<{ type: string; tile: TileCoord }>> = [];
  const closedSequence: string[] = [];
  const seenClosed = new Set<string>();
  let activeObserved = false;
  let maximumClosedTiles = 0;
  for (const entry of entries) {
    if (entry.step === 0) {
      for (const playerId of ACTIVE_PLAYERS) initialSpawns[playerId] = { ...entry.players[playerId].tile };
      initialDrops.push(...entry.powerUps.map((drop) => ({ type: drop.type, tile: { ...drop.tile } })));
    }
    activeObserved ||= entry.suddenDeathActive;
    maximumClosedTiles = Math.max(maximumClosedTiles, entry.suddenDeathClosedTiles.length);
    for (const key of entry.suddenDeathClosedTiles) {
      if (seenClosed.has(key)) continue;
      seenClosed.add(key);
      closedSequence.push(key);
    }
  }
  return deepFreeze({ activeObserved, maximumClosedTiles, initialSpawns, initialDrops, closedSequence });
}

export function evaluateArenaDeterministicEvidence(input: Readonly<{
  roundStatus: HeadlessRoundReceipt["status"];
  reproducibilityStatus: HeadlessRoundReceipt["reproducibility"]["status"];
  activeObserved: boolean;
  maximumClosedTiles: number;
  expectedSuddenDeathPath: readonly string[];
  observedSuddenDeathSequence: readonly string[];
  grid: Readonly<{ width: number; height: number }>;
  solidTiles: readonly string[];
  expectedSpawns: readonly Readonly<{ playerId: PlayerId; tile: TileCoord }>[];
  observedSpawns: Partial<Record<PlayerId, TileCoord>>;
  dropTiles: readonly TileCoord[];
}>): Readonly<{ blockers: readonly string[]; dropsBySector: Readonly<Record<Sector, number>> }> {
  const blockers: string[] = [];
  if (input.roundStatus !== "complete" || input.reproducibilityStatus !== "verified") blockers.push("sudden-death-round-failed");
  if (!input.activeObserved || input.maximumClosedTiles <= 0) blockers.push("sudden-death-not-observed");
  const solidTiles = new Set(input.solidTiles);
  const expectedPathUnique = new Set(input.expectedSuddenDeathPath);
  const expectedPathLegal = expectedPathUnique.size === input.expectedSuddenDeathPath.length
    && input.expectedSuddenDeathPath.every((key) => {
      const [x, y] = key.split(",").map(Number);
      return Number.isInteger(x) && Number.isInteger(y)
        && x >= 0 && y >= 0 && x < input.grid.width && y < input.grid.height
        && !solidTiles.has(key);
    });
  if (!expectedPathLegal) blockers.push("sudden-death-path-illegal");
  const observedPathUnique = new Set(input.observedSuddenDeathSequence);
  const observedMatchesExpectedPrefix = input.observedSuddenDeathSequence.length > 0
    && observedPathUnique.size === input.observedSuddenDeathSequence.length
    && input.observedSuddenDeathSequence.every((key, index) => input.expectedSuddenDeathPath[index] === key);
  if (!observedMatchesExpectedPrefix) blockers.push("sudden-death-path-mismatch");
  const expectedSpawns = new Set(input.expectedSpawns.map((spawn) => `${spawn.playerId}:${spawn.tile.x},${spawn.tile.y}`));
  const observedSpawns = new Set(Object.entries(input.observedSpawns).map(([id, tile]) => `${id}:${tile!.x},${tile!.y}`));
  if (expectedSpawns.size !== observedSpawns.size || [...expectedSpawns].some((spawn) => !observedSpawns.has(spawn))) {
    blockers.push("spawn-parity-failed");
  }
  const dropsBySector = sectorCounts(input.dropTiles);
  const quadrantDrops = [dropsBySector["north-west"], dropsBySector["north-east"], dropsBySector["south-west"], dropsBySector["south-east"]];
  if (input.dropTiles.length === 0 || Math.max(...quadrantDrops) - Math.min(...quadrantDrops) > 1) {
    blockers.push("drop-distribution-unfair");
  }
  return deepFreeze({ blockers, dropsBySector });
}

function sectorFor(tile: Readonly<TileCoord>): Sector {
  if (isCentral(tile)) return "center";
  if (tile.y < 4) return tile.x < 5 ? "north-west" : "north-east";
  return tile.x < 5 ? "south-west" : "south-east";
}

function isCentral(tile: Readonly<TileCoord>): boolean {
  return Math.abs(tile.x - 5) <= 1 && Math.abs(tile.y - 4) <= 1;
}

function validateBudgets(budgets: ArenaCanaryBudgets): void {
  if (!Number.isInteger(budgets.roundCount) || budgets.roundCount < 4) throw new Error("roundCount must be at least 4");
  if (!Number.isInteger(budgets.maxStepsPerRound) || budgets.maxStepsPerRound <= 0) throw new Error("maxStepsPerRound must be positive");
  if (!Number.isFinite(budgets.timeoutMsPerRound) || budgets.timeoutMsPerRound <= 0) throw new Error("timeoutMsPerRound must be positive");
  const { thresholds } = budgets;
  if (!Number.isFinite(thresholds.latestCentralContestMs) || thresholds.latestCentralContestMs < 0) {
    throw new Error("latestCentralContestMs must be a non-negative finite number");
  }
  if (
    !Number.isFinite(thresholds.maxCentralOccupancyRatio)
    || thresholds.maxCentralOccupancyRatio < 0
    || thresholds.maxCentralOccupancyRatio > 1
  ) {
    throw new Error("maxCentralOccupancyRatio must be a finite ratio from 0 through 1");
  }
  if (!Number.isFinite(thresholds.maxCentralDominanceMs) || thresholds.maxCentralDominanceMs < 0) {
    throw new Error("maxCentralDominanceMs must be a non-negative finite number");
  }
  if (!Number.isInteger(thresholds.minimumRouteEdges) || thresholds.minimumRouteEdges < 1) {
    throw new Error("minimumRouteEdges must be a positive integer");
  }
  if (
    !Number.isInteger(thresholds.minimumEliminationSectors)
    || thresholds.minimumEliminationSectors < 1
    || thresholds.minimumEliminationSectors > 5
  ) {
    throw new Error("minimumEliminationSectors must be an integer from 1 through 5");
  }
  if (!Number.isInteger(thresholds.minimumPortalUsage) || thresholds.minimumPortalUsage < 0) {
    throw new Error("minimumPortalUsage must be a non-negative integer");
  }
  if (thresholds.latestCentralContestMs > PUBLICATION_THRESHOLDS.latestCentralContestMs) {
    throw new Error("latestCentralContestMs cannot be weaker than the publication threshold");
  }
  if (thresholds.maxCentralOccupancyRatio > PUBLICATION_THRESHOLDS.maxCentralOccupancyRatio) {
    throw new Error("maxCentralOccupancyRatio cannot be weaker than the publication threshold");
  }
  if (thresholds.maxCentralDominanceMs > PUBLICATION_THRESHOLDS.maxCentralDominanceMs) {
    throw new Error("maxCentralDominanceMs cannot be weaker than the publication threshold");
  }
  if (thresholds.minimumRouteEdges < PUBLICATION_THRESHOLDS.minimumRouteEdges) {
    throw new Error("minimumRouteEdges cannot be weaker than the publication threshold");
  }
  if (thresholds.minimumEliminationSectors < PUBLICATION_THRESHOLDS.minimumEliminationSectors) {
    throw new Error("minimumEliminationSectors cannot be weaker than the publication threshold");
  }
  if (thresholds.minimumPortalUsage < PUBLICATION_THRESHOLDS.minimumPortalUsage) {
    throw new Error("minimumPortalUsage cannot be weaker than the publication threshold");
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}
