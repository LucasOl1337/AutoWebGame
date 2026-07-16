import assert from "node:assert/strict";

const catalog = await import("../output/esm/Arenas/canonical-arena-catalog.js");
const jcs = await import("../output/esm/Shared/canonical-json.js");

const EXPECTED_CITADEL_HASH = "sha256:21711287367572f02d0766520f46d62005bd5eafb563cd0504840f45f21008fe";
const expectedRef = Object.freeze({
  id: "cidadela-arcana",
  revision: "r1",
  contentHash: EXPECTED_CITADEL_HASH,
});

const listed = catalog.listPublishedArenaMaps();
assert.equal(listed.length, 1);
assert.deepEqual(listed[0], expectedRef);
assert.equal(Object.isFrozen(listed), true);
assert.equal(Object.isFrozen(listed[0]), true);

const map = catalog.getPublishedArenaMap(expectedRef);
assert.equal(map.schemaVersion, "arena-map.v1");
assert.equal(map.lifecycle, "published");
assert.equal(map.contentHash, EXPECTED_CITADEL_HASH);
assert.deepEqual(map.eligibleExperiences, ["continuous-room", "training", "lab"]);
assert.deepEqual(map.layout.grid, { width: 11, height: 9 });
assert.deepEqual(map.layout.portals, [
  { id: "north", entry: { x: 5, y: 0 }, exit: { x: 5, y: 8 } },
  { id: "east", entry: { x: 10, y: 4 }, exit: { x: 0, y: 4 } },
  { id: "south", entry: { x: 5, y: 8 }, exit: { x: 5, y: 0 } },
  { id: "west", entry: { x: 0, y: 4 }, exit: { x: 10, y: 4 } },
]);
assert.equal(Object.isFrozen(map), true);
assert.equal(Object.isFrozen(map.layout), true);
assert.equal(Object.isFrozen(map.layout.solid), true);
assert.throws(
  () => catalog.getPublishedArenaMap({ ...expectedRef, contentHash: `sha256:${"0".repeat(64)}` }),
  /incompatible.*hash/i,
);
assert.throws(
  () => catalog.getPublishedArenaMap({ ...expectedRef, revision: "r2" }),
  /not published/i,
);

const verification = await catalog.verifyPublishedArenaMap(map);
assert.equal(verification.ok, true);
assert.deepEqual(verification.issues, []);
assert.equal(verification.computedHash, EXPECTED_CITADEL_HASH);

const tampered = structuredClone(map);
tampered.layout.breakable.pop();
const rejected = await catalog.verifyPublishedArenaMap(tampered);
assert.equal(rejected.ok, false);
assert.equal(rejected.computedHash === EXPECTED_CITADEL_HASH, false);
assert.ok(rejected.issues.some((issue) => issue.code === "content_hash_mismatch"));
assert.ok(rejected.issues.some((issue) => issue.code === "catalog_content_mismatch"));

for (const mutate of [
  (value) => { value.eligibleExperiences = ["training"]; },
  (value) => { value.layout.portals[0].exit = { x: 1, y: 1 }; },
  (value) => { value.assets.fallback.portal = "#000000"; },
  (value) => { value.unexpected = true; },
]) {
  const contractMutation = structuredClone(map);
  mutate(contractMutation);
  delete contractMutation.contentHash;
  contractMutation.contentHash = await jcs.sha256Canonical(contractMutation);
  const contractRejected = await catalog.verifyPublishedArenaMap(contractMutation);
  assert.equal(contractRejected.computedHash, contractMutation.contentHash);
  assert.equal(contractRejected.ok, false);
  assert.ok(contractRejected.issues.some((issue) => issue.code === "catalog_content_mismatch"));
}

const arena = catalog.toArenaDefinition(map);
assert.equal(arena.id, "cidadela-arcana");
assert.equal(arena.version, `r1@${EXPECTED_CITADEL_HASH}`);
assert.equal(arena.themeId, "arcane-citadel");
assert.deepEqual(arena.grid, { width: 11, height: 9 });
assert.equal(arena.tiles.breakable.length, 14);
assert.equal(arena.spawns.length, 4);

console.log(JSON.stringify({
  pass: true,
  map: expectedRef,
  solidTiles: map.layout.solid.length,
  breakableTiles: map.layout.breakable.length,
  portals: map.layout.portals.length,
}, null, 2));
