import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const {
  ARENA_THEME_LIBRARY,
  getArenaThemeById,
  resolveArenaTheme,
} = await import("../output/esm/Arenas/arena-theme-library.js");

const expectedRuntimePaths = {
  base: "/Assets/TileMaps/themes/tidal-foundry/floor-base.png",
  lane: "/Assets/TileMaps/themes/tidal-foundry/floor-lane.png",
  spawn: "/Assets/TileMaps/themes/tidal-foundry/floor-spawn.png",
  wall: "/Assets/TileMaps/themes/tidal-foundry/wall.png",
  crate: "/Assets/TileMaps/themes/tidal-foundry/crate.png",
};

const expectedConfigPaths = {
  base: "public/Assets/TileMaps/themes/tidal-foundry/floor-base.png",
  lane: "public/Assets/TileMaps/themes/tidal-foundry/floor-lane.png",
  spawn: "public/Assets/TileMaps/themes/tidal-foundry/floor-spawn.png",
  wall: "public/Assets/TileMaps/themes/tidal-foundry/wall.png",
  crate: "public/Assets/TileMaps/themes/tidal-foundry/crate.png",
};

const theme = getArenaThemeById(" TIDAL-FOUNDRY ");
const queryTheme = resolveArenaTheme("?arenaTheme=tidal-foundry");
const config = JSON.parse(await readFile(path.join(projectRoot, "configs", "arena-theme-library.json"), "utf8"));
const configTheme = (config.themes ?? []).find((entry) => entry.id === "tidal-foundry");

async function readPngInfo(relativePath) {
  const buffer = await readFile(path.join(projectRoot, relativePath));
  const signatureOk = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  return {
    path: relativePath,
    signatureOk,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

const runtimePathResults = Object.entries(expectedRuntimePaths).map(([key, expected]) => ({
  key,
  expected,
  actual: theme?.tilePaths?.[key] ?? null,
  pass: theme?.tilePaths?.[key] === expected,
}));

const configPathResults = Object.entries(expectedConfigPaths).map(([key, expected]) => ({
  key,
  expected,
  actual: configTheme?.tilePaths?.[key] ?? null,
  pass: configTheme?.tilePaths?.[key] === expected,
}));

const pngResults = await Promise.all(Object.values(expectedConfigPaths).map(readPngInfo));

const pass = theme?.id === "tidal-foundry"
  && theme.renderMode === "sprite"
  && queryTheme.id === "tidal-foundry"
  && ARENA_THEME_LIBRARY.filter((entry) => entry.id === "tidal-foundry").length === 1
  && configTheme?.status === "active"
  && configTheme.renderMode === "sprite"
  && runtimePathResults.every((result) => result.pass)
  && configPathResults.every((result) => result.pass)
  && pngResults.every((result) => result.signatureOk && result.width === 32 && result.height === 32 && result.bytes > 250);

console.log(JSON.stringify({
  theme: theme?.id ?? null,
  queryTheme: queryTheme.id,
  runtimePathResults,
  configPathResults,
  pngResults,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
