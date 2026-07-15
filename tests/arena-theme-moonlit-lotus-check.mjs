const {
  ARENA_THEME_QUERY_PARAM,
  getArenaThemeById,
  resolveArenaTheme,
} = await import("../output/esm/Arenas/arena-theme-library.js");

const theme = getArenaThemeById("moonlit-lotus");
const resolved = resolveArenaTheme(`?${ARENA_THEME_QUERY_PARAM}=moonlit-lotus`);

const pass = theme !== null
  && resolved === theme
  && theme.renderMode === "procedural"
  && theme.motif.spawnPattern === "seal"
  && theme.motif.lanePattern === "chevron"
  && theme.palette.floorLane !== theme.palette.floorBase
  && theme.palette.crateInner !== theme.palette.floorBase
  && theme.palette.spawnRing.includes("0.9");

console.log(JSON.stringify({
  id: theme?.id ?? null,
  renderMode: theme?.renderMode ?? null,
  motif: theme?.motif ?? null,
  queryResolved: resolved?.id ?? null,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
