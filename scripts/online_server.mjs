import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const rooms = new Map();
const clients = new Map();
const websocketServer = new WebSocketServer({ noServer: true });

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  try {
    const filePath = await resolveAssetPath(url.pathname);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=300",
      "content-type": mimeTypes.get(extension) || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/online") {
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    attachClient(websocket);
  });
});

server.listen(port, () => {
  console.log(`Online server listening on http://127.0.0.1:${port}`);
});

async function resolveAssetPath(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = path.join(distDir, normalizedPath.replace(/^\/+/, ""));
  const safePath = path.resolve(requestedPath);
  if (!safePath.startsWith(distDir)) {
    throw new Error("unsafe path");
  }

  if (existsSync(safePath)) {
    const info = await stat(safePath);
    if (info.isFile()) {
      return safePath;
    }
  }

  return path.join(distDir, "index.html");
}

function attachClient(websocket) {
  const clientId = createId("cli");
  const client = {
    id: clientId,
    ws: websocket,
    lobbyCode: null,
  };
  clients.set(clientId, client);

  send(websocket, { type: "hello", clientId, lobbies: buildLobbyList() });

  websocket.on("message", (payload) => {
    let message;
    try {
      message = JSON.parse(String(payload));
    } catch {
      return;
    }

    switch (message.type) {
      case "create-lobby":
        handleCreateLobby(client, message.title);
        break;
      case "join-lobby":
        handleJoinLobby(client, message.roomCode);
        break;
      case "leave-lobby":
        handleLeaveLobby(client);
        break;
      case "claim-seat":
        handleClaimSeat(client, message.seat);
        break;
      case "set-character":
        handleSetCharacter(client, message.characterIndex);
        break;
      case "set-ready":
        handleSetReady(client, message.ready);
        break;
      case "guest-input":
        relayGuestInput(client, message);
        break;
      case "host-snapshot":
        relayHostSnapshot(client, message);
        break;
      default:
        break;
    }
  });

  websocket.on("close", () => {
    handleDisconnect(client);
  });
}

function handleCreateLobby(client, rawTitle) {
  if (client.lobbyCode) {
    handleLeaveLobby(client);
  }

  const roomCode = createRoomCode();
  const title = normalizeLobbyTitle(rawTitle);
  const room = {
    roomCode,
    title,
    createdAt: Date.now(),
    status: "open",
    hostClientId: client.id,
    clients: new Set([client.id]),
    seats: {
      1: createEmptySeat(),
      2: createEmptySeat(),
    },
  };

  rooms.set(roomCode, room);
  client.lobbyCode = roomCode;
  assignSeat(room, 1, client.id);
  sendJoinedLobby(client, room);
  broadcastLobbyList();
}

function handleJoinLobby(client, rawRoomCode) {
  const roomCode = normalizeRoomCode(rawRoomCode);
  const room = rooms.get(roomCode);
  if (!room) {
    send(client.ws, { type: "error", message: "Lobby not found." });
    return;
  }

  if (client.lobbyCode && client.lobbyCode !== roomCode) {
    handleLeaveLobby(client);
  }

  client.lobbyCode = roomCode;
  room.clients.add(client.id);
  sendJoinedLobby(client, room);
  broadcastLobbyToMembers(room);
  broadcastLobbyList();
}

function handleLeaveLobby(client) {
  const room = getRoomForClient(client);
  if (!room) {
    send(client.ws, { type: "lobby-left" });
    return;
  }

  releaseClientFromRoom(room, client.id);
  client.lobbyCode = null;
  send(client.ws, { type: "lobby-left" });
  broadcastLobbyList();
}

function handleClaimSeat(client, seat) {
  const room = getRoomForClient(client);
  if (!room || room.status !== "open") {
    return;
  }

  if (seat !== 1 && seat !== 2) {
    return;
  }

  const targetSeat = room.seats[seat];
  if (targetSeat.clientId && targetSeat.clientId !== client.id) {
    send(client.ws, { type: "error", message: "That slot is already locked by another player." });
    return;
  }

  for (const existingSeat of [1, 2]) {
    if (room.seats[existingSeat].clientId === client.id && existingSeat !== seat) {
      room.seats[existingSeat] = createEmptySeat();
    }
  }

  assignSeat(room, seat, client.id);
  broadcastLobbyToMembers(room);
  broadcastLobbyList();
}

function handleSetCharacter(client, characterIndex) {
  const room = getRoomForClient(client);
  if (!room || room.status !== "open") {
    return;
  }

  const seat = findSeatForClient(room, client.id);
  if (!seat) {
    send(client.ws, { type: "error", message: "Pick P1 or P2 before choosing a character." });
    return;
  }

  room.seats[seat].characterIndex = Math.max(0, Number(characterIndex) || 0);
  room.seats[seat].ready = false;
  broadcastLobbyToMembers(room);
  broadcastLobbyList();
}

function handleSetReady(client, ready) {
  const room = getRoomForClient(client);
  if (!room || room.status !== "open") {
    return;
  }

  const seat = findSeatForClient(room, client.id);
  if (!seat) {
    send(client.ws, { type: "error", message: "Claim a slot before locking ready." });
    return;
  }

  room.seats[seat].ready = Boolean(ready);
  broadcastLobbyToMembers(room);
  broadcastLobbyList();
  maybeStartMatch(room);
}

function maybeStartMatch(room) {
  if (room.status !== "open") {
    return;
  }

  const p1 = room.seats[1];
  const p2 = room.seats[2];
  if (!p1.clientId || !p2.clientId || !p1.ready || !p2.ready) {
    return;
  }

  room.status = "playing";
  const hostSeat = room.hostClientId === p1.clientId ? 1 : 2;
  const guestSeat = hostSeat === 1 ? 2 : 1;
  const characterSelections = {
    1: room.seats[1].characterIndex,
    2: room.seats[2].characterIndex,
  };

  const hostClient = clients.get(room.hostClientId);
  const guestClient = clients.get(room.seats[guestSeat].clientId);
  if (!hostClient || !guestClient) {
    return;
  }

  send(hostClient.ws, {
    type: "match-started",
    config: {
      roomCode: room.roomCode,
      role: "host",
      localPlayerId: hostSeat,
      remotePlayerId: guestSeat,
      characterSelections,
    },
  });
  send(guestClient.ws, {
    type: "match-started",
    config: {
      roomCode: room.roomCode,
      role: "guest",
      localPlayerId: guestSeat,
      remotePlayerId: hostSeat,
      characterSelections,
    },
  });

  broadcastLobbyToMembers(room);
  broadcastLobbyList();
}

function relayGuestInput(client, message) {
  const room = getRoomForClient(client);
  if (!room || room.status !== "playing") {
    return;
  }

  const hostClient = clients.get(room.hostClientId);
  if (!hostClient || hostClient.id === client.id || hostClient.ws.readyState !== 1) {
    return;
  }

  send(hostClient.ws, message);
}

function relayHostSnapshot(client, message) {
  const room = getRoomForClient(client);
  if (!room || room.status !== "playing" || room.hostClientId !== client.id) {
    return;
  }

  for (const memberId of room.clients) {
    if (memberId === client.id) {
      continue;
    }
    const member = clients.get(memberId);
    if (member?.ws.readyState === 1) {
      send(member.ws, message);
    }
  }
}

function handleDisconnect(client) {
  const room = getRoomForClient(client);
  if (room) {
    releaseClientFromRoom(room, client.id);
    broadcastLobbyList();
  }
  clients.delete(client.id);
}

function releaseClientFromRoom(room, clientId) {
  room.clients.delete(clientId);

  for (const seat of [1, 2]) {
    if (room.seats[seat].clientId === clientId) {
      room.seats[seat] = createEmptySeat();
    }
  }

  if (room.hostClientId === clientId) {
    const replacementClientId = room.seats[1].clientId || room.seats[2].clientId || null;
    room.hostClientId = replacementClientId;
  }

  if (room.status === "playing") {
    room.status = "open";
    for (const seat of [1, 2]) {
      room.seats[seat].ready = false;
    }
    broadcastToRoom(room, { type: "peer-left" });
  } else {
    broadcastLobbyToMembers(room);
  }

  if (!room.hostClientId && room.occupantCount === undefined) {
    // no-op safeguard for older payload shape
  }

  if (room.seats[1].clientId === null && room.seats[2].clientId === null) {
    for (const memberId of room.clients) {
      const member = clients.get(memberId);
      if (member) {
        member.lobbyCode = null;
        send(member.ws, { type: "lobby-left" });
      }
    }
    rooms.delete(room.roomCode);
    return;
  }

  for (const memberId of room.clients) {
    const member = clients.get(memberId);
    if (member) {
      member.lobbyCode = room.roomCode;
    }
  }
}

function broadcastLobbyToMembers(room) {
  for (const clientId of room.clients) {
    const client = clients.get(clientId);
    if (!client || client.ws.readyState !== 1) {
      continue;
    }
    send(client.ws, {
      type: "lobby-updated",
      lobby: serializeLobbyForClient(room, client.id),
    });
  }
}

function sendJoinedLobby(client, room) {
  send(client.ws, {
    type: "lobby-joined",
    role: client.id === room.hostClientId ? "host" : "guest",
    lobby: serializeLobbyForClient(room, client.id),
  });
}

function broadcastLobbyList() {
  const lobbies = buildLobbyList();
  for (const client of clients.values()) {
    if (client.ws.readyState === 1) {
      send(client.ws, { type: "lobby-list", lobbies });
    }
  }
}

function buildLobbyList() {
  return Array.from(rooms.values())
    .map((room) => serializeLobbySummary(room))
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "open" ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });
}

function serializeLobbySummary(room) {
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

function serializeLobbyForClient(room, clientId) {
  const summary = serializeLobbySummary(room);
  return {
    ...summary,
    selfClientId: clientId,
    selfSeat: findSeatForClient(room, clientId),
    isHost: room.hostClientId === clientId,
  };
}

function findSeatForClient(room, clientId) {
  if (room.seats[1].clientId === clientId) {
    return 1;
  }
  if (room.seats[2].clientId === clientId) {
    return 2;
  }
  return null;
}

function assignSeat(room, seat, clientId) {
  room.seats[seat] = {
    clientId,
    displayName: room.hostClientId === clientId ? "Host" : `Pilot ${seat}`,
    characterIndex: room.seats[seat].characterIndex ?? seat - 1,
    ready: false,
  };
}

function getRoomForClient(client) {
  return client.lobbyCode ? rooms.get(client.lobbyCode) ?? null : null;
}

function broadcastToRoom(room, payload) {
  for (const clientId of room.clients) {
    const client = clients.get(clientId);
    if (client?.ws.readyState === 1) {
      send(client.ws, payload);
    }
  }
}

function send(websocket, payload) {
  if (websocket.readyState === 1) {
    websocket.send(JSON.stringify(payload));
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
  if (!normalized) {
    return "Open Arena";
  }
  return normalized.slice(0, 36);
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
