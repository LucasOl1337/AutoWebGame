const { canSendLobbyAction } = await import("../output/esm/NetCode/session-client.js");

const WEBSOCKET_CONNECTING = 0;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CLOSING = 2;
const WEBSOCKET_CLOSED = 3;

const cases = [
  { name: "ready and open", realtimeReady: true, readyState: WEBSOCKET_OPEN, expected: true },
  { name: "ready but connecting", realtimeReady: true, readyState: WEBSOCKET_CONNECTING, expected: false },
  { name: "ready but closing", realtimeReady: true, readyState: WEBSOCKET_CLOSING, expected: false },
  { name: "ready but closed", realtimeReady: true, readyState: WEBSOCKET_CLOSED, expected: false },
  { name: "open socket but not realtime ready", realtimeReady: false, readyState: WEBSOCKET_OPEN, expected: false },
  { name: "missing socket", realtimeReady: true, readyState: null, expected: false },
];

const results = cases.map((entry) => ({
  ...entry,
  actual: canSendLobbyAction(entry.realtimeReady, entry.readyState),
}));

const pass = results.every((entry) => entry.actual === entry.expected);

console.log(JSON.stringify({ results, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
