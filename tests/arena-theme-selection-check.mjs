import { readFile } from "node:fs/promises";

const {
  applyArenaThemeSelection,
  buildArenaThemeUrl,
  resolveArenaThemeSelection,
} = await import("../output/esm/Arenas/arena-theme-selection.js");

const { ARENA_THEME_LIBRARY } = await import("../output/esm/Arenas/arena-theme-library.js");

const baseArena = {
  id: "active-arena",
  name: "Active Arena",
  status: "active",
  themeId: "royal-marble",
  grid: { width: 15, height: 13 },
  tiles: { solid: [], breakable: [] },
  spawns: [],
  version: "test",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const selectedArena = applyArenaThemeSelection(
  baseArena,
  "https://bomba.test/play?room=ABCD&arenaTheme=skyfoundry-bastion",
);
const invalidArena = applyArenaThemeSelection(baseArena, "?arenaTheme=missing-theme");
const selectedTheme = resolveArenaThemeSelection("?arenaTheme=verdant-ruins", "royal-marble");
const fallbackTheme = resolveArenaThemeSelection("?arenaTheme=missing-theme", "royal-marble");
const surpriseHref = "https://bomba.test/play?room=LUCKY&arenaTheme=surprise";
const surpriseTheme = resolveArenaThemeSelection(surpriseHref, "royal-marble");
const repeatedSurpriseTheme = resolveArenaThemeSelection(surpriseHref, "tournament-clean");

const themeUrl = new URL(buildArenaThemeUrl(
  "arcane-citadel",
  "https://bomba.test/en/play?room=ABCD&utm=friend&arenaTheme=old",
));
const defaultedUrl = new URL(buildArenaThemeUrl("missing-theme", "https://bomba.test/play?room=ZZ99"));
const surpriseUrl = new URL(buildArenaThemeUrl("surprise", "https://bomba.test/play?room=LUCKY&utm=friend"));

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const sessionClient = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const mainTs = await readFile(new URL("../src/UiLayouts/legacy-bootstrap.ts", import.meta.url), "utf8");

const checks = {
  hasThemeLibraryOptions: ARENA_THEME_LIBRARY.length >= 6,
  queryOverridesActiveArena: selectedArena.themeId === "skyfoundry-bastion" && selectedArena.id === baseArena.id,
  invalidQueryKeepsActiveArena: invalidArena.themeId === "royal-marble",
  resolverUsesQueryBeforeFallback: selectedTheme.id === "verdant-ruins",
  resolverUsesFallbackAfterInvalidQuery: fallbackTheme.id === "royal-marble",
  surpriseThemeIsKnown: ARENA_THEME_LIBRARY.some((theme) => theme.id === surpriseTheme.id),
  surpriseThemeIsStableForUrl: repeatedSurpriseTheme.id === surpriseTheme.id,
  surpriseUrlPreservesIntent: surpriseUrl.searchParams.get("arenaTheme") === "surprise"
    && surpriseUrl.searchParams.get("room") === "LUCKY"
    && surpriseUrl.searchParams.get("utm") === "friend",
  urlPreservesPathAndParams: themeUrl.pathname === "/en/play"
    && themeUrl.searchParams.get("room") === "ABCD"
    && themeUrl.searchParams.get("utm") === "friend"
    && themeUrl.searchParams.get("arenaTheme") === "arcane-citadel",
  urlDefaultsInvalidTheme: defaultedUrl.searchParams.get("arenaTheme") === "tournament-clean",
  bootstrapAppliesThemeSelection: mainTs.includes("applyArenaThemeSelection(")
    && mainTs.includes("loadGameAssets(activeArena.themeId)"),
  landingRendersThemeLinks: sessionClient.includes("ARENA_THEME_LIBRARY.map")
    && sessionClient.includes("landingArenaThemeLinks")
    && sessionClient.includes("buildArenaThemeUrl(theme.id"),
  cssCoversThemePicker: css.includes(".experience-arena-theme__option:focus-visible")
    && css.includes(".experience-screen--landing .experience-arena-theme__options")
    && css.includes(".experience-arena-theme__badge[hidden]"),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  checks,
  selectedArenaTheme: selectedArena.themeId,
  invalidArenaTheme: invalidArena.themeId,
  selectedTheme: selectedTheme.id,
  fallbackTheme: fallbackTheme.id,
  surpriseTheme: surpriseTheme.id,
  themeUrl: themeUrl.toString(),
  surpriseUrl: surpriseUrl.toString(),
  defaultedUrl: defaultedUrl.toString(),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
