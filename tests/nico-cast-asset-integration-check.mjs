import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const animationRoot = join(root, "public", "Assets", "Characters", "Animations");
const manifestPaths = [
  join(animationRoot, "manifest.json"),
  join(animationRoot, "manifest.approved.json"),
];
const directions = ["north", "south", "east", "west"];
const expectedIndexes = [0, 1, 2, 3, 4, 5];

const manifests = manifestPaths.map((path) => JSON.parse(readFileSync(path, "utf8")));
const nicoEntries = manifests.map((manifest) =>
  manifest.characters.find((character) => character.name === "Nico"),
);
const [nico] = nicoEntries;

if (!nico || nicoEntries.some((entry) => !entry)) {
  throw new Error("Nico must exist in both character animation manifests.");
}

const manifestAgreement = JSON.stringify(manifests[0]) === JSON.stringify(manifests[1]);
const castEnabled = nicoEntries.every((entry) => entry.animations?.cast === true);
const assetDirectory = join(animationRoot, nico.id);
const castFiles = readdirSync(assetDirectory).filter((name) => name.startsWith("cast-"));

const directionReports = directions.map((direction) => {
  const expectedFiles = expectedIndexes.map((index) => `cast-${direction}-${index}.png`);
  const existingFiles = castFiles.filter((name) => name.startsWith(`cast-${direction}-`)).sort();
  const frames = expectedFiles.map((name) => {
    const path = join(assetDirectory, name);
    const bytes = readFileSync(path);
    const pngSignature = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const colorType = bytes[25];
    return {
      name,
      bytes: statSync(path).size,
      pngSignature,
      width,
      height,
      hasAlpha: colorType === 4 || colorType === 6,
    };
  });

  return {
    direction,
    exactSequence: JSON.stringify(existingFiles) === JSON.stringify(expectedFiles),
    frames,
    pass: frames.every(
      (frame) => frame.pngSignature && frame.width === nico.size.width
        && frame.height === nico.size.height && frame.hasAlpha,
    ),
  };
});

const totalBytes = directionReports
  .flatMap((report) => report.frames)
  .reduce((sum, frame) => sum + frame.bytes, 0);
const pass = manifestAgreement && castEnabled
  && castFiles.length === directions.length * expectedIndexes.length
  && directionReports.every((report) => report.exactSequence && report.pass);

console.log(JSON.stringify({
  nicoId: nico.id,
  manifestAgreement,
  castEnabled,
  frameCount: castFiles.length,
  totalBytes,
  directions: directionReports.map((report) => ({
    direction: report.direction,
    exactSequence: report.exactSequence,
    dimensions: [...new Set(report.frames.map((frame) => `${frame.width}x${frame.height}`))],
    alpha: report.frames.every((frame) => frame.hasAlpha),
  })),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
