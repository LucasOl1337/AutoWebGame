import fs from "node:fs";

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { buildBotDangerMap } = await import("../output/esm/Engine/bot-ai.js");
const { SUDDEN_DEATH_TICK_MS } = await import("../output/esm/Engine/danger-map.js");

const noop = () => {};
const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
};
const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {},
};

const game = new GameApp({ appendChild: noop }, assets);
game.startServerAuthoritativeMatch(
  [1, 2],
  { 1: 0, 2: 0, 3: 0, 4: 0 },
  { botPlayerIds: [2] },
);

game.arena.solid = new Set(["3,2"]);
game.arena.breakable = new Set(["2,3", "3,5"]);
game.flames = [{ tile: { x: 1, y: 1 }, remainingMs: 300 }];
game.bombs = [
  { id: 1, ownerId: 1, tile: { x: 3, y: 3 }, fuseMs: 450, ownerCanPass: false, flameRange: 3 },
  { id: 2, ownerId: 2, tile: { x: 5, y: 3 }, fuseMs: 1_400, ownerCanPass: false, flameRange: 2 },
  { id: 3, ownerId: 1, tile: { x: 3, y: 6 }, fuseMs: 900, ownerCanPass: false, flameRange: 3 },
  { id: 4, ownerId: 2, tile: { x: 8, y: 2 }, fuseMs: 3_100, ownerCanPass: false, flameRange: 1 },
];
game.suddenDeathClosureEffects = [
  { tile: { x: 8, y: 8 }, elapsedMs: 100, impacted: false },
  { tile: { x: 6, y: 8 }, elapsedMs: 500, impacted: true },
];
game.suddenDeathActive = true;
game.suddenDeathTickMs = 250;
game.suddenDeathPath = [
  { x: 10, y: 10 },
  { x: 9, y: 8 },
  { x: 9, y: 9 },
];
game.suddenDeathIndex = 1;

const extraBomb = { tile: { x: 7, y: 7 }, range: 1, fuseMs: 777 };
const gameDanger = game.getDangerMap(extraBomb);
const botDanger = buildBotDangerMap(game.createBotContext(), extraBomb);
const normalize = (map) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
const parityPass = JSON.stringify(normalize(gameDanger)) === JSON.stringify(normalize(botDanger));

const expectedDanger = {
  flameImmediate: gameDanger.get("1,1") === 0,
  chainReaction: gameDanger.get("5,3") === 450 && gameDanger.get("7,3") === 450,
  solidStopsBlast: !gameDanger.has("3,2") && !gameDanger.has("3,1"),
  breakableStopsBlast: gameDanger.get("2,3") === 450 && !gameDanger.has("1,3"),
  blockedChainPreservesFuse: gameDanger.get("3,5") === 450 && gameDanger.get("3,6") === 900,
  extraBombProjected: gameDanger.get("7,7") === 777 && gameDanger.get("7,6") === 777,
  distantBombIgnored: !gameDanger.has("8,2"),
  closureCountdown: gameDanger.get("8,8") === 240 && !gameDanger.has("6,8"),
  suddenDeathPath: gameDanger.get("9,8") === 250
    && gameDanger.get("9,9") === 250 + SUDDEN_DEATH_TICK_MS,
};
const observedCriticalEtaMs = {
  blockedCrate: gameDanger.get("3,5"),
  blockedBomb: gameDanger.get("3,6"),
  closure: gameDanger.get("8,8"),
};
const expectedContractPass = Object.values(expectedDanger).every(Boolean);

const gameSource = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const botSource = fs.readFileSync(new URL("../src/Engine/bot-ai.ts", import.meta.url), "utf8");
const sharedSource = fs.readFileSync(new URL("../src/Engine/danger-map.ts", import.meta.url), "utf8");
const sourceContractPass = gameSource.includes("return buildDangerMap(this.createBotContext(), extraBomb)")
  && botSource.includes("return buildDangerMap(context, extraBomb)")
  && sharedSource.includes("export function buildDangerMap")
  && !gameSource.includes("const bombsToProject")
  && !botSource.includes("const bombsToProject");

const pass = parityPass && expectedContractPass && sourceContractPass;
console.log(JSON.stringify({
  pass,
  parityPass,
  expectedContractPass,
  sourceContractPass,
  expectedDanger,
  observedCriticalEtaMs,
  projectedTileCount: gameDanger.size,
}, null, 2));

if (!pass) {
  process.exit(1);
}
