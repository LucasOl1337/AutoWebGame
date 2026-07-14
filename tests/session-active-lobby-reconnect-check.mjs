import { readFile } from "node:fs/promises";

const { resolveReconnectRoomCode } = await import("../output/esm/NetCode/session-client.js");

const cases = [
  {
    name: "prefers the active lobby snapshot",
    actual: resolveReconnectRoomCode("ROOM01", "STALE1", "PEND01"),
    expected: "ROOM01",
  },
  {
    name: "falls back to the public room code",
    actual: resolveReconnectRoomCode(null, "ROOM02", "PEND02"),
    expected: "ROOM02",
  },
  {
    name: "keeps an invite join pending through an early disconnect",
    actual: resolveReconnectRoomCode(null, null, "ROOM03"),
    expected: "ROOM03",
  },
  {
    name: "does not invent a room outside an online flow",
    actual: resolveReconnectRoomCode(null, null, null),
    expected: null,
  },
];

const source = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const closeHandlerStart = source.indexOf('socket.addEventListener("close"');
const closeHandlerEnd = source.indexOf("this.scheduleReconnect();", closeHandlerStart);
const closeHandler = source.slice(closeHandlerStart, closeHandlerEnd);
const helloHandlerStart = source.indexOf('case "hello":');
const helloHandlerEnd = source.indexOf('case "lobby-list":', helloHandlerStart);
const helloHandler = source.slice(helloHandlerStart, helloHandlerEnd);

const sourceChecks = {
  capturesRoomBeforeClearingSession: closeHandler.indexOf("const reconnectRoomCode = resolveReconnectRoomCode(")
    < closeHandler.indexOf("this.currentLobby = null;"),
  preservesRoomForNextConnection: closeHandler.includes("this.pendingAutoJoinRoom = reconnectRoomCode;"),
  allowsSeatClaimAfterRejoin: closeHandler.includes("this.autoClaimRoomCode = null;"),
  helloRejoinsPreservedRoom: helloHandler.includes('this.send({ type: "join-lobby", roomCode: this.pendingAutoJoinRoom });'),
  failedJoinStillStopsRetryLoop: source.includes('case "error":')
    && source.indexOf("this.pendingAutoJoinRoom = null;", source.indexOf('case "error":')) > 0,
};

const failedCases = cases.filter((entry) => entry.actual !== entry.expected);
const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedCases.length === 0 && failedSourceChecks.length === 0;

console.log(JSON.stringify({
  cases,
  sourceChecks,
  failedCases,
  failedSourceChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
