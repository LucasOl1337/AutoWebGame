const { shouldResetPlayingRoom } = await import("../output/esm/online/matchmaking.js");

const classicRoom = {
  roomCode: "CLASSIC1",
  roomMode: "classic",
  roomKind: "matchmaking",
  status: "playing",
};

const endlessRoom = {
  roomCode: "ENDLS1",
  roomMode: "endless",
  roomKind: "endless",
  status: "playing",
};

const classicSeatsWithQuit = {
  1: { clientId: "a", occupantType: "human" },
  2: { clientId: null, occupantType: "empty" },
  3: { clientId: null, occupantType: "empty" },
  4: { clientId: null, occupantType: "empty" },
};

const endlessSeatsSolo = {
  1: { clientId: "a", occupantType: "human" },
  2: { clientId: null, occupantType: "bot" },
  3: { clientId: null, occupantType: "bot" },
  4: { clientId: null, occupantType: "bot" },
};

const endlessSeatsCorrupted = {
  1: { clientId: "a", occupantType: "human" },
  2: { clientId: null, occupantType: "empty" },
  3: { clientId: null, occupantType: "bot" },
  4: { clientId: null, occupantType: "bot" },
};

const classicShouldReset = shouldResetPlayingRoom(classicRoom, classicSeatsWithQuit, [1, 2]);
const endlessSoloShouldStayLive = shouldResetPlayingRoom(endlessRoom, endlessSeatsSolo, [1, 2, 3, 4]);
const endlessCorruptedShouldReset = shouldResetPlayingRoom(endlessRoom, endlessSeatsCorrupted, [1, 2, 3, 4]);

const pass = classicShouldReset
  && !endlessSoloShouldStayLive
  && endlessCorruptedShouldReset;

console.log(JSON.stringify({
  classicShouldReset,
  endlessSoloShouldStayLive,
  endlessCorruptedShouldReset,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
