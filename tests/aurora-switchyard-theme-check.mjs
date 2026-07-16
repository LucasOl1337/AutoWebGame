import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/Arenas/arena-theme-library.ts", "utf8");
const config = JSON.parse(await readFile("configs/arena-theme-library.json", "utf8"));
const { getArenaThemeById, resolveArenaTheme } = await import(
  "../output/esm/Arenas/arena-theme-library.js",
);

const theme = getArenaThemeById(" AURORA-SWITCHYARD ");
const queryTheme = resolveArenaTheme("?arenaTheme=aurora-switchyard");
const configTheme = config.themes.find((entry) => entry.id === "aurora-switchyard");

assert.ok(theme, "Aurora Switchyard must be registered in the runtime theme map");
assert.equal(theme.id, "aurora-switchyard");
assert.equal(theme.name, "Aurora Switchyard");
assert.equal(theme.renderMode, "procedural");
assert.deepEqual(theme.motif, {
  floorPattern: "vein",
  lanePattern: "chevron",
  spawnPattern: "diamond",
  wallStyle: "frost",
  crateStyle: "trimmed",
});
assert.equal(queryTheme.id, theme.id, "query selection must resolve the new theme");
assert.ok(configTheme, "catalog must describe the new theme");
assert.equal(configTheme.renderMode, "procedural");
assert.match(source, /id: "aurora-switchyard"/);
assert.match(source, /floorBase: "#263452"/);

console.log(JSON.stringify({
  id: theme.id,
  renderMode: theme.renderMode,
  floorBase: theme.palette.floorBase,
  lane: theme.palette.floorLane,
  spawnRing: theme.palette.spawnRing,
  crate: theme.palette.crateInner,
  pass: true,
}, null, 2));
