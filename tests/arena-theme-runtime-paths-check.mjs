import { access } from "node:fs/promises";
import path from "node:path";

const {
  ARENA_THEME_LIBRARY,
  getArenaThemeById,
  resolveArenaTheme,
} = await import("../output/esm/Arenas/arena-theme-library.js");

const expectedFiles = {
  base: "floor-base.png",
  lane: "floor-lane.png",
  spawn: "floor-spawn.png",
  wall: "wall.png",
  crate: "crate.png",
};

const spriteThemes = ARENA_THEME_LIBRARY.filter((theme) => theme.renderMode === "sprite");
const expectedSpriteThemeIds = ["arcane-citadel", "ember-kiln", "skyfoundry-bastion", "tidal-foundry"];
const runtimePathResults = await Promise.all(spriteThemes.map(async (theme) => {
  const tilePaths = theme.tilePaths ?? {};
  const mismatches = Object.entries(expectedFiles)
    .filter(([key, fileName]) => tilePaths[key] !== `/Assets/TileMaps/themes/${theme.id}/${fileName}`)
    .map(([key, fileName]) => ({
      key,
      expected: `/Assets/TileMaps/themes/${theme.id}/${fileName}`,
      actual: tilePaths[key] ?? null,
    }));

  const invalidPublicPaths = Object.values(tilePaths)
    .filter((runtimePath) => runtimePath.includes("public/") || runtimePath.includes("aassets") || !runtimePath.startsWith("/Assets/"));
  const missingFiles = [];
  for (const runtimePath of Object.values(tilePaths)) {
    try {
      await access(path.join(process.cwd(), "public", runtimePath));
    } catch {
      missingFiles.push(runtimePath);
    }
  }

  return {
    id: theme.id,
    mismatches,
    invalidPublicPaths,
    missingFiles,
    pass: mismatches.length === 0 && invalidPublicPaths.length === 0 && missingFiles.length === 0,
  };
}));

const directSelection = getArenaThemeById(" ARCANe-CITADEL ")?.id === "arcane-citadel";
const querySelection = resolveArenaTheme("?arenaTheme=skyfoundry-bastion").id === "skyfoundry-bastion";
const spriteThemeIds = spriteThemes.map((theme) => theme.id).sort();
const pass = JSON.stringify(spriteThemeIds) === JSON.stringify(expectedSpriteThemeIds)
  && runtimePathResults.every((result) => result.pass)
  && directSelection
  && querySelection;

console.log(JSON.stringify({
  spriteThemeCount: spriteThemes.length,
  spriteThemeIds,
  runtimePathResults,
  directSelection,
  querySelection,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
