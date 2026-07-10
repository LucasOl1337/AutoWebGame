import { readFile } from "node:fs/promises";

const {
  LOBBY_RECONNECT_GRACE_MS,
  getVacantRoomRecoveryState,
} = await import("../output/esm/NetCode/lobby-reconnect-grace.js");

const startedAt = 10_000;
const newVacancy = getVacantRoomRecoveryState(null, startedAt);
const withinGrace = getVacantRoomRecoveryState(startedAt, startedAt + LOBBY_RECONNECT_GRACE_MS - 1);
const expired = getVacantRoomRecoveryState(startedAt, startedAt + LOBBY_RECONNECT_GRACE_MS);
const invalidFutureTimestamp = getVacantRoomRecoveryState(startedAt + 50_000, startedAt);

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const disconnectStart = workerSource.indexOf("async handleDisconnect(websocket)");
const disconnectEnd = workerSource.indexOf("async handleTelemetryIngest", disconnectStart);
const disconnectSource = workerSource.slice(disconnectStart, disconnectEnd);
const reconcileStart = workerSource.indexOf("reconcileRoomsWithActiveSockets(nowMs = Date.now())");
const reconcileEnd = workerSource.indexOf("\n  /**", reconcileStart);
const reconcileSource = workerSource.slice(reconcileStart, reconcileEnd);
const joinStart = workerSource.indexOf("async handleJoinLobby(clientId, rawRoomCode)");
const joinEnd = workerSource.indexOf("async handleLeaveLobby(clientId)", joinStart);
const joinSource = workerSource.slice(joinStart, joinEnd);
const leaveStart = joinEnd;
const leaveEnd = workerSource.indexOf("async handleClaimSeat", leaveStart);
const leaveSource = workerSource.slice(leaveStart, leaveEnd);

const behaviorChecks = {
  opensFullGraceWindow: newVacancy.emptySince === startedAt
    && !newVacancy.shouldDelete
    && newVacancy.remainingMs === LOBBY_RECONNECT_GRACE_MS,
  retainsUntilBoundary: !withinGrace.shouldDelete && withinGrace.remainingMs === 1,
  deletesAtBoundary: expired.shouldDelete && expired.remainingMs === 0,
  rejectsFutureTimestamp: invalidFutureTimestamp.emptySince === startedAt
    && !invalidFutureTimestamp.shouldDelete,
};

const integrationChecks = {
  unexpectedDisconnectRequestsGrace: disconnectSource.includes(
    "releaseClientFromRoom(room, clientId, { preserveVacantRoom: true })",
  ),
  reconciliationUsesGraceState: reconcileSource.includes("getVacantRoomRecoveryState(room.emptySince, nowMs)"),
  reconciliationDeletesOnlyAfterExpiry: reconcileSource.includes("if (recovery.shouldDelete)"),
  successfulJoinClearsVacancy: joinSource.includes("room.emptySince = null;"),
  explicitLeaveStillDeletesImmediately: leaveSource.includes("releaseClientFromRoom(room, clientId);")
    && !leaveSource.includes("preserveVacantRoom"),
  persistenceIncludesVacancyClock: workerSource.includes("emptySince: room.emptySince,"),
};

const failedChecks = [...Object.entries(behaviorChecks), ...Object.entries(integrationChecks)]
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  graceMs: LOBBY_RECONNECT_GRACE_MS,
  behaviorChecks,
  integrationChecks,
  failedChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
