import { DurableObject } from "cloudflare:workers";
import { GameApp } from "../src/app/game-app";

const STATE_VERSION = 3;
const MATCH_TICK_MS = 1000 / 60;
const FULL_SNAPSHOT_EVERY_TICKS = 6;

/**
 * @typedef {{
 *   roomCode: string;
 *   title: string;
 *   status: "open" | "playing";
 *   createdAt: number;
  *   hostClientId: string | null;
 *   clients: Set<string>;
 *   chat: ChatEntry[];
 *   seats: {
 *     1: LobbySeat;
 *     2: LobbySeat;
 *   };
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
  /** @type {string[]} */
  quickMatchQueue = [];
  /** @type {Map<string, { game: GameApp, inputs: { 1: import("../src/online/protocol").OnlineInputState, 2: import("../src/online/protocol").OnlineInputState }, timer: ReturnType<typeof setInterval> | null, tick: number }>} */
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
            seats: {
              1: { ...room.seats[1], ready: false },
              2: { ...room.seats[2], ready: false },
            },
          },
        ]),
      );

      for (const websocket of this.ctx.getWebSockets()) {
        const attachment = websocket.deserializeAttachment();
        if (attachment && typeof attachment === "object" && typeof attachment.clientId === "string") {
          this.sockets.set(attachment.clientId, websocket);
        }
      }
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
      quickMatchQueued: this.quickMatchQueue.length,
      searchingQuickMatch: this.quickMatchQueue.includes(clientId),
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
        await this.handleClaimSeat(clientId, payload.seat);
        break;
      case "set-character":
        await this.handleSetCharacter(clientId, payload.characterIndex);
        break;
      case "set-ready":
        await this.handleSetReady(clientId, payload.ready);
        break;
      case "quick-match":
        await this.handleQuickMatch(clientId);
        break;
      case "quick-match-cancel":
        this.removeFromQuickMatchQueue(clientId);
        this.broadcastQuickMatchState();
        break;
      case "chat-send":
        await this.handleChatSend(clientId, payload.body);
        break;
      case "guest-input":
        this.capturePlayerInput(clientId, payload.input);
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
    this.removeFromQuickMatchQueue(clientId);
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
      seats: {
        1: createEmptySeat(),
        2: createEmptySeat(),
      },
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
    this.removeFromQuickMatchQueue(clientId);
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendToClient(clientId, { type: "error", message: "Lobby not found." });
      return;
    }

    const alreadySeated = room.seats[1].clientId === clientId || room.seats[2].clientId === clientId;
    const seatsFull = Boolean(room.seats[1].clientId && room.seats[2].clientId);
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
    this.removeFromQuickMatchQueue(clientId);
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
   */
  async handleClaimSeat(clientId, rawSeat) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "open") {
      return;
    }

    const seat = rawSeat === 1 || rawSeat === 2 ? rawSeat : null;
    if (!seat) {
      return;
    }

    const targetSeat = room.seats[seat];
    if (targetSeat.clientId && targetSeat.clientId !== clientId) {
      this.sendToClient(clientId, { type: "error", message: "That slot is already locked by another player." });
      return;
    }

    for (const seatId of [1, 2]) {
      if (room.seats[seatId].clientId === clientId && seatId !== seat) {
        room.seats[seatId] = createEmptySeat();
      }
    }

    this.assignSeat(room, seat, clientId);
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
      this.sendToClient(clientId, { type: "error", message: "Pick P1 or P2 before choosing a character." });
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
   */
  async handleQuickMatch(clientId) {
    const activeRoom = this.findRoomForClient(clientId);
    if (activeRoom) {
      await this.releaseClientFromRoom(activeRoom, clientId);
      this.sendToClient(clientId, { type: "lobby-left" });
    }

    if (this.quickMatchQueue.includes(clientId)) {
      this.broadcastQuickMatchState();
      return;
    }

    const opponentId = this.quickMatchQueue.find((queuedClientId) => queuedClientId !== clientId && this.sockets.has(queuedClientId)) ?? null;
    if (!opponentId) {
      this.quickMatchQueue.push(clientId);
      this.broadcastQuickMatchState();
      this.sendToClient(clientId, { type: "error", message: "Searching for a quick match..." });
      return;
    }

    this.removeFromQuickMatchQueue(opponentId);
    this.removeFromQuickMatchQueue(clientId);

    const roomCode = this.createRoomCode();
    const room = {
      roomCode,
      title: "Quick Match",
      createdAt: Date.now(),
      status: "open",
      hostClientId: null,
      clients: new Set([opponentId, clientId]),
      chat: [],
      seats: {
        1: createEmptySeat(),
        2: createEmptySeat(),
      },
    };

    this.assignSeat(room, 1, opponentId);
    this.assignSeat(room, 2, clientId);
    room.seats[1].ready = true;
    room.seats[2].ready = true;
    this.rooms.set(roomCode, room);
    this.appendRoomSystemMessage(room, "Quick match found. Arena sync locked.");
    await this.persistState();
    this.sendJoinedLobby(opponentId, room);
    this.sendJoinedLobby(clientId, room);
    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
    this.broadcastQuickMatchState();
    await this.maybeStartMatch(room);
  }

  /**
   * @param {string} clientId
   * @param {unknown} rawBody
   */
  async handleChatSend(clientId, rawBody) {
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

    const p1 = room.seats[1];
    const p2 = room.seats[2];
    if (!p1.clientId || !p2.clientId || !p1.ready || !p2.ready) {
      return;
    }

    room.clients = new Set([p1.clientId, p2.clientId]);
    room.hostClientId = p1.clientId;

    room.status = "playing";
    this.refreshSeatLabels(room);

    const hostSeat = 1;
    const guestSeat = hostSeat === 1 ? 2 : 1;
    const hostClientId = room.hostClientId;
    const guestClientId = room.seats[guestSeat].clientId;
    if (!guestClientId) {
      room.status = "open";
      await this.persistState();
      return;
    }

    const characterSelections = {
      1: room.seats[1].characterIndex,
      2: room.seats[2].characterIndex,
    };

    await this.persistState();

    this.sendToClient(p1.clientId, {
      type: "match-started",
      config: {
        roomCode: room.roomCode,
        role: "guest",
        localPlayerId: 1,
        remotePlayerId: 2,
        characterSelections,
      },
    });

    this.sendToClient(guestClientId, {
      type: "match-started",
      config: {
        roomCode: room.roomCode,
        role: "guest",
        localPlayerId: 2,
        remotePlayerId: 1,
        characterSelections,
      },
    });

    this.startRoomMatch(room, characterSelections);
    this.appendRoomSystemMessage(room, "Match started. Good luck.");
    await this.persistState();

    this.broadcastLobbyToMembers(room);
    this.broadcastLobbyList();
  }

  /**
   * @param {string} clientId
   * @param {unknown} payload
   */
  capturePlayerInput(clientId, input) {
    const room = this.findRoomForClient(clientId);
    if (!room || room.status !== "playing") {
      return;
    }

    const seat = this.findSeatForClient(room, clientId);
    const match = this.matches.get(room.roomCode);
    if (!seat || !match) {
      return;
    }

    match.inputs[seat] = {
      direction: input?.direction ?? null,
      bombPressed: Boolean(input?.bombPressed),
      detonatePressed: Boolean(input?.detonatePressed),
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
    this.removeFromQuickMatchQueue(clientId);
    const room = this.findRoomForClient(clientId);
    if (room) {
      await this.releaseClientFromRoom(room, clientId);
      this.broadcastLobbyList();
    }
    this.broadcastQuickMatchState();
  }

  /**
   * @param {LobbyRoom} room
   * @param {string} clientId
   */
  async releaseClientFromRoom(room, clientId) {
    room.clients.delete(clientId);

    for (const seatId of [1, 2]) {
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
      room.seats[1].ready = false;
      room.seats[2].ready = false;
      this.refreshSeatLabels(room);
      this.appendRoomSystemMessage(room, "A pilot left the match. Room reopened.");
      this.broadcastToRoom(room, { type: "peer-left" });
    } else {
      this.refreshSeatLabels(room);
      this.broadcastLobbyToMembers(room);
    }

    if (!room.seats[1].clientId && !room.seats[2].clientId) {
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
    const lobbies = this.buildLobbyList();
    for (const websocket of this.sockets.values()) {
      this.send(websocket, { type: "lobby-list", lobbies });
    }
  }

  buildLobbyList() {
    return Array.from(this.rooms.values())
      .map((room) => this.serializeLobbySummary(room))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "open" ? -1 : 1;
        }
        return a.createdAt - b.createdAt;
      });
  }

  /**
   * @param {LobbyRoom} room
   */
  serializeLobbySummary(room) {
    const seats = {
      1: { ...room.seats[1] },
      2: { ...room.seats[2] },
    };

    return {
      roomCode: room.roomCode,
      title: room.title,
      status: room.status,
      createdAt: room.createdAt,
      seats,
      occupantCount: Number(Boolean(seats[1].clientId)) + Number(Boolean(seats[2].clientId)),
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
   * @returns {1 | 2 | null}
   */
  findSeatForClient(room, clientId) {
    if (room.seats[1].clientId === clientId) {
      return 1;
    }
    if (room.seats[2].clientId === clientId) {
      return 2;
    }
    return null;
  }

  /**
   * @param {LobbyRoom} room
   * @param {1 | 2} seat
   * @param {string} clientId
   */
  assignSeat(room, seat, clientId) {
    room.seats[seat] = {
      clientId,
      displayName: `Pilot ${seat}`,
      characterIndex: room.seats[seat].characterIndex ?? seat - 1,
      ready: false,
    };
  }

  /**
   * @param {LobbyRoom} room
   */
  refreshSeatLabels(room) {
    for (const seatId of [1, 2]) {
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
      if (room.clients.has(clientId) || room.seats[1].clientId === clientId || room.seats[2].clientId === clientId) {
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
        seats: {
          1: room.seats[1],
          2: room.seats[2],
        },
      })),
    });
  }

  /**
   * @param {LobbyRoom} room
   * @param {Record<1 | 2, number>} characterSelections
   */
  startRoomMatch(room, characterSelections) {
    this.stopRoomMatch(room.roomCode);
    const game = createServerGame();
    game.startServerAuthoritativeMatch(characterSelections);
    const match = {
      game,
      inputs: {
        1: createNeutralInput(),
        2: createNeutralInput(),
      },
      timer: null,
      tick: 0,
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

    match.game.setServerPlayerInput(1, match.inputs[1]);
    match.game.setServerPlayerInput(2, match.inputs[2]);
    match.game.advanceServerSimulation(MATCH_TICK_MS);
    match.tick += 1;
    this.broadcastFrame(roomCode);
    if (match.tick % FULL_SNAPSHOT_EVERY_TICKS === 0) {
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
      return;
    }
    const snapshot = match.game.exportOnlineSnapshot();
    this.broadcastToRoom(room, {
      type: "host-frame",
      frame: {
        mode: snapshot.mode,
        players: snapshot.players,
        bombs: snapshot.bombs,
        flames: snapshot.flames,
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
      },
    });
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
      snapshot,
    });
  }

  broadcastQuickMatchState() {
    const queued = this.quickMatchQueue.length;
    for (const [clientId, websocket] of this.sockets.entries()) {
      this.send(websocket, {
        type: "quick-match-state",
        queued,
        searching: this.quickMatchQueue.includes(clientId),
      });
    }
  }

  /**
   * @param {string} clientId
   */
  removeFromQuickMatchQueue(clientId) {
    this.quickMatchQueue = this.quickMatchQueue.filter((queuedClientId) => queuedClientId !== clientId);
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

function normalizeRoomCode(roomCode) {
  return String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizeLobbyTitle(title) {
  const normalized = String(title || "").trim();
  return normalized ? normalized.slice(0, 36) : "Open Arena";
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createNeutralInput() {
  return {
    direction: null,
    bombPressed: false,
    detonatePressed: false,
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
