const {
  applyPowerUpToPlayer,
  getBombFuseMsForPlayer,
  getPowerUpDefinition,
} = await import("../output/esm/Gameplay/powerups.js");
const { BOMB_FUSE_MS } = await import("../output/esm/PersonalConfig/config.js");

const player = {
  shortFuseLevel: 0,
};
const definition = getPowerUpDefinition("short-fuse-up");
const fuseBeforePickup = getBombFuseMsForPlayer(player);

applyPowerUpToPlayer(player, "short-fuse-up");
const fuseAfterPickup = getBombFuseMsForPlayer(player);

const report = {
  type: definition.type,
  label: definition.label,
  shortLabel: definition.shortLabel,
  fuseBeforePickup,
  fuseAfterPickup,
  shortenedByMs: fuseBeforePickup - fuseAfterPickup,
  pass: (
    definition.type === "short-fuse-up"
    && definition.label === "Short Fuse"
    && definition.shortLabel === "SF"
    && fuseBeforePickup === BOMB_FUSE_MS
    && fuseAfterPickup === BOMB_FUSE_MS - 400
  ),
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
