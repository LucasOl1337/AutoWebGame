import assert from "node:assert/strict";

const { getPowerUpDefinition } = await import("../output/esm/Gameplay/powerups.js");

const bombKick = getPowerUpDefinition("kick-up");

assert.equal(bombKick.label, "Bomb Kick");
assert.equal(bombKick.shortLabel, "BK");

console.log(JSON.stringify({
  type: bombKick.type,
  label: bombKick.label,
  shortLabel: bombKick.shortLabel,
  pass: true,
}, null, 2));
