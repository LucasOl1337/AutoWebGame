import { readFileSync } from "node:fs";

const { CHARACTER_ROSTER_MANIFEST } = await import("../output/esm/core/character-roster-manifest.js");

const publicManifest = JSON.parse(
  readFileSync(new URL("../public/assets/characters/manifest.json", import.meta.url), "utf8"),
).characters;

const report = {
  publicLength: publicManifest.length,
  coreLength: CHARACTER_ROSTER_MANIFEST.length,
  mismatch: null,
};

for (let index = 0; index < Math.max(publicManifest.length, CHARACTER_ROSTER_MANIFEST.length); index += 1) {
  const publicEntry = publicManifest[index] ?? null;
  const coreEntry = CHARACTER_ROSTER_MANIFEST[index] ?? null;
  if (publicEntry?.id === coreEntry?.id) {
    continue;
  }
  report.mismatch = {
    index,
    publicId: publicEntry?.id ?? null,
    publicName: publicEntry?.name ?? null,
    coreId: coreEntry?.id ?? null,
    coreName: coreEntry?.name ?? null,
  };
  break;
}

report.pass = report.mismatch === null && report.publicLength === report.coreLength;

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
