import assert from "node:assert/strict";

const sockets = [];
const scheduledTimers = [];

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
    sockets.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, data) {
    this.listeners.get(type)?.(data);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }
}

globalThis.WebSocket = FakeWebSocket;
globalThis.window = {
  location: {
    protocol: "https:",
    host: "game.example.test",
    hostname: "game.example.test",
    port: "",
  },
  clearTimeout() {},
  setTimeout(callback, delayMs) {
    scheduledTimers.push({ callback, delayMs });
    return scheduledTimers.length;
  },
};

const { OnlineSessionClient } = await import("../output/esm/NetCode/session-client.js");

function createClient() {
  const client = Object.create(OnlineSessionClient.prototype);
  Object.assign(client, {
    socket: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    realtimeReady: false,
    language: "en",
    currentLobby: null,
    role: null,
    roomCode: null,
    pendingAutoJoinRoom: null,
    currentSessionState: null,
    quickMatchSearching: false,
    endlessMatchStarting: false,
    reconnectingForAccountRefresh: false,
    app: { detachOnlineSession() {} },
    renderAll() {},
    setStatus() {},
  });
  return client;
}

const reconnectingClient = createClient();
reconnectingClient.connect();
const disconnectedSocket = sockets[0];
assert.ok(disconnectedSocket, "initial connection should create a socket");
disconnectedSocket.readyState = FakeWebSocket.OPEN;
disconnectedSocket.emit("open");

reconnectingClient.currentLobby = { roomCode: "ROOM42" };
reconnectingClient.roomCode = "ROOM42";
reconnectingClient.role = "guest";

disconnectedSocket.readyState = FakeWebSocket.CLOSED;
disconnectedSocket.emit("close");

assert.equal(
  reconnectingClient.pendingAutoJoinRoom,
  "ROOM42",
  "a transient close must retain the active room for the next hello handshake",
);
assert.equal(scheduledTimers.length, 1, "a transient close should schedule one reconnect");

scheduledTimers.shift().callback();
const replacementSocket = sockets[1];
assert.ok(replacementSocket, "the reconnect timer should create a replacement socket");
replacementSocket.readyState = FakeWebSocket.OPEN;
replacementSocket.emit("open");
replacementSocket.emit("message", {
  data: JSON.stringify({
    type: "hello",
    clientId: "replacement-client",
    account: null,
    sessionState: null,
    lobbies: [],
    onlineUsers: 1,
    onlinePlayers: [],
    quickMatchQueued: 0,
  }),
});

assert.deepEqual(
  replacementSocket.sent,
  [{ type: "join-lobby", roomCode: "ROOM42" }],
  "the replacement connection should automatically rejoin the interrupted room",
);

const staleEventClient = createClient();
staleEventClient.connect();
const staleSocket = sockets[2];
staleSocket.readyState = FakeWebSocket.CLOSED;
staleEventClient.refreshConnectionForAccountChange();
const currentSocket = sockets[3];
currentSocket.readyState = FakeWebSocket.OPEN;
currentSocket.emit("open");
staleEventClient.handleMessage = () => {
  throw new Error("a stale socket message reached the active session");
};
staleEventClient.reconnectAttempts = 7;
staleSocket.emit("open");
staleSocket.emit("message", { data: "stale" });
staleSocket.emit("error");
staleSocket.emit("close");

assert.equal(
  staleEventClient.reconnectAttempts,
  7,
  "a late open event from a stale socket must not reset active reconnect state",
);
assert.equal(
  staleEventClient.socket,
  currentSocket,
  "a late close event from a stale socket must not clear the replacement socket",
);
assert.equal(
  staleEventClient.realtimeReady,
  true,
  "a late close event from a stale socket must not mark the replacement connection offline",
);

console.log(JSON.stringify({
  pass: true,
  socketsCreated: sockets.length,
  roomRejoined: replacementSocket.sent[0]?.roomCode ?? null,
}, null, 2));
