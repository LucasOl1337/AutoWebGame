const { mergeSequencedOnlineInputState } = await import("../output/esm/NetCode/input-latch.js");

const neutral = {
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
  inputSeq: 0,
  sentAtMs: 0,
};

const pressed = mergeSequencedOnlineInputState(neutral, {
  direction: "right",
  bombPressed: true,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: true,
  inputSeq: 10,
  sentAtMs: 1000,
});

const overwrittenByFalseSameTick = mergeSequencedOnlineInputState(pressed, {
  direction: "right",
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
  inputSeq: 11,
  sentAtMs: 1016,
});

const stalePacketIgnored = mergeSequencedOnlineInputState(overwrittenByFalseSameTick, {
  direction: "left",
  bombPressed: true,
  detonatePressed: true,
  skillPressed: true,
  skillHeld: true,
  inputSeq: 9,
  sentAtMs: 900,
});

const pass = pressed.bombPressed === true
  && overwrittenByFalseSameTick.bombPressed === true
  && pressed.skillHeld === true
  && overwrittenByFalseSameTick.skillHeld === false
  && overwrittenByFalseSameTick.inputSeq === 11
  && overwrittenByFalseSameTick.direction === "right"
  && stalePacketIgnored.inputSeq === overwrittenByFalseSameTick.inputSeq
  && stalePacketIgnored.direction === overwrittenByFalseSameTick.direction
  && stalePacketIgnored.bombPressed === overwrittenByFalseSameTick.bombPressed
  && stalePacketIgnored.detonatePressed === overwrittenByFalseSameTick.detonatePressed
  && stalePacketIgnored.skillPressed === overwrittenByFalseSameTick.skillPressed
  && stalePacketIgnored.skillHeld === overwrittenByFalseSameTick.skillHeld;

console.log(JSON.stringify({
  pressed,
  overwrittenByFalseSameTick,
  stalePacketIgnored,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
