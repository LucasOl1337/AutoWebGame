import assert from "node:assert/strict";
import { ContinuousRoomSessionMachine } from "../output/esm/ContinuousRoom/continuous-room-session-machine.js";
import { renderContinuousRoomSession } from "../output/esm/ContinuousRoom/continuous-room-session-view.js";
import {
  FrontendKernel,
  InMemoryNavigationAdapter,
} from "../output/esm/FrontendKernel/frontend-kernel.js";
import { InMemoryIdentityAdapter } from "../output/esm/FrontendKernel/identity-adapter.js";
import {
  InMemorySelectionEntryAdapter,
  InMemorySelectionPreferenceStore,
} from "../output/esm/FrontendKernel/CharacterSelection/selection-adapters.js";

const roomId = "room_session_machine_opaque";
const baseRound = {status: "not-started", reproducibility: "pending", winnerPlayerId: null, reason: null, steps: 0, snapshots: [], receiptHash: null};
const authority = (overrides = {}) => ({
  protocol: "continuous-room.lifecycle.v1",
  operationId: "operation_session_machine_0001",
  sessionId: "session_session_machine_0001",
  serverRevision: 2,
  committed: true,
  state: "preparing",
  roomId,
  preparationDeadlineMs: 5_000,
  participants: [
    {playerId: 1, identityId: "human_opaque", displayName: "Dog", characterId: "ranni", kind: "human", profileId: "visitor"},
    {playerId: 2, identityId: "completer:nara", displayName: "Nara", characterId: "bee", kind: "completer", profileId: "nara"},
    {playerId: 3, identityId: "completer:bento", displayName: "Bento", characterId: "nico", kind: "completer", profileId: "bento"},
    {playerId: 4, identityId: "completer:luma", displayName: "Luma", characterId: "croc", kind: "completer", profileId: "luma"},
  ],
  acceptedInputSeq: 0,
  round: baseRound,
  ...overrides,
});
const resultSnapshot = authority({
  serverRevision: 5,
  state: "result",
  round: {
    status: "complete",
    reproducibility: "verified",
    winnerPlayerId: 2,
    reason: "elimination",
    steps: 4_257,
    snapshots: [
      {frame: 0, players: {1: {alive: true, x: 1, y: 1}, 2: {alive: true, x: 9, y: 1}, 3: {alive: true, x: 1, y: 7}, 4: {alive: true, x: 9, y: 7}}},
      {frame: 4_257, players: {1: {alive: false, x: 5, y: 4}, 2: {alive: true, x: 6, y: 4}, 3: {alive: false, x: 4, y: 4}, 4: {alive: false, x: 5, y: 5}}},
    ],
    receiptHash: `sha256:${"a".repeat(64)}`,
  },
});
let now = 0;
const calls = [];
const client = {
  async recover() { calls.push("recover"); return authority(); },
  async input(seq, input) { calls.push(["input", seq, input]); return authority({serverRevision: 3, acceptedInputSeq: seq}); },
  async observe() { calls.push("observe"); return resultSnapshot; },
  async leave() { calls.push("leave"); return authority({serverRevision: 7, state: "cancelled", roomId: null, participants: []}); },
};
const machine = new ContinuousRoomSessionMachine(roomId, client, {now: () => now});
await Promise.resolve(); await Promise.resolve();
assert.equal(machine.getSnapshot().status, "preparing");
assert.equal(machine.getSnapshot().authority.participants.length, 4);
machine.dispatch({type: "continuous-room-input", input: {direction: "right", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false}});
machine.dispatch({type: "continuous-room-input", input: {direction: null, bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false}});
for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
assert.deepEqual(calls.filter((call) => Array.isArray(call)).map((call) => call[1]), [1, 2], "rapid UI input is serialized into monotonic authoritative sequences");
now = 5_000;
const observing = machine["observe"]();
assert.equal(machine.getSnapshot().status, "round", "client renders Round while authoritative observation is in flight");
await observing;
assert.equal(machine.getSnapshot().status, "result");
assert.equal(machine.getSnapshot().authority.round.reproducibility, "verified");
const html = renderContinuousRoomSession(machine.getSnapshot());
assert.match(html, /4 Vagas fixas/);
assert.match(html, /Nara/);
assert.match(html, /Bento/);
assert.match(html, /Luma/);
assert.match(html, /Ivo · Completer em reserva/);
assert.match(html, /Resultado/);
assert.match(html, /Arena 11 por 9 inteira/);
assert.doesNotMatch(html, /recovery_token|recoveryToken|session_machine_0001/, "token/session credentials cannot enter DOM");
machine.dispatch({type: "continuous-room-leave"});
assert.equal(machine.getSnapshot().status, "compensating");
await Promise.resolve(); await Promise.resolve();
assert.equal(machine.getSnapshot().status, "cancelled");
machine.dispose();

const kernelClient = {
  recover: async () => authority(), input: async () => authority(), observe: async () => resultSnapshot, leave: async () => authority({state: "cancelled"}),
};
const kernel = new FrontendKernel(
  new InMemoryNavigationAdapter(`/sala/${roomId}`),
  new InMemoryIdentityAdapter(),
  {preferences: new InMemorySelectionPreferenceStore(), entry: new InMemorySelectionEntryAdapter()},
  {createClient: () => kernelClient},
);
assert.equal(kernel.getSnapshot().screen, "continuous-room");
await Promise.resolve(); await Promise.resolve();
assert.equal(kernel.getSnapshot().status, "preparing");
kernel.dispose();

console.log("continuous-room-session-machine-check: ok");
