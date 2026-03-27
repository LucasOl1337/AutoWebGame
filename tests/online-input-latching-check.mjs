const { mergeSequencedOnlineInputState } = await import("../output/esm/online/input-latch.js");

const neutral = {
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  inputSeq: 0,
  sentAtMs: 0,
};

const pressed = mergeSequencedOnlineInputState(neutral, {
  direction: "right",
  bombPressed: true,
  detonatePressed: false,
  skillPressed: false,
  inputSeq: 10,
  sentAtMs: 1000,
});

const overwrittenByFalseSameTick = mergeSequencedOnlineInputState(pressed, {
  direction: "right",
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  inputSeq: 11,
  sentAtMs: 1016,
});

const stalePacketIgnored = mergeSequencedOnlineInputState(overwrittenByFalseSameTick, {
  direction: "left",
  bombPressed: true,
  detonatePressed: true,
  skillPressed: true,
  inputSeq: 9,
  sentAtMs: 900,
});

const pass = pressed.bombPressed === true
  && overwrittenByFalseSameTick.bombPressed === true
  && overwrittenByFalseSameTick.inputSeq === 11
  && overwrittenByFalseSameTick.direction === "right"
  && stalePacketIgnored.inputSeq === overwrittenByFalseSameTick.inputSeq
  && stalePacketIgnored.direction === overwrittenByFalseSameTick.direction
  && stalePacketIgnored.bombPressed === overwrittenByFalseSameTick.bombPressed
  && stalePacketIgnored.detonatePressed === overwrittenByFalseSameTick.detonatePressed
  && stalePacketIgnored.skillPressed === overwrittenByFalseSameTick.skillPressed;

console.log(JSON.stringify({
  pressed,
  overwrittenByFalseSameTick,
  stalePacketIgnored,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
