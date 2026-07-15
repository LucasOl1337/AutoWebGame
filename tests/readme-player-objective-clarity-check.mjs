import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const description = "`BOMBA PvP` is a browser-first Bomberman-style arena game with a TypeScript/Vite client and a Cloudflare Worker backend for online sessions.";
const objective = "Open routes with bombs, collect power-ups, eliminate rivals, and, in classic mode, win rounds until you reach the target score.";

const normalizedReadme = readme.replaceAll("\r\n", "\n");
const descriptionIndex = normalizedReadme.indexOf(description);
const objectiveIndex = normalizedReadme.indexOf(objective);
const deploymentIndex = normalizedReadme.indexOf("Official public deployment:");

const checks = {
  descriptionExists: descriptionIndex >= 0,
  objectiveExistsExactlyOnce: objectiveIndex >= 0 && objectiveIndex === normalizedReadme.lastIndexOf(objective),
  objectiveImmediatelyFollowsDescription: normalizedReadme.includes(`${description}\n\n${objective}`),
  objectivePrecedesDeployment: objectiveIndex > descriptionIndex && objectiveIndex < deploymentIndex,
};

for (const [name, passed] of Object.entries(checks)) {
  assert.equal(passed, true, `README player objective check failed: ${name}`);
}

console.log(JSON.stringify({ checks, objective, pass: true }, null, 2));
