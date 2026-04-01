import {
  buildArenaRuntimeConfig,
  cloneArenaDefinition,
  createArena,
  createDefaultArenaDefinition,
  validateArenaDefinition,
} from "../output/esm/Arenas/arena.js";

const evenWidthArena = cloneArenaDefinition(createDefaultArenaDefinition("draft"));
evenWidthArena.grid.width = 10;
const evenWidthValidation = validateArenaDefinition(evenWidthArena);

const blockedSpawnArena = cloneArenaDefinition(createDefaultArenaDefinition("draft"));
blockedSpawnArena.tiles.solid.push("1,1");
const blockedSpawnValidation = validateArenaDefinition(blockedSpawnArena);

const deterministicArena = cloneArenaDefinition(createDefaultArenaDefinition("draft"));
deterministicArena.id = "deterministic-check";
deterministicArena.version = "deterministic-v1";
deterministicArena.status = "draft";

const runtimeA = buildArenaRuntimeConfig(deterministicArena);
const runtimeB = buildArenaRuntimeConfig(deterministicArena);
const arenaStateA = createArena(deterministicArena);
const arenaStateB = createArena(deterministicArena);

const powerUpsA = arenaStateA.powerUps.map((entry) => ({
  tile: entry.tile,
  type: entry.type,
}));
const powerUpsB = arenaStateB.powerUps.map((entry) => ({
  tile: entry.tile,
  type: entry.type,
}));

const report = {
  widthValidationCodes: evenWidthValidation.issues.map((issue) => issue.code),
  blockedSpawnCodes: blockedSpawnValidation.issues.map((issue) => issue.code),
  suddenDeathSame: JSON.stringify(runtimeA.suddenDeathPath) === JSON.stringify(runtimeB.suddenDeathPath),
  wrapPortalsSame: JSON.stringify(runtimeA.wrapPortals) === JSON.stringify(runtimeB.wrapPortals),
  powerUpsSame: JSON.stringify(powerUpsA) === JSON.stringify(powerUpsB),
};

console.log(JSON.stringify(report, null, 2));

const pass = report.widthValidationCodes.includes("width_invalid")
  && report.blockedSpawnCodes.includes("spawn_blocked")
  && report.suddenDeathSame
  && report.wrapPortalsSame
  && report.powerUpsSame;

if (!pass) {
  process.exit(1);
}
