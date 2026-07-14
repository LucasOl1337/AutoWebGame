const {
  createIdleSessionState,
  resolveOnlineSessionState,
  isManualLobbyVisible,
  isQuickMatchCandidate,
  canReuseCurrentRoomForQuickMatch,
  shouldResetPlayingRoom,
} = await import("../output/esm/NetCode/matchmaking.js");

const manualRoom = {
  roomCode: "MANUAL",
  roomMode: "classic",
  roomKind: "manual",
  status: "open",
};

const quickRoom = {
  roomCode: "QUICK1",
  roomMode: "classic",
  roomKind: "matchmaking",
  status: "open",
};

const endlessRoom = {
  roomCode: "ENDLS1",
  roomMode: "endless",
  roomKind: "endless",
  status: "playing",
};

const idle = createIdleSessionState();
const queueClassic = resolveOnlineSessionState("queue_classic", null, false);
const queueEndless = resolveOnlineSessionState("queue_endless", null, false);
const manualLobby = resolveOnlineSessionState("manual", manualRoom, false);
const quickLobby = resolveOnlineSessionState("queue_classic", quickRoom, false);
const classicMatch = resolveOnlineSessionState("queue_classic", quickRoom, true);
const endlessMatch = resolveOnlineSessionState("queue_endless", endlessRoom, true);
const endlessSeats = {
  1: { clientId: "pilot-a", occupantType: "human" },
  2: { clientId: null, occupantType: "bot" },
  3: { clientId: null, occupantType: "bot" },
  4: { clientId: null, occupantType: "bot" },
};
const endlessMissingActiveSeat = {
  ...endlessSeats,
  4: undefined,
};

const pass = idle.kind === "idle"
  && queueClassic.kind === "queueing-classic"
  && queueEndless.kind === "queueing-endless"
  && manualLobby.kind === "in-manual-lobby"
  && quickLobby.kind === "in-matchmaking-lobby"
  && classicMatch.kind === "in-classic-match"
  && endlessMatch.kind === "in-endless-match"
  && isManualLobbyVisible(manualRoom)
  && !isManualLobbyVisible(quickRoom)
  && isQuickMatchCandidate(quickRoom)
  && !isQuickMatchCandidate(manualRoom)
  && canReuseCurrentRoomForQuickMatch(quickRoom)
  && !canReuseCurrentRoomForQuickMatch(manualRoom)
  && !shouldResetPlayingRoom(endlessRoom, endlessSeats, [1, 2, 3, 4])
  && shouldResetPlayingRoom(endlessRoom, endlessMissingActiveSeat, [1, 2, 3, 4]);

console.log(JSON.stringify({
  idle,
  queueClassic,
  queueEndless,
  manualLobby,
  quickLobby,
  classicMatch,
  endlessMatch,
  endlessMissingActiveSeatShouldReset: shouldResetPlayingRoom(
    endlessRoom,
    endlessMissingActiveSeat,
    [1, 2, 3, 4],
  ),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
