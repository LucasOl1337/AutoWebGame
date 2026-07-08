const arena = await import("../output/esm/Arenas/arena.js");

const invalidArena = arena.cloneArenaDefinition(arena.createDefaultArenaDefinition());
invalidArena.id = "invalid-active-arena";
invalidArena.tiles.solid.push("1,1");

const validArena = arena.cloneArenaDefinition(arena.createDefaultArenaDefinition());
validArena.id = "valid-active-arena";
validArena.name = " Valid Active Arena ";
validArena.version = "valid-fetch-v1";

const cases = [];

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ arena: invalidArena }),
});
const invalidResult = await arena.fetchActiveArenaDefinition();
cases.push({
  name: "falls back when active arena payload is structurally invalid",
  pass: invalidResult.id === "default-live-arena"
    && arena.validateArenaDefinition(invalidResult).ok,
  resultId: invalidResult.id,
});

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ arena: validArena }),
});
const validResult = await arena.fetchActiveArenaDefinition();
cases.push({
  name: "keeps valid active arena payloads",
  pass: validResult.id === "valid-active-arena"
    && validResult.name === "Valid Active Arena"
    && arena.validateArenaDefinition(validResult).ok,
  resultId: validResult.id,
  normalizedName: validResult.name,
});

globalThis.fetch = async () => ({
  ok: false,
  json: async () => ({ arena: validArena }),
});
const failedResponseResult = await arena.fetchActiveArenaDefinition();
cases.push({
  name: "falls back when active arena request fails",
  pass: failedResponseResult.id === "default-live-arena"
    && arena.validateArenaDefinition(failedResponseResult).ok,
  resultId: failedResponseResult.id,
});

const failedCases = cases.filter((entry) => !entry.pass);
const pass = failedCases.length === 0;

console.log(JSON.stringify({
  cases,
  failedCases,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
