import { DurableObject } from "cloudflare:workers";
import { GameApp } from "../src/app/game-app";
import { CHARACTER_ROSTER_MANIFEST } from "../src/core/character-roster-manifest";
import { mergeSequencedOnlineInputState } from "../src/online/input-latch";
import { createFixedRatePumpState, consumeFixedRatePumpSteps } from "../src/online/server-tick";

const STATE_VERSION = 3;
const MATCH_TICK_MS = 1000 / 60;
const FULL_SNAPSHOT_EVERY_TICKS = 6;
const MATCH_PUMP_INTERVAL_MS = 8;
const MAX_MATCH_STEPS_PER_PUMP = 5;
const PLAYER_IDS = [1, 2, 3, 4];
const ANALYTICS_TIME_ZONE = "America/Sao_Paulo";
const ANALYTICS_LOOKBACK_DAYS = 7;
const TELEMETRY_EVENT_NAMES = new Set([
  "session_start",
  "session_end",
  "landing_view",
  "screen_view",
  "quick_match_clicked",
  "lobby_list_opened",
  "lobby_create_clicked",
  "lobby_join_clicked",
  "lobby_joined",
  "seat_claim_clicked",
  "ready_clicked",
  "character_selected",
  "invite_copied",
  "chat_sent",
  "match_started",
  "match_ended",
  "lobby_left",
]);
const LEGACY_AUDIO_PATHS = new Set([
  "/assets/audio/sfx/bomb_explode.mp3",
  "/assets/audio/sfx/crate_break.mp3",
  "/assets/audio/sfx/flame_ignite.mp3",
  "/assets/audio/sfx/player_death.mp3",
  "/assets/audio/sfx/round_win.mp3",
  "/assets/audio/sfx/shield_block.mp3",
  "/assets/audio/sfx/sudden_death.mp3",
]);

/**
 * @typedef {{
 *   roomCode: string;
 *   title: string;
 *   status: "open" | "playing";
 *   createdAt: number;
  *   hostClientId: string | null;
 *   clients: Set<string>;
 *   chat: ChatEntry[];
 *   seats: Record<1 | 2 | 3 | 4, LobbySeat>;
 * }} LobbyRoom
 *
 * @typedef {{
 *   clientId: string | null;
 *   displayName: string | null;
 *   characterIndex: number;
 *   ready: boolean;
 * }} LobbySeat
 *
 * @typedef {{
 *   id: string;
 *   authorClientId: string | null;
 *   authorLabel: string;
 *   body: string;
 *   createdAt: number;
 *   system?: boolean;
 * }} ChatEntry
 */

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const globalLobby = env.LOBBY.getByName("global");

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/telemetry") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/telemetry"));
    }

    if (url.pathname === "/api/admin/summary") {
      const auth = await authorizeAdminRequest(request, env);
      if (!auth.ok) {
        return auth.response;
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/admin/summary"));
    }

    if (url.pathname === "/admin") {
      return new Response(renderAdminHtml(url.searchParams.get("token")), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === "/online") {
      if (request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket upgrade", { status: 426 });
      }
      return globalLobby.fetch(request);
    }

    if (LEGACY_AUDIO_PATHS.has(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    if (!env.ADMIN_REPORT_WEBHOOK_URL) {
      return;
    }
    const reportRequest = new Request("https://internal/internal/admin/daily-report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
      }),
    });
    ctx.waitUntil(env.LOBBY.getByName("global").fetch(reportRequest));
  },
};

export class GlobalLobby extends DurableObject {
  /** @type {Env} */
  env;
  /** @type {Map<string, LobbyRoom>} */
  rooms = new Map();
  /** @type {Map<string, WebSocket>} */
  sockets = new Map();
  /** @type {Set<string>} */
  quickMatchPendingClients = new Set();
  /** @type {Map<string, number>} */
  preferredCharacterSelections = new Map();
  /** @type {Map<string, { game: GameApp, inputs: Record<1 | 2 | 3 | 4, import("../src/online/protocol").OnlineInputState & { inputSeq?: number, sentAtMs?: number }>, ackedInputSeq: Record<1 | 2 | 3 | 4, number>, timer: ReturnType<typeof setInterval> | null, tick: number, activePlayerIds: Array<1 | 2 | 3 | 4>, characterSelections: Record<1 | 2 | 3 | 4, number>, matchResultChoices: Record<1 | 2 | 3 | 4, "rematch" | "lobby" | null>, clock: import("../src/online/server-tick").FixedRatePumpState }>} */
  matches = new Map();
  /** @type {Promise<void>} */
  ready;

  /**
   * @param {DurableObjectState} ctx
   * @param {Env} env
   */
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get("state");
      const persistedRooms = stored
        && typeof stored === "object"
        && stored.version === STATE_VERSION
        && Array.isArray(stored.rooms)
        ? stored.rooms
        : [];

      this.rooms = new Map(
        persistedRooms.map((room) => [
          room.roomCode,
          {
            roomCode: room.roomCode,
            title: room.title,
            status: "open",
            createdAt: room.createdAt,
            hostClientId: null,
            clients: new Set(room.clients),
            chat: Array.isArray(room.chat) ? room.chat.slice(-40) : [],
            seats: createSeatMap((seatId) => ({ ...(room.seats?.[seatId] ?? createEmptySeat()), ready: false })),
          },
        ]),
      );

      for (const websocket of this.ctx.getWebSockets()) {
        const attachment = websocket.deserializeAttachment();
        if (attachment && typeof attachment === "object" && typeof attachment.clientId === "string") {
          this.sockets.set(attachment.clientId, websocket);
        }
      }

      this.reconcileRoomsWithActiveSockets();
      await this.persistState();
    });
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/internal/telemetry") {
      return this.handleTelemetryIngest(request);
    }

    if (url.pathname === "/internal/admin/summary") {
      return this.handleAdminSummary();
    }

    if (url.pathname === "/internal/admin/daily-report") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return this.handleDailyReportDispatch();
    }

    if (request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const clientId = createId("cli");

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId });
    this.sockets.set(clientId, server);
    this.send(server, {
      type: "hello",
      clientId,
      lobbies: this.buildLobbyList(),
      onlineUsers: this.sockets.size,
      onlinePlayers: this.buildOnlinePresenceList(),
      quickMatchQueued: this.countOpenQuickMatchRooms(),
      searchingQuickMatch: this.quickMatchPendingClients.has(clientId),
    });
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * @param {WebSocket} websocket
   * @param {string | ArrayBuffer} message
   * @returns {Promise<void>}
   */
  async webSocketMessage(websocket, message) {
    await this.ready;

    if (typeof message !== "string") {
      return;
    }

    const clientId = this.getClientId(websocket);
    if (!clientId) {
      return;
    }

    /** @type {{ type?: string }} */
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }

    switch (payload.type) {
      case "create-lobby":
        await this.handleCreateLobby(clientId, payload.title);
        break;
      case "join-lobby":
        await this.handleJoinLobby(clientId, payload.roomCode);
        break;
      case "leave-lobby":
        await this.handleLeaveLobby(clientId);
        break;
      case "claim-seat":
        await this.handleClaimSeat(clientId, payload.seat, payload.characterIndex);
        break;
      case "set-character":
        await this.handleSetCharacter(clientId, payload.characterIndex);
        break;
      case "set-ready":
        await this.handleSetReady(clientId, payload.ready);
        break;
      case "quick-match":
        await this.handleQuickMatch(clientId, payload.characterIndex);
        break;
      case "quick-match-cancel":
        this.quickMatchPendingClients.delete(clientId);
        this.broadcastQuickMatchState();
        break;
      case "chat-send":
        await this.handleChatSend(clientId, payload.body);
        break;
      case "guest-input":
        this.capturePlayerInput(clientId, payload);
        break;
      case "match-result-choice":
        await this.handleMatchResultChoice(clientId, payload.choice);
        break;
      default:
        break;
    }
  }

  /**
   * @param {WebSocket} websocket
   * @returns {Promise<void>}
   */
  async webSocketClose(websocket) {
    await this.ready;
    await this.handleDisconnect(websocket);
  }

  /**
   * @param {WebSocket} websocket
   * @returns {Promise<void>}
   */
  async webSocketError(websocket) {
    await this.ready;
    await this.handleDisconnect(websocket);
  }

  /**
   * @param {string} clientId
   * @param {string} rawTitle
   */
  async handleCreateLobby(clientId, rawTitle) {
    this.quickMatchPendingClients.delete(clientId);
    const currentRoom = this.findRoomForClient(clientId);
    if (currentRoom) {
      await this.releaseClientFromRoom(currentRoom, clientId);
    }

    const roomCode = this.createRoomCode();
    /** @type {LobbyRoom} */
    const room = {
      roomCode,
      title: normalizeLobbyTitle(rawTitle),
      createdAt: Date.now(),
      status: "open",
      hostClientId: null,
      clients: new Set([clientId]),
      chat: [],
      seats: createSeatMap(() => createEmptySeat()),
    };

    this.rooms.set(roomCode, room);
    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
  }

  /**
   * @param {string} clientId
   * @param {string} rawRoomCode
   */
  async handleJoinLobby(clientId, rawRoomCode) {
    this.quickMatchPendingClients.delete(clientId);
    this.reconcileRoomsWithActiveSockets();
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendToClient(clientId, { type: "error", message: "Lobby not found." });
      return;
    }

    const alreadySeated = PLAYER_IDS.some((seatId) => room.seats[seatId].clientId === clientId);
    const seatsFull = PLAYER_IDS.every((seatId) => Boolean(room.seats[seatId].clientId));
    if (!alreadySeated && seatsFull) {
      this.sendToClient(clientId, {
        type: "error",
        message: room.status === "playing"
          ? "Match already in progress. Pick another open room."
          : "Lobby full. Pick another room or wait for a slot.",
      });
      return;
    }

    const currentRoom = this.findRoomForClient(clientId);
    if (currentRoom && currentRoom.roomCode !== roomCode) {
      await this.releaseClientFromRoom(currentRoom, clientId);
    }

    room.clients.add(clientId);
    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
  }

  /**
   * @param {string} clientId
   */
  async handleLeaveLobby(clientId) {
    this.quickMatchPendingClients.delete(clientId);
    this.reconcileRoomsWithActiveSockets();
    const room = this.findRoomForClient(clientId);
    if (!room) {
      this.sendToClient(clientId, { type: "lobby-left" });
      this.broadcastQuickMatchState();
      return;
    }

    await this.releaseClientFromRoom(room, clientId);
    this.sendToClient(clientId, { type: "lobby-left" });
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawSeat
   * @param {unknown} rawCharacterIndex
   */
  async handleClaimSeat(clientId, rawSeat, rawCharacterIndex) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "open") {
      return;
    }

    const seat = PLAYER_IDS.includes(rawSeat) ? rawSeat : null;
    if (!seat) {
      return;
    }

    const targetSeat = room.seats[seat];
    if (targetSeat.clientId && targetSeat.clientId !== clientId) {
      this.sendToClient(clientId, { type: "error", message: "That slot is already locked by another player." });
      return;
    }

    for (const seatId of PLAYER_IDS) {
      if (room.seats[seatId].clientId === clientId && seatId !== seat) {
        room.seats[seatId] = createEmptySeat();
      }
    }

    this.assignSeat(room, seat, clientId, rawCharacterIndex);
    this.refreshSeatLabels(room);
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async handleSetCharacter(clientId, rawCharacterIndex) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "open") {
      return;
    }

    const seat = this.findSeatForClient(room, clientId);
    if (!seat) {
      this.sendToClient(clientId, { type: "error", message: "Claim a slot before choosing a character." });
      return;
    }

    room.seats[seat].characterIndex = Math.max(0, Number(rawCharacterIndex) || 0);
    room.seats[seat].ready = false;
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
  }

  /**
   * @param {string} clientId
   * @param {unknown} ready
   */
  async handleSetReady(clientId, ready) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "open") {
      return;
    }

    const seat = this.findSeatForClient(room, clientId);
    if (!seat) {
      this.sendToClient(clientId, { type: "error", message: "Claim a slot before locking ready." });
      return;
    }

    room.seats[seat].ready = Boolean(ready);
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    await this.maybeStartMatch(room);
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async handleQuickMatch(clientId, rawCharacterIndex) {
    this.quickMatchPendingClients.add(clientId);
    try {
      this.reconcileRoomsWithActiveSockets();
      const activeRoom = this.findRoomForClient(clientId);
      if (activeRoom && activeRoom.status === "open") {
        const reusedCurrentLobby = await this.readyClientForQuickMatch(activeRoom, clientId, rawCharacterIndex);
        if (reusedCurrentLobby) {
          return;
        }
      }

      const previousRoomCode = activeRoom?.roomCode ?? null;
      if (activeRoom) {
        await this.releaseClientFromRoom(activeRoom, clientId);
        this.sendToClient(clientId, { type: "lobby-left" });
      }

      this.preferredCharacterSelections.set(clientId, normalizeCharacterIndex(rawCharacterIndex, 0));
      const targetRoom = this.findQuickMatchRoom(previousRoomCode);
      const joined = targetRoom
        ? await this.joinQuickMatchRoom(targetRoom, clientId, rawCharacterIndex)
        : false;
      if (!joined) {
        await this.createQuickMatchRoom(clientId, rawCharacterIndex);
      }
    } finally {
      this.quickMatchPendingClients.delete(clientId);
      this.broadcastQuickMatchState();
    }
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   * @returns {Promise<boolean>}
   */
  async readyClientForQuickMatch(room, clientId, rawCharacterIndex) {
    let seatId = this.findSeatForClient(room, clientId);
    let claimedNewSeat = false;
    if (!seatId) {
      for (const candidateSeatId of PLAYER_IDS) {
        if (!room.seats[candidateSeatId].clientId) {
          seatId = candidateSeatId;
          break;
        }
      }
      if (!seatId) {
        return false;
      }
      this.assignSeat(room, seatId, clientId, rawCharacterIndex);
      claimedNewSeat = true;
    } else {
      room.seats[seatId].characterIndex = normalizeCharacterIndex(
        rawCharacterIndex,
        room.seats[seatId].characterIndex ?? ((seatId - 1) % 2),
      );
    }

    room.clients.add(clientId);
    room.seats[seatId].ready = true;
    this.refreshSeatLabels(room);
    if (claimedNewSeat) {
      this.appendRoomSystemMessage(room, `Quick match claimed slot P${seatId}.`);
    }

    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    void this.maybeStartMatch(room);
    return true;
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawBody
   */
  async handleChatSend(clientId, rawBody) {
    this.reconcileRoomsWithActiveSockets();
    const room = this.findRoomForClient(clientId);
    if (!room) {
      return;
    }

    const body = String(rawBody || "").trim().slice(0, 280);
    if (!body) {
      return;
    }

    const entry = {
      id: createId("msg"),
      authorClientId: clientId,
      authorLabel: this.resolveChatAuthorLabel(room, clientId),
      body,
      createdAt: Date.now(),
    };
    room.chat.push(entry);
    room.chat = room.chat.slice(-40);
    await this.persistState();
    this.broadcastToRoom(room, {
      type: "chat-message",
      roomCode: room.roomCode,
      entry,
    });
  }

  /**
   * @param {LobbyRoom} room
   */
  async maybeStartMatch(room) {
    if (room.status !== "open") {
      return;
    }

    const occupiedSeatIds = PLAYER_IDS.filter((seatId) => Boolean(room.seats[seatId].clientId));
    if (occupiedSeatIds.length < 2) {
      return;
    }
    const allReady = occupiedSeatIds.every((seatId) => room.seats[seatId].ready);
    if (!allReady) {
      return;
    }

    const activePlayerIds = occupiedSeatIds;
    room.clients = new Set(activePlayerIds.map((seatId) => room.seats[seatId].clientId).filter(Boolean));
    room.hostClientId = room.seats[activePlayerIds[0]].clientId;

    room.status = "playing";
    this.refreshSeatLabels(room);
    const characterSelections = createSeatMap((seatId) => room.seats[seatId].characterIndex ?? 0);

    await this.persistState();

    this.sendMatchStarted(room, activePlayerIds, characterSelections);
    this.startRoomMatch(room, activePlayerIds, characterSelections);
    this.appendRoomSystemMessage(room, "Match started. Good luck.");
    await this.persistState();

    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
  }

  /**
   * @param {string} clientId
   * @param {unknown} payload
   */
  capturePlayerInput(clientId, inputPayload) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "playing") {
      return;
    }

    const seat = this.findSeatForClient(room, clientId);
    const match = this.matches.get(room.roomCode);
    if (!seat || !match) {
      return;
    }

    match.inputs[seat] = mergeSequencedOnlineInputState(match.inputs[seat], {
      direction: inputPayload?.input?.direction ?? null,
      bombPressed: Boolean(inputPayload?.input?.bombPressed),
      detonatePressed: Boolean(inputPayload?.input?.detonatePressed),
      skillPressed: Boolean(inputPayload?.input?.skillPressed),
      skillHeld: Boolean(inputPayload?.input?.skillHeld),
      inputSeq: Math.max(0, Number(inputPayload?.inputSeq) || 0),
      sentAtMs: Math.max(0, Number(inputPayload?.sentAtMs) || 0),
    });
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawChoice
   */
  async handleMatchResultChoice(clientId, rawChoice) {
    this.reconcileRoomsWithActiveSockets();
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "playing") {
      return;
    }

    const seat = this.findSeatForClient(room, clientId);
    const match = this.matches.get(room.roomCode);
    if (!seat || !match || !match.activePlayerIds.includes(seat)) {
      return;
    }

    const choice = rawChoice === "lobby" ? "lobby" : "rematch";
    match.matchResultChoices[seat] = choice;

    if (choice === "lobby") {
      await this.resetRoomToLobby(room, "A pilot returned to the lobby.");
      return;
    }

    if (match.activePlayerIds.every((seatId) => match.matchResultChoices[seatId] === "rematch")) {
      await this.restartRoomFromLobby(room, match);
    }
  }

  /**
   * @param {WebSocket} websocket
   */
  async handleDisconnect(websocket) {
    const clientId = this.getClientId(websocket);
    if (!clientId) {
      return;
    }

    this.sockets.delete(clientId);
    this.quickMatchPendingClients.delete(clientId);
    this.preferredCharacterSelections.delete(clientId);
    const room = this.findRoomForClient(clientId);
    if (room) {
      await this.releaseClientFromRoom(room, clientId);
    }
    this.reconcileRoomsWithActiveSockets();
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleTelemetryIngest(request) {
    /** @type {unknown} */
    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const entries = Array.isArray(payload) ? payload : [payload];
    const normalizedBatch = entries
      .map((entry) => normalizeTelemetryPayload(entry, request))
      .filter(Boolean);

    if (normalizedBatch.length === 0) {
      return Response.json({ ok: false, error: "Invalid telemetry payload." }, { status: 400 });
    }

    const metricsByDate = new Map();
    const playerKeys = new Map();
    const sessionKeys = new Map();

    for (const normalized of normalizedBatch) {
      const metricsKey = buildAnalyticsSummaryKey(normalized.dateKey);
      let metrics = metricsByDate.get(metricsKey);
      if (!metrics) {
        metrics = normalizeDailyAnalyticsSummary(await this.ctx.storage.get(metricsKey), normalized.dateKey);
        metricsByDate.set(metricsKey, metrics);
      }

      metrics.updatedAt = Date.now();
      metrics.totalEvents += 1;
      metrics.eventCounts[normalized.eventName] = (metrics.eventCounts[normalized.eventName] ?? 0) + 1;

      if (normalized.eventName === "session_end" && normalized.durationMs > 0) {
        metrics.totalSessionDurationMs += normalized.durationMs;
        metrics.completedSessions += 1;
      }

      incrementCounter(metrics.referrerHosts, normalized.referrerHost);
      incrementCounter(metrics.utmSources, normalized.utmSource);
      incrementCounter(metrics.utmMediums, normalized.utmMedium);
      incrementCounter(metrics.utmCampaigns, normalized.utmCampaign);
      incrementCounter(metrics.screenViews, normalized.screenName);

      sessionKeys.set(buildAnalyticsSessionKey(normalized.dateKey, normalized.sessionId), {
        seenAt: normalized.occurredAtMs,
      });
      if (normalized.anonPlayerId) {
        playerKeys.set(buildAnalyticsPlayerKey(normalized.dateKey, normalized.anonPlayerId), {
          seenAt: normalized.occurredAtMs,
        });
      }
    }

    const writes = [];
    for (const [metricsKey, metrics] of metricsByDate.entries()) {
      writes.push(this.ctx.storage.put(metricsKey, metrics));
    }
    for (const [sessionKey, value] of sessionKeys.entries()) {
      writes.push(this.ctx.storage.put(sessionKey, value));
    }
    for (const [playerKey, value] of playerKeys.entries()) {
      writes.push(this.ctx.storage.put(playerKey, value));
    }

    await Promise.all(writes);

    return Response.json({ ok: true, accepted: normalizedBatch.length });
  }

  /**
   * @returns {Promise<Response>}
   */
  async handleAdminSummary() {
    this.reconcileRoomsWithActiveSockets();
    const summary = await this.buildAdminSummary();
    return Response.json(summary, {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  /**
   * @returns {Promise<Response>}
   */
  async handleDailyReportDispatch() {
    if (!this.env.ADMIN_REPORT_WEBHOOK_URL) {
      return Response.json({ ok: false, error: "ADMIN_REPORT_WEBHOOK_URL not configured." }, { status: 503 });
    }

    const reportDateKey = shiftDateKey(formatDateKey(Date.now()), -1);
    const report = await this.buildDailyRetentionReport(reportDateKey);
    const body = JSON.stringify(createReportWebhookPayload(report), null, 2);
    const response = await fetch(this.env.ADMIN_REPORT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
    });

    return Response.json({
      ok: response.ok,
      reportDate: reportDateKey,
      webhookStatus: response.status,
    }, {
      status: response.ok ? 200 : 502,
    });
  }

  /**
   * @returns {Promise<{
   *   generatedAt: string;
   *   timezone: string;
   *   today: unknown;
   *   onlineNow: number;
   *   quickMatchQueued: number;
   *   rooms: { open: number; playing: number; openLobbies: unknown[]; };
   *   recentDays: unknown[];
   * }>}
   */
  async buildAdminSummary() {
    const todayKey = formatDateKey(Date.now());
    const todaySummary = await this.readAnalyticsDay(todayKey);
    const recentDays = [];

    for (let index = 0; index < ANALYTICS_LOOKBACK_DAYS; index += 1) {
      const dateKey = shiftDateKey(todayKey, -index);
      recentDays.push(await this.readAnalyticsDay(dateKey));
    }

    const openRooms = [];
    let playingRooms = 0;
    for (const room of this.rooms.values()) {
      this.sanitizeRoomOccupancy(room);
      if (room.status === "playing") {
        playingRooms += 1;
      } else {
        openRooms.push(this.serializeLobbySummary(room));
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      timezone: ANALYTICS_TIME_ZONE,
      today: todaySummary,
      onlineNow: this.sockets.size,
      quickMatchQueued: this.countOpenQuickMatchRooms(),
      rooms: {
        open: openRooms.length,
        playing: playingRooms,
        openLobbies: openRooms.slice(0, 8),
      },
      recentDays,
    };
  }

  /**
   * @param {string} dateKey
   * @returns {Promise<{
   *   date: string;
   *   uniquePlayers: number;
   *   sessions: number;
   *   totalEvents: number;
   *   completedSessions: number;
   *   averageSessionSeconds: number;
   *   eventCounts: Record<string, number>;
   *   topReferrerHosts: Array<{ key: string; count: number }>;
   *   topUtmSources: Array<{ key: string; count: number }>;
   *   topUtmMediums: Array<{ key: string; count: number }>;
   *   topUtmCampaigns: Array<{ key: string; count: number }>;
   *   topScreens: Array<{ key: string; count: number }>;
   * }>}
   */
  async readAnalyticsDay(dateKey) {
    const metrics = normalizeDailyAnalyticsSummary(
      await this.ctx.storage.get(buildAnalyticsSummaryKey(dateKey)),
      dateKey,
    );
    const uniquePlayers = await this.countAnalyticsKeys(`analytics:player:${dateKey}:`);
    const sessions = await this.countAnalyticsKeys(`analytics:session:${dateKey}:`);
    const retentionD1 = await this.computeRetentionD1(dateKey);

    return {
      date: dateKey,
      uniquePlayers,
      sessions,
      totalEvents: metrics.totalEvents,
      completedSessions: metrics.completedSessions,
      averageSessionSeconds: metrics.completedSessions > 0
        ? Math.round((metrics.totalSessionDurationMs / metrics.completedSessions) / 1000)
        : 0,
      eventCounts: metrics.eventCounts,
      topReferrerHosts: sortCounterMap(metrics.referrerHosts),
      topUtmSources: sortCounterMap(metrics.utmSources),
      topUtmMediums: sortCounterMap(metrics.utmMediums),
      topUtmCampaigns: sortCounterMap(metrics.utmCampaigns),
      topScreens: sortCounterMap(metrics.screenViews),
      retentionD1,
    };
  }

  /**
   * @param {string} prefix
   * @returns {Promise<number>}
   */
  async countAnalyticsKeys(prefix) {
    const records = await this.ctx.storage.list({ prefix });
    return records.size;
  }

  /**
   * @param {string} dateKey
   * @returns {Promise<{ previousDay: string; previousDayPlayers: number; retainedPlayers: number; rate: number; }>}
   */
  async computeRetentionD1(dateKey) {
    const previousDayKey = shiftDateKey(dateKey, -1);
    const previousDayPlayers = await this.listAnalyticsEntityIds(`analytics:player:${previousDayKey}:`);
    if (previousDayPlayers.size === 0) {
      return {
        previousDay: previousDayKey,
        previousDayPlayers: 0,
        retainedPlayers: 0,
        rate: 0,
      };
    }

    const currentDayPlayers = await this.listAnalyticsEntityIds(`analytics:player:${dateKey}:`);
    let retainedPlayers = 0;
    for (const playerId of previousDayPlayers) {
      if (currentDayPlayers.has(playerId)) {
        retainedPlayers += 1;
      }
    }

    return {
      previousDay: previousDayKey,
      previousDayPlayers: previousDayPlayers.size,
      retainedPlayers,
      rate: roundPercentage(retainedPlayers / previousDayPlayers.size),
    };
  }

  /**
   * @param {string} prefix
   * @returns {Promise<Set<string>>}
   */
  async listAnalyticsEntityIds(prefix) {
    const records = await this.ctx.storage.list({ prefix });
    const ids = new Set();
    for (const key of records.keys()) {
      ids.add(String(key).slice(prefix.length));
    }
    return ids;
  }

  /**
   * @param {string} reportDateKey
   * @returns {Promise<{
   *   reportDate: string;
   *   day: unknown;
   *   previousDay: unknown;
   *   highlights: { quickMatchToMatchRate: number; inviteShareRate: number; };
   * }>}
   */
  async buildDailyRetentionReport(reportDateKey) {
    const day = await this.readAnalyticsDay(reportDateKey);
    const previousDay = await this.readAnalyticsDay(shiftDateKey(reportDateKey, -1));
    const quickMatchClicks = day.eventCounts.quick_match_clicked || 0;
    const matchStarts = day.eventCounts.match_started || 0;
    const inviteCopies = day.eventCounts.invite_copied || 0;

    return {
      reportDate: reportDateKey,
      day,
      previousDay,
      highlights: {
        quickMatchToMatchRate: quickMatchClicks > 0 ? roundPercentage(matchStarts / quickMatchClicks) : 0,
        inviteShareRate: day.uniquePlayers > 0 ? roundPercentage(inviteCopies / day.uniquePlayers) : 0,
      },
    };
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   */
  async releaseClientFromRoom(room, clientId) {
    room.clients.delete(clientId);

    for (const seatId of PLAYER_IDS) {
      if (room.seats[seatId].clientId === clientId) {
        room.seats[seatId] = createEmptySeat();
      }
    }

    if (room.hostClientId === clientId) {
      room.hostClientId = null;
    }

    if (room.status === "playing") {
      this.stopRoomMatch(room.roomCode);
      room.status = "open";
      for (const seatId of PLAYER_IDS) {
        room.seats[seatId].ready = false;
      }
      this.refreshSeatLabels(room);
      this.appendRoomSystemMessage(room, "A pilot left the match. Room reopened.");
      this.broadcastToRoom(room, { type: "peer-left" });
    } else {
      this.refreshSeatLabels(room);
      this.broadcastLobbyToMembers(room);
    }

    if (!PLAYER_IDS.some((seatId) => room.seats[seatId].clientId)) {
      this.rooms.delete(room.roomCode);
      await this.persistState();
      return;
    }

    await this.persistState();
  }

  /**
   * @param {LobbyRoom} room
   */
  broadcastLobbyToMembers(room) {
    for (const clientId of room.clients) {
      this.sendToClient(clientId, {
        type: "lobby-updated",
        lobby: this.serializeLobbyForClient(room, clientId),
      });
    }
  }

  /**
   * @param {string} clientId
   * @param {LobbyRoom} room
   */
  sendJoinedLobby(clientId, room) {
    this.sendToClient(clientId, {
      type: "lobby-joined",
      role: "guest",
      lobby: this.serializeLobbyForClient(room, clientId),
    });
  }

  broadcastLobbyList() {
    this.reconcileRoomsWithActiveSockets();
    const lobbies = this.buildLobbyList();
    const onlineUsers = this.sockets.size;
    const onlinePlayers = this.buildOnlinePresenceList();
    for (const websocket of this.sockets.values()) {
      this.send(websocket, { type: "lobby-list", lobbies, onlineUsers, onlinePlayers });
    }
  }

  buildOnlinePresenceList() {
    return Array.from(this.sockets.keys())
      .sort((left, right) => left.localeCompare(right))
      .map((clientId) => ({ clientId }));
  }

  buildLobbyList() {
    return Array.from(this.rooms.values())
      .map((room) => this.serializeLobbySummary(room))
      .filter((room) => {
        const sourceRoom = this.rooms.get(room.roomCode);
        return Boolean(sourceRoom && (sourceRoom.clients.size > 0 || room.occupantCount > 0 || room.status === "playing"));
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "open" ? -1 : 1;
        }
        if (a.status === "open" && b.status === "open" && a.occupantCount !== b.occupantCount) {
          return b.occupantCount - a.occupantCount;
        }
        return a.createdAt - b.createdAt;
      });
  }

  /**
   * @param {LobbyRoom} room
   */
  serializeLobbySummary(room) {
    this.sanitizeRoomOccupancy(room);
    const seats = createSeatMap((seatId) => ({ ...room.seats[seatId] }));

    return {
      roomCode: room.roomCode,
      title: room.title,
      status: room.status,
      createdAt: room.createdAt,
      seats,
      occupantCount: PLAYER_IDS.filter((seatId) => Boolean(seats[seatId].clientId)).length,
    };
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   */
  serializeLobbyForClient(room, clientId) {
    return {
      ...this.serializeLobbySummary(room),
      selfClientId: clientId,
      selfSeat: this.findSeatForClient(room, clientId),
      isHost: false,
      chat: room.chat.slice(-40),
    };
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   * @returns {1 | 2 | 3 | 4 | null}
   */
  findSeatForClient(room, clientId) {
    for (const seatId of PLAYER_IDS) {
      if (room.seats[seatId].clientId === clientId) {
        return seatId;
      }
    }
    return null;
  }

  /**
   * @param {LobbyRoom} room
   * @param {1 | 2 | 3 | 4} seat
   * @param {string} clientId
   */
  assignSeat(room, seat, clientId, rawCharacterIndex) {
    room.seats[seat] = {
      clientId,
      displayName: `Pilot ${seat}`,
      characterIndex: normalizeCharacterIndex(rawCharacterIndex, room.seats[seat].characterIndex ?? ((seat - 1) % 2)),
      ready: false,
    };
  }

  /**
   * @param {LobbyRoom} room
   */
  refreshSeatLabels(room) {
    for (const seatId of PLAYER_IDS) {
      const seat = room.seats[seatId];
      if (!seat.clientId) {
        seat.displayName = null;
        continue;
      }
      seat.displayName = `Pilot ${seatId}`;
    }
  }

  /**
   * @param {string} clientId
   * @returns {LobbyRoom | null}
   */
  findRoomForClient(clientId) {
    for (const room of this.rooms.values()) {
      if (room.clients.has(clientId) || PLAYER_IDS.some((seatId) => room.seats[seatId].clientId === clientId)) {
        return room;
      }
    }
    return null;
  }

  /**
   * @param {LobbyRoom} room
   * @param {unknown} payload
   */
  broadcastToRoom(room, payload) {
    for (const clientId of room.clients) {
      this.sendToClient(clientId, payload);
    }
  }

  /**
   * @param {string} clientId
   * @param {unknown} payload
   */
  sendToClient(clientId, payload) {
    const websocket = this.sockets.get(clientId);
    if (websocket) {
      this.send(websocket, payload);
    }
  }

  /**
   * @param {WebSocket} websocket
   * @param {unknown} payload
   */
  send(websocket, payload) {
    if (websocket.readyState === 1) {
      websocket.send(JSON.stringify(payload));
    }
  }

  reconcileRoomsWithActiveSockets() {
    let changed = false;
    for (const [roomCode, room] of this.rooms.entries()) {
      if (this.sanitizeRoomOccupancy(room)) {
        changed = true;
      }
      if (!PLAYER_IDS.some((seatId) => room.seats[seatId].clientId) && room.clients.size === 0) {
        this.stopRoomMatch(roomCode);
        this.rooms.delete(roomCode);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * @param {LobbyRoom} room
   */
  sanitizeRoomOccupancy(room) {
    let changed = false;
    const activeClients = new Set(
      Array.from(room.clients).filter((clientId) => this.sockets.has(clientId)),
    );

    if (activeClients.size !== room.clients.size) {
      room.clients = activeClients;
      changed = true;
    }

    for (const seatId of PLAYER_IDS) {
      const seat = room.seats[seatId];
      if (seat.clientId && !this.sockets.has(seat.clientId)) {
        room.seats[seatId] = createEmptySeat();
        changed = true;
      } else if (seat.clientId) {
        room.clients.add(seat.clientId);
      }
    }

    if (room.hostClientId && !this.sockets.has(room.hostClientId)) {
      room.hostClientId = null;
      changed = true;
    }

    const activeMatch = this.matches.get(room.roomCode);
    const matchMissingPlayer = activeMatch
      ? activeMatch.activePlayerIds.some((seatId) => !room.seats[seatId].clientId)
      : false;
    if (room.status === "playing" && (PLAYER_IDS.filter((seatId) => room.seats[seatId].clientId).length < 2 || matchMissingPlayer)) {
      this.stopRoomMatch(room.roomCode);
      room.status = "open";
      for (const seatId of PLAYER_IDS) {
        room.seats[seatId].ready = false;
      }
      this.appendRoomSystemMessage(room, "Match reset after a pilot disconnected.");
      changed = true;
    }

    this.refreshSeatLabels(room);
    return changed;
  }

  /**
   * @param {WebSocket} websocket
   * @returns {string | null}
   */
  getClientId(websocket) {
    const attachment = websocket.deserializeAttachment();
    if (!attachment || typeof attachment !== "object" || typeof attachment.clientId !== "string") {
      return null;
    }
    return attachment.clientId;
  }

  createRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    do {
      code = "";
      for (let index = 0; index < 6; index += 1) {
        code += alphabet[randomInt(alphabet.length)];
      }
    } while (this.rooms.has(code));

    return code;
  }

  async persistState() {
    if (this.rooms.size === 0) {
      await this.ctx.storage.delete("state");
      return;
    }

    await this.ctx.storage.put("state", {
      version: STATE_VERSION,
      rooms: Array.from(this.rooms.values()).map((room) => ({
        roomCode: room.roomCode,
        title: room.title,
        status: room.status,
        createdAt: room.createdAt,
        hostClientId: room.hostClientId,
        clients: Array.from(room.clients),
        chat: room.chat.slice(-40),
        seats: createSeatMap((seatId) => room.seats[seatId]),
      })),
    });
  }

  /**
   * @param {LobbyRoom} room
   * @param {Array<1 | 2 | 3 | 4>} activePlayerIds
   * @param {Record<1 | 2 | 3 | 4, number>} characterSelections
   */
  startRoomMatch(room, activePlayerIds, characterSelections) {
    this.stopRoomMatch(room.roomCode);
    const game = createServerGame();
    game.startServerAuthoritativeMatch(activePlayerIds, characterSelections);
    const match = {
      game,
      inputs: createSeatMap(() => createNeutralInput()),
      ackedInputSeq: createSeatMap(() => 0),
      timer: null,
      tick: 0,
      activePlayerIds,
      characterSelections,
      matchResultChoices: createSeatMap(() => null),
      clock: createFixedRatePumpState(Date.now()),
    };
    match.timer = setInterval(() => {
      this.pumpRoomMatch(room.roomCode);
    }, MATCH_PUMP_INTERVAL_MS);
    this.matches.set(room.roomCode, match);
    this.broadcastSnapshot(room.roomCode);
  }

  /**
   * @param {string} roomCode
   */
  stopRoomMatch(roomCode) {
    const match = this.matches.get(roomCode);
    if (!match) {
      return;
    }
    if (match.timer) {
      clearInterval(match.timer);
    }
    this.matches.delete(roomCode);
  }

  /**
   * @param {string} roomCode
   */
  pumpRoomMatch(roomCode) {
    const room = this.rooms.get(roomCode);
    const match = this.matches.get(roomCode);
    if (!room || !match || room.status !== "playing") {
      this.stopRoomMatch(roomCode);
      return;
    }

    const pump = consumeFixedRatePumpSteps(
      match.clock,
      Date.now(),
      MATCH_TICK_MS,
      MAX_MATCH_STEPS_PER_PUMP,
    );
    match.clock = pump.state;
    if (pump.steps <= 0) {
      return;
    }

    let shouldBroadcastSnapshot = false;
    for (let step = 0; step < pump.steps; step += 1) {
      for (const playerId of match.activePlayerIds) {
        match.game.setServerPlayerInput(playerId, match.inputs[playerId]);
      }
      match.game.advanceServerSimulation(MATCH_TICK_MS);
      for (const playerId of match.activePlayerIds) {
        match.ackedInputSeq[playerId] = match.inputs[playerId].inputSeq ?? match.ackedInputSeq[playerId] ?? 0;
        match.inputs[playerId].bombPressed = false;
        match.inputs[playerId].detonatePressed = false;
        match.inputs[playerId].skillPressed = false;
      }
      match.tick += 1;
      if (match.tick % FULL_SNAPSHOT_EVERY_TICKS === 0) {
        shouldBroadcastSnapshot = true;
      }
    }

    this.broadcastFrame(roomCode);
    if (shouldBroadcastSnapshot) {
      this.broadcastSnapshot(roomCode);
    }
  }

  /**
   * @param {string} roomCode
   */
  broadcastFrame(roomCode) {
    const room = this.rooms.get(roomCode);
    const match = this.matches.get(roomCode);
    if (!room || !match) {
      return null;
    }
    const snapshot = match.game.exportOnlineSnapshot();
    this.broadcastToRoom(room, {
      type: "host-frame",
      frame: {
        serverTimeMs: Date.now(),
        serverTick: match.tick,
        frameId: match.tick,
        ackedInputSeq: createSeatMap((playerId) => match.ackedInputSeq[playerId] ?? 0),
        mode: snapshot.mode,
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
        animationClockMs: snapshot.animationClockMs,
        suddenDeathActive: snapshot.suddenDeathActive,
        suddenDeathTickMs: snapshot.suddenDeathTickMs,
        suddenDeathIndex: snapshot.suddenDeathIndex,
        suddenDeathClosedTiles: snapshot.suddenDeathClosedTiles,
        suddenDeathClosingTiles: snapshot.suddenDeathClosingTiles,
        selectedCharacterIndex: snapshot.selectedCharacterIndex,
        activePlayerIds: snapshot.activePlayerIds,
      },
    });
    return snapshot;
  }

  /**
   * @param {string} roomCode
   */
  broadcastSnapshot(roomCode) {
    const room = this.rooms.get(roomCode);
    const match = this.matches.get(roomCode);
    if (!room || !match) {
      return;
    }
    const snapshot = match.game.exportOnlineSnapshot();
    this.broadcastToRoom(room, {
      type: "host-snapshot",
      snapshot: {
        ...snapshot,
        serverTimeMs: Date.now(),
        serverTick: match.tick,
        frameId: match.tick,
        ackedInputSeq: createSeatMap((playerId) => match.ackedInputSeq[playerId] ?? 0),
      },
    });
  }

  broadcastQuickMatchState() {
    const queued = this.countOpenQuickMatchRooms();
    const onlineUsers = this.sockets.size;
    const onlinePlayers = this.buildOnlinePresenceList();
    for (const [clientId, websocket] of this.sockets.entries()) {
      this.send(websocket, {
        type: "quick-match-state",
        queued,
        searching: this.quickMatchPendingClients.has(clientId),
        countdownMs: null,
        onlineUsers,
        onlinePlayers,
      });
    }
  }

  countOpenQuickMatchRooms() {
    let availableRooms = 0;
    for (const room of this.rooms.values()) {
      this.sanitizeRoomOccupancy(room);
      if (room.status !== "open") {
        continue;
      }
      if (PLAYER_IDS.some((seatId) => !room.seats[seatId].clientId)) {
        availableRooms += 1;
      }
    }
    return availableRooms;
  }

  /**
   * @param {string | null} excludeRoomCode
   * @returns {LobbyRoom | null}
   */
  findQuickMatchRoom(excludeRoomCode = null) {
    let bestRoom = null;
    let bestOccupantCount = -1;
    let bestCreatedAt = Number.POSITIVE_INFINITY;

    for (const room of this.rooms.values()) {
      this.sanitizeRoomOccupancy(room);
      if (room.roomCode === excludeRoomCode || room.status !== "open") {
        continue;
      }
      if (!PLAYER_IDS.some((seatId) => !room.seats[seatId].clientId)) {
        continue;
      }

      const occupantCount = PLAYER_IDS.filter((seatId) => Boolean(room.seats[seatId].clientId)).length;
      if (occupantCount > bestOccupantCount || (occupantCount === bestOccupantCount && room.createdAt < bestCreatedAt)) {
        bestRoom = room;
        bestOccupantCount = occupantCount;
        bestCreatedAt = room.createdAt;
      }
    }

    return bestRoom;
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async joinQuickMatchRoom(room, clientId, rawCharacterIndex) {
    let seatId = null;
    for (const candidateSeatId of PLAYER_IDS) {
      if (!room.seats[candidateSeatId].clientId) {
        seatId = candidateSeatId;
        break;
      }
    }

    if (!seatId) {
      return false;
    }

    room.clients.add(clientId);
    this.assignSeat(room, seatId, clientId, rawCharacterIndex);
    room.seats[seatId].ready = true;
    this.refreshSeatLabels(room);
    this.appendRoomSystemMessage(room, `Quick match claimed slot P${seatId}.`);
    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    void this.maybeStartMatch(room);
    return true;
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async createQuickMatchRoom(clientId, rawCharacterIndex) {
    const roomCode = this.createRoomCode();
    const room = {
      roomCode,
      title: "BOMBA PVP",
      createdAt: Date.now(),
      status: "open",
      hostClientId: null,
      clients: new Set([clientId]),
      chat: [],
      seats: createSeatMap(() => createEmptySeat()),
    };

    this.assignSeat(room, 1, clientId, rawCharacterIndex);
    room.seats[1].ready = true;
    this.rooms.set(roomCode, room);
    this.appendRoomSystemMessage(room, "Quick match created a new public room.");
    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    void this.maybeStartMatch(room);
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} body
   */
  async resetRoomToLobby(room, body) {
    this.stopRoomMatch(room.roomCode);
    room.status = "open";
    const hostSeatId = PLAYER_IDS.find((seatId) => room.seats[seatId].clientId) ?? null;
    room.hostClientId = hostSeatId ? room.seats[hostSeatId].clientId : null;
    for (const seatId of PLAYER_IDS) {
      room.seats[seatId].ready = false;
    }
    this.refreshSeatLabels(room);
    this.appendRoomSystemMessage(room, body);
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
  }

  /**
   * @param {LobbyRoom} room
   * @param {{ activePlayerIds: Array<1 | 2 | 3 | 4>, characterSelections: Record<1 | 2 | 3 | 4, number> }} match
   */
  async restartRoomFromLobby(room, match) {
    this.stopRoomMatch(room.roomCode);
    room.status = "open";
    for (const seatId of PLAYER_IDS) {
      room.seats[seatId].ready = match.activePlayerIds.includes(seatId);
    }
    room.hostClientId = room.seats[match.activePlayerIds[0]]?.clientId ?? null;
    this.refreshSeatLabels(room);
    this.appendRoomSystemMessage(room, "Rematch accepted. Rebuilding the match.");
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    await this.maybeStartMatch(room);
  }

  /**
   * @param {LobbyRoom} room
   * @param {Array<1 | 2 | 3 | 4>} activePlayerIds
   * @param {Record<1 | 2 | 3 | 4, number>} characterSelections
   */
  sendMatchStarted(room, activePlayerIds, characterSelections) {
    for (const seatId of activePlayerIds) {
      const seat = room.seats[seatId];
      if (!seat.clientId) {
        continue;
      }
      this.sendToClient(seat.clientId, {
        type: "match-started",
        config: {
          roomCode: room.roomCode,
          role: "guest",
          localPlayerId: seatId,
          activePlayerIds,
          characterSelections,
        },
      });
    }
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} body
   */
  appendRoomSystemMessage(room, body) {
    room.chat.push({
      id: createId("msg"),
      authorClientId: null,
      authorLabel: "System",
      body,
      createdAt: Date.now(),
      system: true,
    });
    room.chat = room.chat.slice(-40);
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   */
  resolveChatAuthorLabel(room, clientId) {
    const seat = this.findSeatForClient(room, clientId);
    if (seat) {
      return `P${seat}`;
    }
    return "Pilot";
  }
}

function createEmptySeat() {
  return {
    clientId: null,
    displayName: null,
    characterIndex: 0,
    ready: false,
  };
}

function createSeatMap(factory) {
  return {
    1: factory(1),
    2: factory(2),
    3: factory(3),
    4: factory(4),
  };
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizeLobbyTitle(title) {
  const normalized = String(title || "").trim();
  return normalized ? normalized.slice(0, 36) : "BOMBA PVP";
}

function normalizeCharacterIndex(rawCharacterIndex, fallback) {
  const value = Number(rawCharacterIndex);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createNeutralInput() {
  return {
    direction: null,
    bombPressed: false,
    detonatePressed: false,
    skillPressed: false,
    skillHeld: false,
    inputSeq: 0,
    sentAtMs: 0,
  };
}

function rewriteRequestPath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

async function authorizeAdminRequest(request, env) {
  if (!env.ADMIN_TOKEN) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "ADMIN_TOKEN is not configured on this Worker." },
        { status: 503 },
      ),
    };
  }

  const providedToken = readAdminToken(request);
  if (!providedToken || !timingSafeEqual(providedToken, env.ADMIN_TOKEN)) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Unauthorized." },
        {
          status: 401,
          headers: {
            "cache-control": "no-store",
          },
        },
      ),
    };
  }

  return { ok: true };
}

function readAdminToken(request) {
  const url = new URL(request.url);
  const headerToken = request.headers.get("x-admin-token") || request.headers.get("authorization");
  if (headerToken) {
    return headerToken.replace(/^Bearer\s+/i, "").trim();
  }
  return (url.searchParams.get("token") || "").trim();
}

function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function normalizeTelemetryPayload(payload, request) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const eventName = typeof payload.eventName === "string" ? payload.eventName.trim() : "";
  if (!TELEMETRY_EVENT_NAMES.has(eventName)) {
    return null;
  }

  const occurredAtMs = clampTimestamp(payload.occurredAtMs);
  const anonPlayerId = normalizeAnalyticsId(payload.anonPlayerId, 64);
  const sessionId = normalizeAnalyticsId(payload.sessionId, 64);
  if (!sessionId) {
    return null;
  }

  const page = payload.page && typeof payload.page === "object" ? payload.page : {};
  const attribution = payload.attribution && typeof payload.attribution === "object" ? payload.attribution : {};
  const context = payload.context && typeof payload.context === "object" ? payload.context : {};
  const eventPayload = payload.payload && typeof payload.payload === "object" ? payload.payload : {};

  const referrerHostFromPage = typeof attribution.referrerHost === "string"
    ? attribution.referrerHost.trim().slice(0, 120)
    : null;
  const fallbackReferrerHost = request.headers.get("referer")
    ? safeHostFromUrl(request.headers.get("referer"))
    : null;

  return {
    eventName,
    occurredAtMs,
    dateKey: formatDateKey(occurredAtMs),
    anonPlayerId,
    sessionId,
    referrerHost: referrerHostFromPage || fallbackReferrerHost,
    utmSource: normalizeTelemetryDimension(attribution.utmSource),
    utmMedium: normalizeTelemetryDimension(attribution.utmMedium),
    utmCampaign: normalizeTelemetryDimension(attribution.utmCampaign),
    screenName: normalizeTelemetryDimension(context.screen),
    durationMs: clampDurationMs(eventPayload.durationMs),
    pagePath: typeof page.path === "string" ? page.path.slice(0, 120) : null,
  };
}

function normalizeTelemetryDimension(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().slice(0, 120);
  return normalized || null;
}

function normalizeAnalyticsId(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
}

function clampTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Date.now();
  }
  const now = Date.now();
  return Math.max(now - 30 * 24 * 60 * 60 * 1000, Math.min(now + 60 * 1000, Math.floor(parsed)));
}

function clampDurationMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(24 * 60 * 60 * 1000, Math.floor(parsed));
}

function buildAnalyticsSummaryKey(dateKey) {
  return `analytics:summary:${dateKey}`;
}

function buildAnalyticsPlayerKey(dateKey, anonPlayerId) {
  return `analytics:player:${dateKey}:${anonPlayerId}`;
}

function buildAnalyticsSessionKey(dateKey, sessionId) {
  return `analytics:session:${dateKey}:${sessionId}`;
}

function normalizeDailyAnalyticsSummary(stored, dateKey) {
  if (!stored || typeof stored !== "object") {
    return createEmptyDailyAnalyticsSummary(dateKey);
  }

  return {
    date: typeof stored.date === "string" ? stored.date : dateKey,
    updatedAt: Number.isFinite(stored.updatedAt) ? stored.updatedAt : 0,
    totalEvents: Number.isFinite(stored.totalEvents) ? stored.totalEvents : 0,
    completedSessions: Number.isFinite(stored.completedSessions) ? stored.completedSessions : 0,
    totalSessionDurationMs: Number.isFinite(stored.totalSessionDurationMs) ? stored.totalSessionDurationMs : 0,
    eventCounts: normalizeCounterRecord(stored.eventCounts),
    referrerHosts: normalizeCounterRecord(stored.referrerHosts),
    utmSources: normalizeCounterRecord(stored.utmSources),
    utmMediums: normalizeCounterRecord(stored.utmMediums),
    utmCampaigns: normalizeCounterRecord(stored.utmCampaigns),
    screenViews: normalizeCounterRecord(stored.screenViews),
  };
}

function createEmptyDailyAnalyticsSummary(dateKey) {
  return {
    date: dateKey,
    updatedAt: 0,
    totalEvents: 0,
    completedSessions: 0,
    totalSessionDurationMs: 0,
    eventCounts: {},
    referrerHosts: {},
    utmSources: {},
    utmMediums: {},
    utmCampaigns: {},
    screenViews: {},
  };
}

function normalizeCounterRecord(record) {
  if (!record || typeof record !== "object") {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(record)) {
    if (!key) {
      continue;
    }
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }
    normalized[key] = Math.floor(count);
  }
  return normalized;
}

function incrementCounter(record, key) {
  if (!key) {
    return;
  }
  record[key] = (record[key] ?? 0) + 1;
}

function sortCounterMap(record, limit = 5) {
  return Object.entries(record)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function roundPercentage(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value * 1000) / 10;
}

function formatDateKey(timestampMs) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestampMs));
}

function shiftDateKey(dateKey, deltaDays) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + deltaDays);
  return utcDate.toISOString().slice(0, 10);
}

function safeHostFromUrl(value) {
  try {
    return new URL(value).host.slice(0, 120);
  } catch {
    return null;
  }
}

function randomInt(maxExclusive) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}

function createReportWebhookPayload(report) {
  const day = report.day;
  const previousDay = report.previousDay;
  const text = [
    `BOMBA daily report for ${report.reportDate} (${ANALYTICS_TIME_ZONE})`,
    `Unique players: ${day.uniquePlayers}`,
    `Sessions: ${day.sessions}`,
    `Matches started: ${day.eventCounts.match_started || 0}`,
    `Avg session: ${day.averageSessionSeconds}s`,
    `D1 retention vs ${day.retentionD1.previousDay}: ${day.retentionD1.retainedPlayers}/${day.retentionD1.previousDayPlayers} (${day.retentionD1.rate}%)`,
    `Quick match -> match: ${report.highlights.quickMatchToMatchRate}%`,
    `Invite share rate: ${report.highlights.inviteShareRate}%`,
    `Previous day unique players: ${previousDay.uniquePlayers}`,
  ].join("\n");

  return {
    text,
    content: text,
    report,
  };
}

function renderAdminHtml(token) {
  const safeToken = typeof token === "string"
    ? token
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BOMBA Admin</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1117;
        --panel: #161b22;
        --panel-alt: #1f2733;
        --text: #e6edf3;
        --muted: #93a1b2;
        --accent: #ff6b35;
        --border: rgba(255,255,255,0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #17212c 0%, var(--bg) 48%);
        color: var(--text);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }
      h1, h2, h3, p { margin: 0; }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 24px;
      }
      .hero p { color: var(--muted); margin-top: 8px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .card, .panel {
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
        backdrop-filter: blur(8px);
      }
      .card small, .muted { color: var(--muted); display: block; margin-bottom: 8px; }
      .metric {
        font-size: 2rem;
        font-weight: 700;
      }
      .layout {
        display: grid;
        grid-template-columns: 1.35fr 1fr;
        gap: 16px;
      }
      .stack { display: grid; gap: 16px; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      th, td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: var(--panel-alt);
        padding: 7px 12px;
        margin: 4px 6px 0 0;
      }
      .error {
        color: #ffb4a2;
        margin-top: 12px;
      }
      @media (max-width: 860px) {
        .layout { grid-template-columns: 1fr; }
        .hero { align-items: start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>BOMBA Admin</h1>
          <p>Realtime presence, daily unique players and growth funnel from the Worker itself.</p>
        </div>
        <div class="muted" id="generated-at">Loading...</div>
      </section>

      <section class="panel" style="margin-bottom:16px;">
        <small>Admin access</small>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <input id="token-input" type="password" placeholder="ADMIN_TOKEN" style="flex:1; min-width:240px; border-radius:12px; border:1px solid var(--border); background:var(--panel-alt); color:var(--text); padding:12px;" />
          <button id="token-save" style="border:0; border-radius:12px; padding:12px 16px; background:var(--accent); color:white; font-weight:700; cursor:pointer;">Save token</button>
        </div>
      </section>

      <section class="grid" id="top-metrics"></section>

      <section class="layout">
        <div class="stack">
          <div class="panel">
            <small>Today</small>
            <table>
              <thead>
                <tr><th>Event</th><th>Count</th></tr>
              </thead>
              <tbody id="event-counts"></tbody>
            </table>
          </div>
          <div class="panel">
            <small>Last 7 days</small>
            <table>
              <thead>
                <tr><th>Date</th><th>Unique</th><th>Sessions</th><th>Matches</th></tr>
              </thead>
              <tbody id="recent-days"></tbody>
            </table>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <small>Top sources</small>
            <div id="top-sources" class="list"></div>
          </div>
          <div class="panel">
            <small>Top referrers</small>
            <div id="top-referrers" class="list"></div>
          </div>
          <div class="panel">
            <small>Open lobbies now</small>
            <div id="open-lobbies" class="list"></div>
          </div>
        </div>
      </section>

      <p id="error" class="error"></p>
    </main>
    <script>
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get("token") || "${safeToken}";
      const storedToken = window.sessionStorage.getItem("bomba-admin-token") || "";
      const tokenInput = document.getElementById("token-input");
      const tokenSave = document.getElementById("token-save");
      let token = queryToken || storedToken;

      if (queryToken) {
        window.sessionStorage.setItem("bomba-admin-token", queryToken);
        params.delete("token");
        const nextQuery = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (nextQuery ? "?" + nextQuery : ""));
      }

      tokenInput.value = token;
      tokenSave.addEventListener("click", () => {
        token = tokenInput.value.trim();
        window.sessionStorage.setItem("bomba-admin-token", token);
        load();
      });

      function renderPills(target, items, emptyMessage) {
        target.innerHTML = "";
        if (!items || items.length === 0) {
          target.textContent = emptyMessage;
          return;
        }
        for (const item of items) {
          const div = document.createElement("div");
          div.className = "pill";
          div.textContent = item.key + " - " + item.count;
          target.appendChild(div);
        }
      }

      function renderSummary(data) {
        document.getElementById("generated-at").textContent = "Updated " + new Date(data.generatedAt).toLocaleString();

        const topMetrics = document.getElementById("top-metrics");
        const today = data.today;
        topMetrics.innerHTML = "";
        [
          ["Online now", data.onlineNow],
          ["Unique today", today.uniquePlayers],
          ["Sessions today", today.sessions],
          ["Matches today", today.eventCounts.match_started || 0],
          ["Quick match clicks", today.eventCounts.quick_match_clicked || 0],
          ["Avg session", today.averageSessionSeconds + "s"],
          ["Open lobbies", data.rooms.open],
          ["Playing rooms", data.rooms.playing],
        ].forEach(([label, value]) => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = "<small>" + label + "</small><div class='metric'>" + value + "</div>";
          topMetrics.appendChild(card);
        });

        const eventCounts = document.getElementById("event-counts");
        eventCounts.innerHTML = "";
        Object.entries(today.eventCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([key, count]) => {
            const row = document.createElement("tr");
            row.innerHTML = "<td>" + key + "</td><td>" + count + "</td>";
            eventCounts.appendChild(row);
          });

        const recentDays = document.getElementById("recent-days");
        recentDays.innerHTML = "";
        data.recentDays.forEach((day) => {
          const row = document.createElement("tr");
          row.innerHTML =
            "<td>" + day.date + "</td>" +
            "<td>" + day.uniquePlayers + "</td>" +
            "<td>" + day.sessions + "</td>" +
            "<td>" + (day.eventCounts.match_started || 0) + "</td>";
          recentDays.appendChild(row);
        });

        renderPills(document.getElementById("top-sources"), today.topUtmSources, "No UTM sources yet.");
        renderPills(document.getElementById("top-referrers"), today.topReferrerHosts, "No referrers yet.");

        const openLobbies = document.getElementById("open-lobbies");
        openLobbies.innerHTML = "";
        if (!data.rooms.openLobbies || data.rooms.openLobbies.length === 0) {
          openLobbies.textContent = "No open lobbies right now.";
        } else {
          data.rooms.openLobbies.forEach((lobby) => {
            const div = document.createElement("div");
            div.className = "pill";
            div.textContent = lobby.roomCode + " - " + lobby.occupantCount + "/4";
            openLobbies.appendChild(div);
          });
        }
      }

      async function load() {
        const errorNode = document.getElementById("error");
        errorNode.textContent = "";
        try {
          if (!token) {
            throw new Error("Enter ADMIN_TOKEN to load this dashboard.");
          }
          const response = await fetch("/api/admin/summary?token=" + encodeURIComponent(token), {
            cache: "no-store",
            headers: {
              "x-admin-token": token,
            },
          });
          if (!response.ok) {
            throw new Error("Request failed with status " + response.status);
          }
          const data = await response.json();
          renderSummary(data);
        } catch (error) {
          errorNode.textContent = error.message;
        }
      }

      load();
      setInterval(load, 15000);
    </script>
  </body>
</html>`;
}

function createEmptyDirectionalSprites() {
  return {
    up: null,
    down: null,
    left: null,
    right: null,
    idle: { up: [], down: [], left: [], right: [] },
    walk: { up: [], down: [], left: [], right: [] },
    run: { up: [], down: [], left: [], right: [] },
    cast: { up: [], down: [], left: [], right: [] },
    attack: { up: [], down: [], left: [], right: [] },
    death: { up: [], down: [], left: [], right: [] },
  };
}

function createServerCharacterRoster() {
  return CHARACTER_ROSTER_MANIFEST.map((entry) => ({
    ...entry,
    size: null,
    sprites: createEmptyDirectionalSprites(),
  }));
}

function createServerGame() {
  return new GameApp(
    /** @type {HTMLElement} */ ({ appendChild() {} }),
    {
      floor: null,
      wall: null,
      players: {
        1: { up: null, down: null, left: null, right: null, idle: { up: [], down: [], left: [], right: [] }, walk: { up: [], down: [], left: [], right: [] } },
        2: { up: null, down: null, left: null, right: null, idle: { up: [], down: [], left: [], right: [] }, walk: { up: [], down: [], left: [], right: [] } },
        3: { up: null, down: null, left: null, right: null, idle: { up: [], down: [], left: [], right: [] }, walk: { up: [], down: [], left: [], right: [] } },
        4: { up: null, down: null, left: null, right: null, idle: { up: [], down: [], left: [], right: [] }, walk: { up: [], down: [], left: [], right: [] } },
      },
      props: {
        wall: null,
        crate: null,
        bomb: null,
        flame: null,
      },
      powerUps: {
        "bomb-up": null,
        "flame-up": null,
        "speed-up": null,
        "remote-up": null,
        "shield-up": null,
        "bomb-pass-up": null,
        "kick-up": null,
      },
      characterRoster: createServerCharacterRoster(),
    },
  );
}
