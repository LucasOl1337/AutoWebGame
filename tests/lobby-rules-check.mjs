const { getLobbySeatSnapshot } = await import("../output/esm/NetCode/lobby-rules.js");

const createSeats = (filled = []) => ({
  1: { clientId: filled[0]?.id ?? null, ready: filled[0]?.ready ?? false },
  2: { clientId: filled[1]?.id ?? null, ready: filled[1]?.ready ?? false },
  3: { clientId: filled[2]?.id ?? null, ready: filled[2]?.ready ?? false },
  4: { clientId: filled[3]?.id ?? null, ready: filled[3]?.ready ?? false },
});

const fullReady = getLobbySeatSnapshot(createSeats([
  { id: "a", ready: true },
  { id: "b", ready: true },
  { id: "c", ready: true },
  { id: "d", ready: true },
]));

const duoReady = getLobbySeatSnapshot(createSeats([
  { id: "a", ready: true },
  { id: "b", ready: true },
]));

const trioMixed = getLobbySeatSnapshot(createSeats([
  { id: "a", ready: true },
  { id: "b", ready: false },
  { id: "c", ready: true },
]));

const soloReady = getLobbySeatSnapshot(createSeats([
  { id: "a", ready: true },
]));

const pass = fullReady.canAutoStart
  && !fullReady.canForceStart
  && duoReady.canForceStart
  && !duoReady.canAutoStart
  && !trioMixed.canAutoStart
  && !trioMixed.canForceStart
  && soloReady.occupantCount === 1
  && !soloReady.minimumPlayersMet;

console.log(JSON.stringify({
  fullReady,
  duoReady,
  trioMixed,
  soloReady,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
