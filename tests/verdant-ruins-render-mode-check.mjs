import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/Arenas/arena-theme-library.ts", import.meta.url),
  "utf8",
);

function themeBlock(id) {
  const start = source.indexOf(`id: "${id}"`);
  if (start < 0) return "";

  const nextTheme = source.indexOf("\n  {\n    id:", start + 1);
  return source.slice(start, nextTheme < 0 ? source.length : nextTheme);
}

function renderMode(id) {
  return themeBlock(id).match(/renderMode:\s*"(sprite|procedural)"/)?.[1] ?? null;
}

const checks = {
  preservesDefaultTheme: source.includes('DEFAULT_ARENA_THEME_ID = "tournament-clean"')
    && renderMode("tournament-clean") === "procedural",
  verdantRuinsUsesProceduralRendering: renderMode("verdant-ruins") === "procedural",
  preservesSkyfoundrySpriteRendering: renderMode("skyfoundry-bastion") === "sprite",
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  checks,
  renderModes: {
    default: renderMode("tournament-clean"),
    verdantRuins: renderMode("verdant-ruins"),
    skyfoundry: renderMode("skyfoundry-bastion"),
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
