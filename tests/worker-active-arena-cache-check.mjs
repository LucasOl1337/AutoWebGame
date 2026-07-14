import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

const handleActiveArenaMatch = workerSource.match(/async handleActiveArena\(\) \{[\s\S]*?\n  \}/);
const activateArenaMatch = workerSource.match(/async activateArenaDefinition\(arenaId\) \{[\s\S]*?\n  \}/);
const constructorReadyMatch = workerSource.match(/this\.activeArenaDefinition = await this\.readActiveArenaDefinition\(\);/);

if (!handleActiveArenaMatch || !activateArenaMatch || !constructorReadyMatch) {
  console.error("Could not find active arena cache flow in worker/index.js");
  process.exit(1);
}

const handleActiveArenaBody = handleActiveArenaMatch[0];
const activateArenaBody = activateArenaMatch[0];

const readCallsInActiveEndpoint = (handleActiveArenaBody.match(/readActiveArenaDefinition\(/g) || []).length;
const clonesCachedArena = handleActiveArenaBody.includes("cloneArenaDefinition(this.activeArenaDefinition)");
const activationRefreshesCache = activateArenaBody.includes("this.activeArenaDefinition = cloneArenaDefinition(activeArena);");

const before = {
  readCallsInActiveEndpoint: 1,
  expectedStorageReadsPerRequest: 1,
};
const after = {
  readCallsInActiveEndpoint,
  expectedStorageReadsPerRequest: readCallsInActiveEndpoint,
  clonesCachedArena,
  cacheLoadedDuringReady: Boolean(constructorReadyMatch),
  activationRefreshesCache,
};

const pass = readCallsInActiveEndpoint === 0
  && clonesCachedArena
  && after.cacheLoadedDuringReady
  && activationRefreshesCache;

console.log(JSON.stringify({ pass, before, after }, null, 2));

if (!pass) {
  process.exit(1);
}
