import { DurableObject } from "cloudflare:workers";
import { GameApp } from "../src/Engine/game-app";
import { CHARACTER_ROSTER_MANIFEST } from "../src/Characters/Animations/character-roster-manifest";
import {
  canReuseCurrentRoomForQuickMatch,
  createIdleSessionState,
  isManualLobbyVisible,
  isQuickMatchCandidate,
  resolveOnlineSessionState,
  shouldResetPlayingRoom,
} from "../src/NetCode/matchmaking";
import { validateUsername } from "../src/NetCode/account";
import { mergeSequencedOnlineInputState } from "../src/NetCode/input-latch";
import { createFixedRatePumpState, consumeFixedRatePumpSteps } from "../src/NetCode/server-tick";

const STATE_VERSION = 3;
const MATCH_TICK_MS = 1000 / 60;
const FULL_SNAPSHOT_EVERY_TICKS = 6;
const MATCH_PUMP_INTERVAL_MS = 8;
const MAX_MATCH_STEPS_PER_PUMP = 5;
const MATCH_RESULT_RESTART_DELAY_MS = 900;
const ENDLESS_ROOM_CODE = "ENDLS1";
const ENDLESS_ROOM_TITLE = "Partida infinita";
const PLAYER_IDS = [1, 2, 3, 4];
const ACCOUNT_SESSION_COOKIE = "bomba_session";
const ACCOUNT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const ADMIN_SESSION_COOKIE = "bomba_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_DEFAULT_USERNAME = "slicingstorm";
const ADMIN_DEFAULT_PASSWORD = "pingodilocorvo00";
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
  "feedback_opened",
  "feedback_submitted",
  "match_started",
  "match_ended",
  "lobby_left",
]);
const LEGACY_ASSET_PREFIX = "/assets/";

/**
 * @typedef {{
 *   roomCode: string;
 *   title: string;
 *   status: "open" | "playing";
 *   roomMode: "classic" | "endless";
 *   roomKind: "manual" | "matchmaking" | "endless";
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
 *   occupantType: "empty" | "human" | "bot";
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
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/admin/summary"));
    }

    if (url.pathname === "/api/admin/login") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/admin/login"));
    }

    if (url.pathname === "/api/admin/logout") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/admin/logout"));
    }

    if (url.pathname === "/api/feedback") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/feedback"));
    }

    if (url.pathname === "/api/me") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/account/me"));
    }

    if (url.pathname === "/api/account/quick-create") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/account/quick-create"));
    }

    if (url.pathname === "/api/logout") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return globalLobby.fetch(rewriteRequestPath(request, "/internal/account/logout"));
    }

    if (url.pathname === "/admin") {
      return new Response(renderAdminHtml(env), {
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

    if (url.pathname.startsWith(LEGACY_ASSET_PREFIX)) {
      return new Response("Not found", { status: 404 });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("content-type") || "";
    if (url.pathname === "/Assets/Characters/Animations/manifest.json") {
      const headers = new Headers(assetResponse.headers);
      headers.set("cache-control", "no-store");
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    if (!contentType.includes("text/html")) {
      const headers = new Headers(assetResponse.headers);
      headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    const headers = new Headers(assetResponse.headers);
    headers.set("cache-control", "no-store");
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
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
  /** @type {Map<string, import("../src/NetCode/account").PlayerAccount | null>} */
  clientAccounts = new Map();
  /** @type {Map<string, import("../src/NetCode/matchmaking").OnlineClientIntent>} */
  clientIntents = new Map();
  /** @type {Set<string>} */
  quickMatchPendingClients = new Set();
  /** @type {Map<string, number>} */
  preferredCharacterSelections = new Map();
  /** @type {Map<string, { game: GameApp, inputs: Record<1 | 2 | 3 | 4, import("../src/NetCode/protocol").OnlineInputState & { inputSeq?: number, sentAtMs?: number }>, ackedInputSeq: Record<1 | 2 | 3 | 4, number>, timer: ReturnType<typeof setInterval> | null, tick: number, activePlayerIds: Array<1 | 2 | 3 | 4>, botPlayerIds: Array<1 | 2 | 3 | 4>, characterSelections: Record<1 | 2 | 3 | 4, number>, matchResultChoices: Record<1 | 2 | 3 | 4, "rematch" | "lobby" | null>, clock: import("../src/NetCode/server-tick").FixedRatePumpState, resultRestartAtMs: number | null, roomMode: "classic" | "endless" }>} */
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
            roomMode: room.roomMode === "endless" ? "endless" : "classic",
            roomKind: normalizeStoredRoomKind(room.roomKind, room.roomMode),
            createdAt: room.createdAt,
            hostClientId: null,
            clients: new Set(room.clients),
            chat: Array.isArray(room.chat) ? room.chat.slice(-40) : [],
            seats: createSeatMap((seatId) => normalizeStoredSeat(room.seats?.[seatId], room.roomMode === "endless")),
          },
        ]),
      );

      for (const websocket of this.ctx.getWebSockets()) {
        const attachment = websocket.deserializeAttachment();
        if (attachment && typeof attachment === "object" && typeof attachment.clientId === "string") {
          this.sockets.set(attachment.clientId, websocket);
          this.clientAccounts.set(attachment.clientId, normalizeStoredAttachmentAccount(attachment.account));
          this.clientIntents.set(attachment.clientId, "idle");
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

    if (url.pathname === "/internal/feedback") {
      return this.handleFeedbackIngest(request);
    }

    if (url.pathname === "/internal/admin/login") {
      return this.handleAdminLogin(request, this.env);
    }

    if (url.pathname === "/internal/admin/logout") {
      return this.handleAdminLogout(request);
    }

    if (url.pathname === "/internal/admin/summary") {
      const auth = await authorizeAdminRequest(request, this.env, this.ctx.storage);
      if (!auth.ok) {
        return auth.response;
      }
      return this.handleAdminSummary();
    }

    if (url.pathname === "/internal/account/me") {
      return this.handleAccountMe(request);
    }

    if (url.pathname === "/internal/account/quick-create") {
      return this.handleQuickAccountCreate(request);
    }

    if (url.pathname === "/internal/account/logout") {
      return this.handleAccountLogout(request);
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
    const account = await this.readCurrentAccountFromRequest(request);
    await this.recordDailyIp(request);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId, account });
    this.sockets.set(clientId, server);
    this.clientAccounts.set(clientId, account);
    this.clientIntents.set(clientId, "idle");
    this.send(server, {
      type: "hello",
      clientId,
      account,
      sessionState: this.buildClientSessionState(clientId),
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
      case "endless-match":
        await this.handleEndlessMatch(clientId, payload.characterIndex);
        break;
      case "quick-match-cancel":
        this.quickMatchPendingClients.delete(clientId);
        this.clientIntents.set(clientId, "idle");
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
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleAccountMe(request) {
    const account = await this.readCurrentAccountFromRequest(request);
    return Response.json(
      { account },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleQuickAccountCreate(request) {
    const existingAccount = await this.readCurrentAccountFromRequest(request);
    if (existingAccount) {
      return Response.json(
        { account: existingAccount },
        {
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json(
        { error: "Nao foi possivel ler os dados da conta." },
        {
          status: 400,
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const validation = validateUsername(String(payload?.username ?? ""));
    if (!validation.ok || !validation.username || !validation.normalizedUsername) {
      return Response.json(
        { error: validation.message ?? "Username invalido." },
        {
          status: 400,
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const usernameLookupKey = buildAccountUsernameLookupKey(validation.normalizedUsername);
    const existingAccountId = await this.ctx.storage.get(usernameLookupKey);
    if (typeof existingAccountId === "string" && existingAccountId) {
      return Response.json(
        { error: "Esse username ja foi escolhido." },
        {
          status: 409,
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const now = Date.now();
    const account = {
      id: createId("acct"),
      username: validation.username,
      authLevel: "username",
      createdAt: now,
    };
    const session = {
      id: createId("sess"),
      accountId: account.id,
      createdAt: now,
      expiresAt: now + (ACCOUNT_SESSION_MAX_AGE_SECONDS * 1000),
    };

    await Promise.all([
      this.ctx.storage.put(buildAccountKey(account.id), account),
      this.ctx.storage.put(usernameLookupKey, account.id),
      this.ctx.storage.put(buildAccountSessionKey(session.id), session),
    ]);

    return Response.json(
      { account },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "set-cookie": buildSessionCookieHeader(session.id, request.url),
        },
      },
    );
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleAccountLogout(request) {
    const sessionId = readCookieValue(request.headers.get("cookie"), ACCOUNT_SESSION_COOKIE);
    if (sessionId) {
      await this.ctx.storage.delete(buildAccountSessionKey(sessionId));
    }
    return Response.json(
      { account: null },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": buildClearedSessionCookieHeader(),
        },
      },
    );
  }

  /**
   * @param {Request} request
   * @returns {Promise<import("../src/NetCode/account").PlayerAccount | null>}
   */
  async readCurrentAccountFromRequest(request) {
    const sessionId = readCookieValue(request.headers.get("cookie"), ACCOUNT_SESSION_COOKIE);
    if (!sessionId) {
      return null;
    }

    const storedSession = await this.ctx.storage.get(buildAccountSessionKey(sessionId));
    const session = normalizeStoredSession(storedSession);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      await this.ctx.storage.delete(buildAccountSessionKey(sessionId));
      return null;
    }

    const storedAccount = await this.ctx.storage.get(buildAccountKey(session.accountId));
    return normalizeStoredAccount(storedAccount);
  }

  /**
   * @param {string} clientId
   * @param {import("../src/NetCode/matchmaking").OnlineClientIntent} intent
   */
  setClientIntent(clientId, intent) {
    if (intent === "idle") {
      this.clientIntents.delete(clientId);
      return;
    }
    this.clientIntents.set(clientId, intent);
  }

  /**
   * @param {string} clientId
   * @param {{ room?: LobbyRoom | null, hasActiveMatch?: boolean }} [options]
   */
  buildClientSessionState(clientId, options = {}) {
    const room = options.room === undefined ? this.findRoomForClient(clientId) : (options.room ?? null);
    const hasActiveMatch = options.hasActiveMatch === undefined
      ? Boolean(room && this.matches.get(room.roomCode))
      : options.hasActiveMatch;

    return resolveOnlineSessionState(
      this.clientIntents.get(clientId) ?? "idle",
      room
        ? {
          roomCode: room.roomCode,
          roomMode: room.roomMode === "endless" ? "endless" : "classic",
          roomKind: room.roomKind,
          status: room.status,
        }
        : null,
      hasActiveMatch,
    );
  }

  /**
   * @param {string} clientId
   * @param {string} rawTitle
   */
  async handleCreateLobby(clientId, rawTitle) {
    this.quickMatchPendingClients.delete(clientId);
    this.setClientIntent(clientId, "manual");
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
      roomMode: "classic",
      roomKind: "manual",
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
    if (roomCode === ENDLESS_ROOM_CODE) {
      await this.handleEndlessMatch(clientId, this.preferredCharacterSelections.get(clientId) ?? 0);
      return;
    }
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendToClient(clientId, { type: "error", message: "Lobby not found." });
      return;
    }

    if (room.roomMode === "endless") {
      await this.handleEndlessMatch(clientId, this.preferredCharacterSelections.get(clientId) ?? 0);
      return;
    }

    this.setClientIntent(clientId, room.roomKind === "matchmaking" ? "queue_classic" : "manual");

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
    this.setClientIntent(clientId, "idle");
    this.reconcileRoomsWithActiveSockets();
    const room = this.findRoomForClient(clientId);
    if (!room) {
      this.sendToClient(clientId, {
        type: "lobby-left",
        sessionState: this.buildClientSessionState(clientId, { room: null, hasActiveMatch: false }),
      });
      this.broadcastQuickMatchState();
      return;
    }

    if (room.roomMode === "endless") {
      await this.leaveEndlessRoom(room, clientId);
      this.sendToClient(clientId, {
        type: "lobby-left",
        sessionState: this.buildClientSessionState(clientId, { room: null, hasActiveMatch: false }),
      });
      this.broadcastLobbyList();
      this.broadcastQuickMatchState();
      return;
    }

    await this.releaseClientFromRoom(room, clientId);
    this.sendToClient(clientId, {
      type: "lobby-left",
      sessionState: this.buildClientSessionState(clientId, { room: null, hasActiveMatch: false }),
    });
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
    this.setClientIntent(clientId, "queue_classic");
    this.quickMatchPendingClients.add(clientId);
    try {
      this.reconcileRoomsWithActiveSockets();
      const activeRoom = this.findRoomForClient(clientId);
      if (canReuseCurrentRoomForQuickMatch(activeRoom)) {
        const reusedCurrentLobby = await this.readyClientForQuickMatch(activeRoom, clientId, rawCharacterIndex);
        if (reusedCurrentLobby) {
          return;
        }
      }

      const previousRoomCode = activeRoom?.roomCode ?? null;
      if (activeRoom) {
        await this.releaseClientFromRoom(activeRoom, clientId);
        this.sendToClient(clientId, {
          type: "lobby-left",
          sessionState: this.buildClientSessionState(clientId, { room: null, hasActiveMatch: false }),
        });
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
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async handleEndlessMatch(clientId, rawCharacterIndex) {
    this.quickMatchPendingClients.delete(clientId);
    this.setClientIntent(clientId, "queue_endless");
    this.preferredCharacterSelections.set(clientId, normalizeCharacterIndex(rawCharacterIndex, 0));
    this.reconcileRoomsWithActiveSockets();

    const currentRoom = this.findRoomForClient(clientId);
    if (currentRoom && currentRoom.roomMode === "endless") {
      await this.joinEndlessRoom(currentRoom, clientId, rawCharacterIndex);
      return;
    }
    if (currentRoom) {
      await this.releaseClientFromRoom(currentRoom, clientId);
      this.sendToClient(clientId, {
        type: "lobby-left",
        sessionState: this.buildClientSessionState(clientId, { room: null, hasActiveMatch: false }),
      });
    }

    let room = this.findEndlessRoom();
    if (!room) {
      room = this.createEndlessRoom();
      this.rooms.set(room.roomCode, room);
    }

    await this.joinEndlessRoom(room, clientId, rawCharacterIndex);
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
  }

  createEndlessRoom() {
    const room = {
      roomCode: ENDLESS_ROOM_CODE,
      title: ENDLESS_ROOM_TITLE,
      createdAt: Date.now(),
      status: "playing",
      roomMode: "endless",
      roomKind: "endless",
      hostClientId: null,
      clients: new Set(),
      chat: [],
      seats: createSeatMap((seatId) => createBotSeat((seatId - 1) % 4)),
    };
    this.refreshSeatLabels(room);
    return room;
  }

  findEndlessRoom() {
    for (const room of this.rooms.values()) {
      if (room.roomMode === "endless") {
        return room;
      }
    }
    return null;
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   * @param {unknown} rawCharacterIndex
   */
  async joinEndlessRoom(room, clientId, rawCharacterIndex) {
    let seatId = this.findSeatForClient(room, clientId);
    if (!seatId) {
      seatId = PLAYER_IDS.find((candidateSeatId) => room.seats[candidateSeatId].occupantType === "bot") ?? null;
    }
    if (!seatId) {
      this.sendToClient(clientId, { type: "error", message: "A partida infinita esta lotada agora." });
      return false;
    }

    const fallbackCharacterIndex = room.seats[seatId]?.characterIndex ?? ((seatId - 1) % 4);
    room.clients.add(clientId);
    room.seats[seatId] = createHumanSeat(clientId, normalizeCharacterIndex(rawCharacterIndex, fallbackCharacterIndex));
    room.hostClientId = room.hostClientId && this.sockets.has(room.hostClientId)
      ? room.hostClientId
      : clientId;
    room.status = "playing";
    this.refreshSeatLabels(room);

    let match = this.matches.get(room.roomCode);
    if (!match) {
      const activePlayerIds = PLAYER_IDS.slice();
      const characterSelections = createSeatMap((playerId) => room.seats[playerId].characterIndex ?? 0);
      const botPlayerIds = PLAYER_IDS.filter((playerId) => room.seats[playerId].occupantType === "bot");
      this.startRoomMatch(room, activePlayerIds, characterSelections, {
        roomMode: "endless",
        botPlayerIds,
        broadcastInitialSnapshot: false,
      });
      match = this.matches.get(room.roomCode) ?? null;
      this.appendRoomSystemMessage(room, "Modo infinito iniciado.");
    } else {
      match.characterSelections[seatId] = room.seats[seatId].characterIndex ?? fallbackCharacterIndex;
      await this.syncEndlessMatchState(room, match);
    }

    await this.persistState();
    this.sendJoinedLobby(clientId, room);
    this.sendMatchStartedToSeat(room, seatId, match?.activePlayerIds ?? PLAYER_IDS.slice(), match?.characterSelections ?? createSeatMap((playerId) => room.seats[playerId].characterIndex ?? 0), match?.botPlayerIds ?? []);
    this.broadcastLobbyToMembers(room);
    this.broadcastSnapshot(room.roomCode);
    return true;
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   */
  async leaveEndlessRoom(room, clientId) {
    room.clients.delete(clientId);
    const seatId = this.findSeatForClient(room, clientId);
    if (!seatId) {
      if (room.clients.size === 0) {
        this.stopRoomMatch(room.roomCode);
        this.rooms.delete(room.roomCode);
        await this.persistState();
      }
      return;
    }

    const seat = room.seats[seatId];
    room.seats[seatId] = createBotSeat(seat.characterIndex ?? ((seatId - 1) % 4));
    this.refreshSeatLabels(room);

    const match = this.matches.get(room.roomCode);
    if (match) {
      match.inputs[seatId] = createNeutralInput();
      await this.syncEndlessMatchState(room, match, seatId);
      this.appendRoomSystemMessage(room, `P${seatId} saiu. Um bot assumiu a vaga.`);
    }

    if (room.clients.size === 0) {
      this.stopRoomMatch(room.roomCode);
      this.rooms.delete(room.roomCode);
      await this.persistState();
      return;
    }

    await this.persistState();
    this.broadcastLobbyToMembers(room);
  }

  /**
   * @param {LobbyRoom} room
   * @param {ReturnType<GlobalLobby["matches"]["get"]>} match
   * @param {1 | 2 | 3 | 4 | null} eliminatedSeatId
   */
  async syncEndlessMatchState(room, match, eliminatedSeatId = null) {
    match.botPlayerIds = PLAYER_IDS.filter((playerId) => room.seats[playerId].occupantType === "bot");
    match.characterSelections = createSeatMap((seatId) => room.seats[seatId].characterIndex ?? 0);
    match.game.setServerBotPlayers(match.botPlayerIds);
    match.game.setServerCharacterSelections(match.characterSelections);
    match.game.setServerPlayerLabels(this.buildRoomPlayerLabels(room));
    if (eliminatedSeatId) {
      match.game.eliminateServerPlayer(eliminatedSeatId);
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
    if (room.roomMode !== "classic" || room.status !== "open") {
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
    this.clientAccounts.delete(clientId);
    this.quickMatchPendingClients.delete(clientId);
    this.preferredCharacterSelections.delete(clientId);
    this.clientIntents.delete(clientId);
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
    await this.recordDailyIp(request);

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
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleFeedbackIngest(request) {
    await this.recordDailyIp(request);

    /** @type {unknown} */
    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const message = typeof payload?.message === "string" ? payload.message.trim() : "";
    if (!message) {
      return Response.json({ ok: false, error: "Feedback message is required." }, { status: 400 });
    }
    if (message.length > 2000) {
      return Response.json({ ok: false, error: "Feedback message is too long." }, { status: 400 });
    }

    const occurredAtMs = Date.now();
    const dateKey = formatDateKey(occurredAtMs);
    const feedback = {
      id: createId("fb"),
      dateKey,
      message,
      screen: typeof payload?.screen === "string" ? payload.screen.trim().slice(0, 64) : null,
      roomCode: typeof payload?.roomCode === "string" ? payload.roomCode.trim().slice(0, 12) : null,
      referrerHost: request.headers.get("referer") ? safeHostFromUrl(request.headers.get("referer")) : null,
      createdAt: occurredAtMs,
    };

    await this.ctx.storage.put(buildFeedbackKey(dateKey, occurredAtMs, feedback.id), feedback);

    return Response.json(
      { ok: true, feedbackId: feedback.id },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  /**
   * @param {Request} request
   * @param {Record<string, string | undefined>} env
   * @returns {Promise<Response>}
   */
  async handleAdminLogin(request, env) {
    /** @type {unknown} */
    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const username = typeof payload?.username === "string" ? payload.username.trim() : "";
    const password = typeof payload?.password === "string" ? payload.password.trim() : "";
    const expectedUsername = getAdminUsername(env);
    const expectedPassword = getAdminPassword(env);

    if (!username || !password) {
      return Response.json({ ok: false, error: "Username and password are required." }, { status: 400 });
    }

    if (!timingSafeEqual(username, expectedUsername) || !timingSafeEqual(password, expectedPassword)) {
      return Response.json({ ok: false, error: "Invalid credentials." }, {
        status: 401,
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const session = {
      id: createId("admin"),
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
    };

    await this.ctx.storage.put(buildAdminSessionKey(session.id), session);

    return Response.json(
      { ok: true, username: session.username },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": buildAdminSessionCookieHeader(session.id, request.url),
        },
      },
    );
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleAdminLogout(request) {
    const sessionId = readCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE);
    if (sessionId) {
      await this.ctx.storage.delete(buildAdminSessionKey(sessionId));
    }

    return Response.json(
      { ok: true },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": buildClearedAdminSessionCookieHeader(),
        },
      },
    );
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
   *   recentFeedbacks: unknown[];
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
      recentFeedbacks: await this.readRecentFeedbacks(12),
      recentDays,
    };
  }

  /**
   * @param {string} dateKey
   * @returns {Promise<{
   *   date: string;
   *   uniquePlayers: number;
   *   uniqueIps: number;
   *   sessions: number;
   *   totalEvents: number;
   *   completedSessions: number;
   *   completedMatches: number;
   *   feedbackCount: number;
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
    const uniqueIps = await this.countAnalyticsKeys(`analytics:ip:${dateKey}:`);
    const sessions = await this.countAnalyticsKeys(`analytics:session:${dateKey}:`);
    const feedbackCount = await this.countFeedbackEntries(dateKey);
    const retentionD1 = await this.computeRetentionD1(dateKey);

    return {
      date: dateKey,
      uniquePlayers,
      uniqueIps,
      sessions,
      totalEvents: metrics.totalEvents,
      completedSessions: metrics.completedSessions,
      completedMatches: metrics.eventCounts.match_ended || 0,
      feedbackCount,
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
   * @returns {Promise<number>}
   */
  async countFeedbackEntries(dateKey) {
    const records = await this.ctx.storage.list({ prefix: `feedback:${dateKey}:` });
    return records.size;
  }

  /**
   * @param {number} limit
   * @returns {Promise<Array<{ id: string; dateKey: string; message: string; screen: string | null; roomCode: string | null; referrerHost: string | null; createdAt: number; }>>}
   */
  async readRecentFeedbacks(limit) {
    const records = await this.ctx.storage.list({ prefix: "feedback:" });
    const feedbacks = [];
    for (const value of records.values()) {
      const normalized = normalizeStoredFeedback(value);
      if (normalized) {
        feedbacks.push(normalized);
      }
    }

    return feedbacks
      .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))
      .slice(0, Math.max(0, limit));
  }

  /**
   * @param {Request} request
   * @returns {Promise<void>}
   */
  async recordDailyIp(request) {
    const ip = readRequestIpAddress(request);
    if (!ip) {
      return;
    }

    const hash = await hashStableText(ip);
    if (!hash) {
      return;
    }

    const dateKey = formatDateKey(Date.now());
    await this.ctx.storage.put(buildAnalyticsIpKey(dateKey, hash), {
      seenAt: Date.now(),
    });
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
    if (room.roomMode === "endless") {
      await this.leaveEndlessRoom(room, clientId);
      return;
    }
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
        sessionState: this.buildClientSessionState(clientId, {
          room,
          hasActiveMatch: Boolean(this.matches.get(room.roomCode)),
        }),
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
      sessionState: this.buildClientSessionState(clientId, {
        room,
        hasActiveMatch: Boolean(this.matches.get(room.roomCode)),
      }),
    });
  }

  broadcastLobbyList() {
    this.reconcileRoomsWithActiveSockets();
    const lobbies = this.buildLobbyList();
    const onlineUsers = this.sockets.size;
    const onlinePlayers = this.buildOnlinePresenceList();
    for (const [clientId, websocket] of this.sockets.entries()) {
      this.send(websocket, {
        type: "lobby-list",
        lobbies,
        onlineUsers,
        onlinePlayers,
        sessionState: this.buildClientSessionState(clientId),
      });
    }
  }

  buildOnlinePresenceList() {
    return Array.from(this.sockets.keys())
      .sort((left, right) => left.localeCompare(right))
      .map((clientId) => ({
        clientId,
        displayName: this.clientAccounts.get(clientId)?.username ?? null,
      }));
  }

  buildLobbyList() {
    return Array.from(this.rooms.values())
      .filter((room) => isManualLobbyVisible(room))
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
      roomMode: room.roomMode === "endless" ? "endless" : "classic",
      roomKind: room.roomKind,
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
    room.seats[seat] = createHumanSeat(
      clientId,
      normalizeCharacterIndex(rawCharacterIndex, room.seats[seat].characterIndex ?? ((seat - 1) % 2)),
      this.getHumanSeatDisplayName(clientId, seat),
    );
  }

  /**
   * @param {LobbyRoom} room
   */
  refreshSeatLabels(room) {
    for (const seatId of PLAYER_IDS) {
      const seat = room.seats[seatId];
      if (seat.occupantType === "bot") {
        seat.displayName = "BOT";
        continue;
      }
      if (!seat.clientId) {
        seat.displayName = null;
        continue;
      }
      seat.displayName = this.getHumanSeatDisplayName(seat.clientId, seatId);
    }
  }

  /**
   * @param {string} clientId
   * @param {number} seatId
   * @returns {string}
   */
  getHumanSeatDisplayName(clientId, seatId) {
    const account = this.clientAccounts.get(clientId);
    return account?.username || `Pilot ${seatId}`;
  }

  /**
   * @param {LobbyRoom} room
   * @returns {Record<1 | 2 | 3 | 4, string>}
   */
  buildRoomPlayerLabels(room) {
    return createSeatMap((seatId) => {
      const seat = room.seats[seatId];
      if (seat.occupantType === "bot") {
        return "BOT";
      }
      return seat.displayName || `P${seatId}`;
    });
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
        room.seats[seatId] = room.roomMode === "endless"
          ? createBotSeat(seat.characterIndex ?? ((seatId - 1) % 4))
          : createEmptySeat();
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
    const mustResetPlayingRoom = room.status === "playing"
      && (
        !activeMatch
        || shouldResetPlayingRoom(
          {
            roomCode: room.roomCode,
            roomMode: room.roomMode === "endless" ? "endless" : "classic",
            roomKind: room.roomKind,
            status: room.status,
          },
          room.seats,
          activeMatch.activePlayerIds,
        )
      );
    if (mustResetPlayingRoom) {
      this.stopRoomMatch(room.roomCode);
      room.status = "open";
      for (const seatId of PLAYER_IDS) {
        room.seats[seatId].ready = false;
      }
      this.appendRoomSystemMessage(
        room,
        room.roomMode === "endless"
          ? "Partida infinita sincronizada novamente."
          : "Match reset after a pilot disconnected.",
      );
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
        roomMode: room.roomMode === "endless" ? "endless" : "classic",
        roomKind: room.roomKind,
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
  startRoomMatch(room, activePlayerIds, characterSelections, options = {}) {
    this.stopRoomMatch(room.roomCode);
    const game = createServerGame();
    const roomMode = options.roomMode === "endless" ? "endless" : room.roomMode === "endless" ? "endless" : "classic";
    const botPlayerIds = Array.isArray(options.botPlayerIds) ? options.botPlayerIds.filter((seatId) => PLAYER_IDS.includes(seatId)) : [];
    const playerLabels = options.playerLabels ?? this.buildRoomPlayerLabels(room);
    game.startServerAuthoritativeMatch(activePlayerIds, characterSelections, {
      roomMode,
      botPlayerIds,
      endlessStats: options.endlessStats ?? null,
      playerLabels,
    });
    const match = {
      game,
      inputs: createSeatMap(() => createNeutralInput()),
      ackedInputSeq: createSeatMap(() => 0),
      timer: null,
      tick: 0,
      activePlayerIds,
      botPlayerIds,
      characterSelections,
      matchResultChoices: createSeatMap(() => null),
      clock: createFixedRatePumpState(Date.now()),
      resultRestartAtMs: null,
      roomMode,
    };
    match.timer = setInterval(() => {
      this.pumpRoomMatch(room.roomCode);
    }, MATCH_PUMP_INTERVAL_MS);
    this.matches.set(room.roomCode, match);
    if (options.broadcastInitialSnapshot !== false) {
      this.broadcastSnapshot(room.roomCode);
    }
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
  async pumpRoomMatch(roomCode) {
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

    const snapshot = this.broadcastFrame(roomCode);
    if (match.roomMode !== "endless" && snapshot?.matchWinner) {
      if (!match.resultRestartAtMs) {
        match.resultRestartAtMs = Date.now() + MATCH_RESULT_RESTART_DELAY_MS;
      } else if (Date.now() >= match.resultRestartAtMs) {
        if (match.activePlayerIds.length >= 2) {
          await this.restartPlayingMatch(room, match);
        } else {
          await this.resetRoomToLobby(room, "Not enough players to keep auto-starting. Waiting in lobby.");
        }
        return;
      }
    } else {
      match.resultRestartAtMs = null;
    }
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
        roomMode: snapshot.roomMode,
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
        botPlayerIds: snapshot.botPlayerIds,
        endlessStats: snapshot.endlessStats,
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
        sessionState: this.buildClientSessionState(clientId),
      });
    }
  }

  countOpenQuickMatchRooms() {
    let availableRooms = 0;
    for (const room of this.rooms.values()) {
      this.sanitizeRoomOccupancy(room);
      if (!isQuickMatchCandidate(room)) {
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
      if (!isQuickMatchCandidate(room, excludeRoomCode)) {
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
      roomMode: "classic",
      roomKind: "matchmaking",
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
   * @param {{ activePlayerIds: Array<1 | 2 | 3 | 4>, characterSelections: Record<1 | 2 | 3 | 4, number> }} match
   */
  async restartPlayingMatch(room, match) {
    const activePlayerIds = match.activePlayerIds.filter((seatId) => Boolean(room.seats[seatId]?.clientId));
    if (activePlayerIds.length < 2) {
      await this.resetRoomToLobby(room, "Not enough players to keep auto-starting. Waiting in lobby.");
      return;
    }

    const characterSelections = createSeatMap((seatId) => room.seats[seatId].characterIndex ?? 0);
    room.clients = new Set(activePlayerIds.map((seatId) => room.seats[seatId].clientId).filter(Boolean));
    room.hostClientId = room.seats[activePlayerIds[0]].clientId;
    room.status = "playing";
    this.refreshSeatLabels(room);
    await this.persistState();

    this.sendMatchStarted(room, activePlayerIds, characterSelections);
    this.startRoomMatch(room, activePlayerIds, characterSelections);
    this.appendRoomSystemMessage(room, "Champion declared. Next match started automatically.");
    await this.persistState();
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
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
      const match = this.matches.get(room.roomCode);
      this.sendMatchStartedToSeat(
        room,
        seatId,
        activePlayerIds,
        characterSelections,
        match?.botPlayerIds ?? [],
      );
    }
  }

  sendMatchStartedToSeat(room, seatId, activePlayerIds, characterSelections, botPlayerIds = []) {
    const seat = room.seats[seatId];
    if (!seat?.clientId) {
      return;
    }
    this.sendToClient(seat.clientId, {
      type: "match-started",
      config: {
        roomCode: room.roomCode,
        role: "guest",
        roomMode: room.roomMode === "endless" ? "endless" : "classic",
        localPlayerId: seatId,
        activePlayerIds,
        botPlayerIds,
        characterSelections,
        playerLabels: this.buildRoomPlayerLabels(room),
      },
      sessionState: this.buildClientSessionState(seat.clientId, {
        room,
        hasActiveMatch: true,
      }),
    });
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
      return room.seats[seat].displayName || `P${seat}`;
    }
    return this.clientAccounts.get(clientId)?.username || "Pilot";
  }
}

function createEmptySeat() {
  return {
    clientId: null,
    displayName: null,
    characterIndex: 0,
    ready: false,
    occupantType: "empty",
  };
}

function createHumanSeat(clientId, characterIndex = 0, displayName = null) {
  return {
    clientId,
    displayName,
    characterIndex,
    ready: false,
    occupantType: "human",
  };
}

function createBotSeat(characterIndex = 0) {
  return {
    clientId: null,
    displayName: "BOT",
    characterIndex,
    ready: true,
    occupantType: "bot",
  };
}

function normalizeStoredRoomKind(roomKind, roomMode = "classic") {
  if (roomMode === "endless") {
    return "endless";
  }
  return roomKind === "matchmaking" ? "matchmaking" : "manual";
}

function normalizeStoredSeat(seat, endlessRoom = false) {
  if (!seat || typeof seat !== "object") {
    return endlessRoom ? createBotSeat(0) : createEmptySeat();
  }
  if (seat.clientId) {
    return {
      clientId: seat.clientId,
      displayName: seat.displayName ?? null,
      characterIndex: normalizeCharacterIndex(seat.characterIndex, 0),
      ready: Boolean(seat.ready),
      occupantType: "human",
    };
  }
  if (seat.occupantType === "bot" || endlessRoom) {
    return createBotSeat(normalizeCharacterIndex(seat.characterIndex, 0));
  }
  return createEmptySeat();
}

function normalizeStoredAccount(account) {
  if (!account || typeof account !== "object") {
    return null;
  }
  if (typeof account.id !== "string" || typeof account.username !== "string") {
    return null;
  }
  return {
    id: account.id,
    username: account.username,
    authLevel: account.authLevel === "email" ? "email" : "username",
    createdAt: Number.isFinite(account.createdAt) ? account.createdAt : 0,
  };
}

function normalizeStoredAttachmentAccount(account) {
  return normalizeStoredAccount(account);
}

function normalizeStoredSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }
  if (typeof session.id !== "string" || typeof session.accountId !== "string") {
    return null;
  }
  const expiresAt = Number(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return null;
  }
  return {
    id: session.id,
    accountId: session.accountId,
    createdAt: Number.isFinite(session.createdAt) ? session.createdAt : 0,
    expiresAt,
  };
}

function buildAccountKey(accountId) {
  return `account:${accountId}`;
}

function buildAccountUsernameLookupKey(normalizedUsername) {
  return `account-username:${normalizedUsername}`;
}

function buildAccountSessionKey(sessionId) {
  return `account-session:${sessionId}`;
}

function readCookieValue(cookieHeader, name) {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = cookie.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }
    const value = cookie.slice(separatorIndex + 1).trim();
    return value || null;
  }
  return null;
}

function buildSessionCookieHeader(sessionId, requestUrl) {
  const url = new URL(requestUrl);
  const parts = [
    `${ACCOUNT_SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    `Max-Age=${ACCOUNT_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (url.protocol === "https:") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildClearedSessionCookieHeader() {
  return [
    `${ACCOUNT_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
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

async function authorizeAdminRequest(request, env, storage) {
  const session = await readStoredAdminSession(request, storage);
  if (session) {
    return { ok: true, session };
  }

  const legacyToken = readAdminToken(request);
  if (legacyToken && env.ADMIN_TOKEN && timingSafeEqual(legacyToken, env.ADMIN_TOKEN)) {
    return { ok: true, legacy: true };
  }

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

function readAdminToken(request) {
  const url = new URL(request.url);
  const headerToken = request.headers.get("x-admin-token") || request.headers.get("authorization");
  if (headerToken) {
    return headerToken.replace(/^Bearer\s+/i, "").trim();
  }
  return (url.searchParams.get("token") || "").trim();
}

async function readStoredAdminSession(request, storage) {
  if (!storage) {
    return null;
  }
  const sessionId = readCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const stored = normalizeStoredAdminSession(await storage.get(buildAdminSessionKey(sessionId)));
  if (!stored) {
    return null;
  }

  if (stored.expiresAt <= Date.now()) {
    await storage.delete(buildAdminSessionKey(sessionId));
    return null;
  }

  return stored;
}

function getAdminUsername(env) {
  const value = typeof env?.ADMIN_USERNAME === "string" ? env.ADMIN_USERNAME.trim() : "";
  return value || ADMIN_DEFAULT_USERNAME;
}

function getAdminPassword(env) {
  const value = typeof env?.ADMIN_PASSWORD === "string" ? env.ADMIN_PASSWORD.trim() : "";
  if (value) {
    return value;
  }
  const token = typeof env?.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN.trim() : "";
  return token || ADMIN_DEFAULT_PASSWORD;
}

function buildAdminSessionKey(sessionId) {
  return `admin-session:${sessionId}`;
}

function buildFeedbackKey(dateKey, createdAtMs, feedbackId) {
  return `feedback:${dateKey}:${String(createdAtMs).padStart(13, "0")}:${feedbackId}`;
}

function buildAnalyticsIpKey(dateKey, ipHash) {
  return `analytics:ip:${dateKey}:${ipHash}`;
}

function buildAdminSessionCookieHeader(sessionId, requestUrl) {
  const url = new URL(requestUrl);
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    `Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (url.protocol === "https:") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildClearedAdminSessionCookieHeader() {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function readRequestIpAddress(request) {
  const ip = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip");
  const normalized = typeof ip === "string" ? ip.trim() : "";
  return normalized || null;
}

function normalizeStoredFeedback(feedback) {
  if (!feedback || typeof feedback !== "object") {
    return null;
  }
  if (typeof feedback.id !== "string" || typeof feedback.dateKey !== "string" || typeof feedback.message !== "string") {
    return null;
  }
  return {
    id: feedback.id,
    dateKey: feedback.dateKey,
    message: feedback.message,
    screen: typeof feedback.screen === "string" && feedback.screen ? feedback.screen : null,
    roomCode: typeof feedback.roomCode === "string" && feedback.roomCode ? feedback.roomCode : null,
    referrerHost: typeof feedback.referrerHost === "string" && feedback.referrerHost ? feedback.referrerHost : null,
    createdAt: Number.isFinite(feedback.createdAt) ? feedback.createdAt : 0,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hashStableText(value) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex.slice(0, 32);
}

function normalizeStoredAdminSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }
  if (typeof session.id !== "string" || typeof session.username !== "string") {
    return null;
  }
  const expiresAt = Number(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return null;
  }
  return {
    id: session.id,
    username: session.username,
    createdAt: Number.isFinite(session.createdAt) ? session.createdAt : 0,
    expiresAt,
  };
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
    `Unique IPs: ${day.uniqueIps}`,
    `Sessions: ${day.sessions}`,
    `Matches started: ${day.eventCounts.match_started || 0}`,
    `Matches completed: ${day.completedMatches}`,
    `Feedbacks: ${day.feedbackCount}`,
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

function renderAdminHtml(env) {
  const safeUsername = escapeHtml(getAdminUsername(env));
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
      .auth-shell {
        display: grid;
        grid-template-columns: minmax(280px, 420px) 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .auth-form {
        display: grid;
        gap: 10px;
      }
      .field {
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--panel-alt);
        color: var(--text);
        padding: 12px;
      }
      .hidden { display: none !important; }
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
      .success {
        color: #8be9a8;
        margin-top: 12px;
      }
      .feedback-item {
        display: grid;
        gap: 6px;
        padding: 12px 0;
        border-bottom: 1px solid var(--border);
      }
      .feedback-item:last-child { border-bottom: 0; }
      .feedback-item__meta {
        color: var(--muted);
        font-size: 0.88rem;
      }
      @media (max-width: 860px) {
        .auth-shell { grid-template-columns: 1fr; }
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

      <section class="auth-shell">
        <section class="panel" id="login-panel">
          <small>Admin access</small>
          <h2>Login</h2>
          <p class="muted">Use the username/password pair configured for this Worker.</p>
          <div class="auth-form" style="margin-top:12px;">
            <input id="username-input" class="field" type="text" value="${safeUsername}" autocomplete="username" />
            <input id="password-input" class="field" type="password" placeholder="Password" autocomplete="current-password" />
            <button id="login-button" class="experience-button experience-button--primary" type="button">Entrar</button>
          </div>
          <p id="login-error" class="error"></p>
        </section>

        <section class="panel hidden" id="session-panel">
          <small>Session</small>
          <h2>Authenticated admin session</h2>
          <p class="muted">The session is stored in an HttpOnly cookie and expires automatically.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
            <button id="logout-button" class="experience-button experience-button--ghost" type="button">Sair</button>
          </div>
          <p id="session-status" class="success"></p>
        </section>
      </section>

      <section class="grid hidden" id="top-metrics"></section>

      <section class="layout hidden" id="dashboard">
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
                <tr><th>Date</th><th>Unique</th><th>IPs</th><th>Sessions</th><th>Matches</th><th>Feedback</th></tr>
              </thead>
              <tbody id="recent-days"></tbody>
            </table>
          </div>
          <div class="panel">
            <small>Recent feedback</small>
            <div id="recent-feedbacks" class="list"></div>
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

      <p id="error" class="error hidden"></p>
    </main>
    <script>
      const loginPanel = document.getElementById("login-panel");
      const sessionPanel = document.getElementById("session-panel");
      const dashboard = document.getElementById("dashboard");
      const topMetrics = document.getElementById("top-metrics");
      const errorNode = document.getElementById("error");
      const loginError = document.getElementById("login-error");
      const sessionStatus = document.getElementById("session-status");
      const usernameInput = document.getElementById("username-input");
      const passwordInput = document.getElementById("password-input");
      const loginButton = document.getElementById("login-button");
      const logoutButton = document.getElementById("logout-button");
      const generatedAt = document.getElementById("generated-at");

      function showAuthedUI() {
        loginPanel.classList.add("hidden");
        sessionPanel.classList.remove("hidden");
        dashboard.classList.remove("hidden");
        topMetrics.classList.remove("hidden");
        errorNode.classList.add("hidden");
      }

      function showLoginUI(message) {
        loginPanel.classList.remove("hidden");
        sessionPanel.classList.add("hidden");
        dashboard.classList.add("hidden");
        topMetrics.classList.add("hidden");
        if (message) {
          loginError.textContent = message;
        }
      }

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
        generatedAt.textContent = "Updated " + new Date(data.generatedAt).toLocaleString();
        const today = data.today;
        topMetrics.innerHTML = "";
        [
          ["Online now", data.onlineNow],
          ["Unique today", today.uniquePlayers],
          ["Unique IPs", today.uniqueIps],
          ["Sessions today", today.sessions],
          ["Matches started", today.eventCounts.match_started || 0],
          ["Matches completed", today.completedMatches || 0],
          ["Quick match clicks", today.eventCounts.quick_match_clicked || 0],
          ["Feedbacks today", today.feedbackCount || 0],
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
            "<td>" + day.uniqueIps + "</td>" +
            "<td>" + day.sessions + "</td>" +
            "<td>" + (day.eventCounts.match_started || 0) + "</td>" +
            "<td>" + (day.feedbackCount || 0) + "</td>";
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

        const recentFeedbacks = document.getElementById("recent-feedbacks");
        recentFeedbacks.innerHTML = "";
        if (!data.recentFeedbacks || data.recentFeedbacks.length === 0) {
          recentFeedbacks.textContent = "No feedback yet.";
        } else {
          data.recentFeedbacks.forEach((feedback) => {
            const item = document.createElement("div");
            item.className = "feedback-item";
            const text = document.createElement("div");
            text.textContent = feedback.message;
            const meta = document.createElement("div");
            meta.className = "feedback-item__meta";
            meta.textContent = [
              new Date(feedback.createdAt).toLocaleString(),
              feedback.screen ? "screen: " + feedback.screen : null,
              feedback.roomCode ? "room: " + feedback.roomCode : null,
              feedback.referrerHost ? "ref: " + feedback.referrerHost : null,
            ].filter(Boolean).join(" • ");
            item.append(text, meta);
            recentFeedbacks.appendChild(item);
          });
        }
      }

      async function loadSummary() {
        errorNode.textContent = "";
        try {
          const response = await fetch("/api/admin/summary", {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (response.status === 401) {
            showLoginUI("");
            return;
          }
          if (!response.ok) {
            throw new Error("Request failed with status " + response.status);
          }
          const data = await response.json();
          showAuthedUI();
          renderSummary(data);
        } catch (error) {
          errorNode.textContent = error.message;
          errorNode.classList.remove("hidden");
        }
      }

      async function login() {
        loginError.textContent = "";
        try {
          loginButton.disabled = true;
          loginButton.textContent = "Entrando...";
          const response = await fetch("/api/admin/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              username: usernameInput.value.trim(),
              password: passwordInput.value,
            }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error((payload && payload.error) || "Login failed with status " + response.status);
          }
          passwordInput.value = "";
          sessionStatus.textContent = "Signed in as ${safeUsername}.";
          await loadSummary();
        } catch (error) {
          loginError.textContent = error.message;
        } finally {
          loginButton.disabled = false;
          loginButton.textContent = "Entrar";
        }
      }

      async function logout() {
        logoutButton.disabled = true;
        try {
          await fetch("/api/admin/logout", {
            method: "POST",
            credentials: "same-origin",
          });
        } finally {
          logoutButton.disabled = false;
          sessionStatus.textContent = "Signed out.";
          showLoginUI("");
        }
      }

      loginButton.addEventListener("click", login);
      logoutButton.addEventListener("click", logout);
      passwordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void login();
        }
      });

      loadSummary();
      setInterval(loadSummary, 15000);
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
