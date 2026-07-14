import assert from "node:assert/strict";

const { getPowerUpDefinition } = await import("../output/esm/Gameplay/powerups.js");

const remoteDetonation = getPowerUpDefinition("remote-up");

assert.equal(remoteDetonation.label, "Remote Detonation");
assert.equal(remoteDetonation.shortLabel, "RD");

console.log(JSON.stringify({
  type: remoteDetonation.type,
  label: remoteDetonation.label,
  shortLabel: remoteDetonation.shortLabel,
  pass: true,
}, null, 2));
