import { readFile } from "node:fs/promises";

const {
  ACTIVE_MATCH_RECONNECT_GRACE_MS,
  buildReconnectWebSocketUrl,
  createReconnectToken,
  getActiveMatchReconnectState,
  normalizeReconnectToken,
} = await import("../output/esm/NetCode/reconnect-session.js");

const fixedUuid = "123e4567-e89b-12d3-a456-426614174000";
const reconnectToken = createReconnectToken(() => fixedUuid);
const startedAt = 20_000;
const withinGrace = getActiveMatchReconnectState(
  startedAt,
  startedAt + ACTIVE_MATCH_RECONNECT_GRACE_MS - 1,
);
const expired = getActiveMatchReconnectState(
  startedAt,
  startedAt + ACTIVE_MATCH_RECONNECT_GRACE_MS,
);
const reconnectUrl = new URL(buildReconnectWebSocketUrl("wss://game.example/online", reconnectToken));

const behaviorChecks = {
  tokenUsesFullUuidEntropy: reconnectToken === "resume_123e4567e89b12d3a456426614174000",
  tokenNormalizationRejectsMalformedValues: normalizeReconnectToken("resume_short") === null,
  reconnectUrlCarriesOpaqueToken: reconnectUrl.searchParams.get("resumeToken") === reconnectToken,
  graceRetainsSeatUntilBoundary: withinGrace.canResume
    && !withinGrace.shouldExpire
    && withinGrace.remainingMs === 1,
  graceExpiresAtBoundary: !expired.canResume
    && expired.shouldExpire
    && expired.remainingMs === 0,
};

const workerSource = (await readFile(new URL("../worker/index.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const clientSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const protocolSource = await readFile(new URL("../src/NetCode/protocol.ts", import.meta.url), "utf8");

const disconnectStart = workerSource.indexOf("async handleDisconnect(websocket)");
const disconnectEnd = workerSource.indexOf("async handleTelemetryIngest", disconnectStart);
const disconnectSource = workerSource.slice(disconnectStart, disconnectEnd);
const joinStart = workerSource.indexOf("async handleJoinLobby(clientId, rawRoomCode)");
const joinEnd = workerSource.indexOf("async handleLeaveLobby(clientId)", joinStart);
const joinSource = workerSource.slice(joinStart, joinEnd);

const integrationChecks = {
  workerIssuesOpaqueToken: workerSource.includes("createReconnectToken()"),
  successfulResumeRotatesToken: workerSource.includes("resumedClient.reconnectToken = reconnectToken;"),
  hibernationAttachmentKeepsToken: workerSource.includes("server.serializeAttachment({ clientId, account, reconnectToken })"),
  playingDisconnectReservesSeat: disconnectSource.includes("reserveActiveMatchSeatForReconnect(room, clientId)"),
  disconnectedInputBecomesNeutral: workerSource.includes("match.inputs[seatId] = createNeutralInput();"),
  staleSocketCannotEvictReplacement: disconnectSource.includes("this.sockets.get(clientId) !== websocket"),
  resumeTokenUsesTimingSafeComparison: workerSource.includes("timingSafeEqual(reservation.reconnectToken, reconnectToken)"),
  joinResendsMatchConfiguration: joinSource.includes("this.sendMatchStartedToSeat("),
  joinResendsAuthoritativeSnapshot: joinSource.includes("this.sendSnapshotToClient(clientId, room.roomCode);"),
  matchPumpExpiresAbandonedReservations: workerSource.includes("if (this.sanitizeRoomOccupancy(room)) {")
    && workerSource.includes("if (room.status !== \"playing\") {\n        return;"),
  reservationNeverSerializedToLobby: workerSource.includes("reconnectReservations: createSeatMap(")
    && !workerSource.includes("const seats = createSeatMap((seatId) => ({ ...room.seats[seatId], reconnect"),
  clientReusesTokenOnNextSocket: clientSource.includes("buildReconnectWebSocketUrl(")
    && clientSource.includes("this.reconnectToken = message.reconnectToken;"),
  helloContractCarriesToken: protocolSource.includes("reconnectToken: string;"),
};

const failedChecks = [...Object.entries(behaviorChecks), ...Object.entries(integrationChecks)]
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  graceMs: ACTIVE_MATCH_RECONNECT_GRACE_MS,
  behaviorChecks,
  integrationChecks,
  failedChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
