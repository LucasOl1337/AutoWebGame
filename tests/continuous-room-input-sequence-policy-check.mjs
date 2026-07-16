import assert from "node:assert/strict";
import {
  getRegisteredPolicyArtifactHash,
  runHeadlessRound,
} from "../output/esm/BotLab/headless-round-runner.js";
import {
  getPublishedArenaMap,
  listPublishedArenaMaps,
  toArenaDefinition,
} from "../output/esm/Arenas/canonical-arena-catalog.js";
import { sha256Canonical } from "../output/esm/Shared/canonical-json.js";

const scriptHash = await getRegisteredPolicyArtifactHash("input-sequence-v1");
assert.equal(scriptHash, "sha256:01c33d600c422aa5127e9c47011b86179a96fe426995d61df60d434960e65d83");
const segments = [
  {untilStep: 15_000, input: {direction: "right", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false}},
  {untilStep: 30_000, input: {direction: null, bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false}},
];
const configHash = await sha256Canonical({scriptId: "input-sequence-v1", scriptHash, scriptConfig: {segments}});
const ref = listPublishedArenaMaps().find((candidate) => candidate.id === "cidadela-arcana" && candidate.revision === "r1");
const arena = toArenaDefinition(getPublishedArenaMap(ref));
const base = {
  build: "input-sequence-policy-check",
  ruleset: "classic-v1",
  arena,
  randomness: {
    randomnessMode: "seeded",
    requestedSeed: "continuous-room-first-round-v1",
    rngAlgorithm: "arena-seed-hash",
    rngVersion: "arena-runtime.v1",
    expectedInitialStateHash: "sha256:3978b7181574faa0f3e146d3531f79c7a0be73a9e9e5a7c19812f352b7177b4f",
  },
  activePlayerIds: [1, 2, 3, 4],
  characterSelections: {1: 0, 2: 1, 3: 2, 4: 3},
  maxSteps: 1,
  timeoutMs: 5_000,
  traceMode: "snapshot-trace-v1",
};
const policies = [
  {id: "human-input-sequence", playerId: 1, mode: "registered", scriptId: "input-sequence-v1", scriptConfig: {segments}, configHash},
  {id: "completer-nara", playerId: 2, mode: "built-in"},
  {id: "completer-bento", playerId: 3, mode: "built-in"},
  {id: "completer-luma", playerId: 4, mode: "built-in"},
];
const accepted = await runHeadlessRound({...base, policies});
assert.equal(accepted.steps, 1);
assert.equal(accepted.reproducibility.deterministicPolicyPath, true);
assert.equal(accepted.reproducibility.status, "verified");
assert.equal(accepted.limitations.some((item) => item.includes("unsafe-inline-external-policy")), false);

const mismatch = await runHeadlessRound({
  ...base,
  policies: [{...policies[0], configHash: `sha256:${"0".repeat(64)}`}, ...policies.slice(1)],
});
assert.equal(mismatch.status, "error");
assert.equal(mismatch.steps, 0, "registry/config mismatch must fail before the first GameApp tick");
assert.match(mismatch.error, /registry\/config hash mismatch/);

console.log("continuous-room-input-sequence-policy-check: ok");
