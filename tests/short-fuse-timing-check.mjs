import assert from "node:assert/strict";

const {
  formatBombFuseSeconds,
  getBombFuseMsForPlayer,
} = await import("../output/esm/Gameplay/powerups.js");

const player = { shortFuseLevel: 0 };
const fuseMsByLevel = [0, 1, 2].map((shortFuseLevel) => {
  player.shortFuseLevel = shortFuseLevel;
  return getBombFuseMsForPlayer(player);
});

assert.deepEqual(
  fuseMsByLevel,
  [2_000, 1_600, 1_200],
  "short-fuse deve reduzir 400 ms por nível até o piso de 1.200 ms",
);

player.shortFuseLevel = 1;
assert.equal(formatBombFuseSeconds(player), "1.60s");

console.log(JSON.stringify({
  fuseMsByLevel,
  formattedLevelOne: formatBombFuseSeconds(player),
  pass: true,
}, null, 2));
