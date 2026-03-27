import { DurableObject } from "cloudflare:workers";
import { GameApp } from "../src/app/game-app";

const STATE_VERSION = 3;
const MATCH_TICK_MS = 1000 / 60;
const FULL_SNAPSHOT_EVERY_TICKS = 6;
const PLAYER_IDS = [1, 2, 3, 4];
const MATCH_RESTART_DELAY_MS = 1_200;

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

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/online") {
      if (request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket upgrade", { status: 426 });
      }
      return env.LOBBY.getByName("global").fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class GlobalLobby extends DurableObject {
  /** @type {Map<string, LobbyRoom>} */
  rooms = new Map();
  /** @type {Map<string, WebSocket>} */
  sockets = new Map();
  /** @type {Set<string>} */
  quickMatchPendingClients = new Set();
  /** @type {Map<string, number>} */
  preferredCharacterSelections = new Map();
  /** @type {Map<string, { game: GameApp, inputs: Record<1 | 2 | 3 | 4, import("../src/online/protocol").OnlineInputState & { inputSeq?: number, sentAtMs?: number }>, timer: ReturnType<typeof setInterval> | null, restartTimer: ReturnType<typeof setTimeout> | null, tick: number, activePlayerIds: Array<1 | 2 | 3 | 4>, characterSelections: Record<1 | 2 | 3 | 4, number> }>} */
  matches = new Map();
  /** @type {Promise<void>} */
  ready;

  /**
   * @param {DurableObjectState} ctx
   * @param {Env} env
   */
  constructor(ctx, env) {
    super(ctx, env);
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
      quickMatchQueued: this.countOpenQuickMatchRooms(),
      searchingQuickMatch: this.quickMatchPendingClients.has(clientId),
    });

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
          ? "Match already in progress. Pick another open arena."
          : "Lobby full. Pick another arena or wait for a slot.",
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
      const activeRoom = this.findRoomForClient(clientId);
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

    const inputSeq = Math.max(0, Number(inputPayload?.inputSeq) || 0);
    if (inputSeq < (match.inputs[seat].inputSeq ?? 0)) {
      return;
    }

    match.inputs[seat] = {
      direction: inputPayload?.input?.direction ?? null,
      bombPressed: Boolean(inputPayload?.input?.bombPressed),
      detonatePressed: Boolean(inputPayload?.input?.detonatePressed),
      inputSeq,
      sentAtMs: Math.max(0, Number(inputPayload?.sentAtMs) || 0),
    };
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
      this.broadcastLobbyList();
    }
    this.reconcileRoomsWithActiveSockets();
    this.broadcastQuickMatchState();
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
    for (const websocket of this.sockets.values()) {
      this.send(websocket, { type: "lobby-list", lobbies });
    }
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
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
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
      timer: null,
      restartTimer: null,
      tick: 0,
      activePlayerIds,
      characterSelections,
    };
    match.timer = setInterval(() => {
      this.tickRoomMatch(room.roomCode);
    }, MATCH_TICK_MS);
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
    if (match.restartTimer) {
      clearTimeout(match.restartTimer);
    }
    this.matches.delete(roomCode);
  }

  /**
   * @param {string} roomCode
   */
  tickRoomMatch(roomCode) {
    const room = this.rooms.get(roomCode);
    const match = this.matches.get(roomCode);
    if (!room || !match || room.status !== "playing") {
      this.stopRoomMatch(roomCode);
      return;
    }

    for (const playerId of match.activePlayerIds) {
      match.game.setServerPlayerInput(playerId, match.inputs[playerId]);
    }
    match.game.advanceServerSimulation(MATCH_TICK_MS);
    for (const playerId of match.activePlayerIds) {
      match.inputs[playerId].bombPressed = false;
      match.inputs[playerId].detonatePressed = false;
    }
    match.tick += 1;
    const snapshot = this.broadcastFrame(roomCode);
    if (match.tick % FULL_SNAPSHOT_EVERY_TICKS === 0) {
      this.broadcastSnapshot(roomCode);
    }
    if (snapshot && snapshot.mode === "match-result" && !match.restartTimer) {
      this.scheduleMatchRestart(roomCode);
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
        ackedInputSeq: createSeatMap((playerId) => match.inputs[playerId].inputSeq ?? 0),
        mode: snapshot.mode,
        players: snapshot.players,
        bombs: snapshot.bombs,
        flames: snapshot.flames,
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
        ackedInputSeq: createSeatMap((playerId) => match.inputs[playerId].inputSeq ?? 0),
      },
    });
  }

  broadcastQuickMatchState() {
    const queued = this.countOpenQuickMatchRooms();
    for (const [clientId, websocket] of this.sockets.entries()) {
      this.send(websocket, {
        type: "quick-match-state",
        queued,
        searching: this.quickMatchPendingClients.has(clientId),
        countdownMs: null,
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
      title: "Quick Match",
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
   * @param {string} roomCode
   */
  scheduleMatchRestart(roomCode) {
    const room = this.rooms.get(roomCode);
    const match = this.matches.get(roomCode);
    if (!room || !match || room.status !== "playing" || match.restartTimer) {
      return;
    }

    this.appendRoomSystemMessage(room, `Match ended. Restarting in ${Math.round(MATCH_RESTART_DELAY_MS / 1000)}s.`);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();

    match.restartTimer = setTimeout(() => {
      const activeRoom = this.rooms.get(roomCode);
      const activeMatch = this.matches.get(roomCode);
      if (!activeRoom || !activeMatch || activeRoom.status !== "playing") {
        if (activeMatch) {
          activeMatch.restartTimer = null;
        }
        return;
      }

      const snapshot = activeMatch.game.exportOnlineSnapshot();
      if (snapshot.mode !== "match-result" || !snapshot.matchWinner) {
        activeMatch.restartTimer = null;
        return;
      }

      activeMatch.restartTimer = null;
      this.sendMatchStarted(activeRoom, activeMatch.activePlayerIds, activeMatch.characterSelections);
      this.startRoomMatch(activeRoom, activeMatch.activePlayerIds, activeMatch.characterSelections);
      this.broadcastLobbyToMembers(activeRoom);
      this.broadcastLobbyList();
    }, MATCH_RESTART_DELAY_MS);
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
  return normalized ? normalized.slice(0, 36) : "Open Arena";
}

function normalizeCharacterIndex(rawCharacterIndex, fallback) {
  const value = Number(rawCharacterIndex);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createNeutralInput() {
  return {
    direction: null,
    bombPressed: false,
    detonatePressed: false,
    inputSeq: 0,
    sentAtMs: 0,
  };
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
      characterRoster: [],
    },
  );
}
