import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const characterId = "5474c45c-2987-43e0-af2c-a6500c836881";
const directions = ["south", "east", "north", "west"];
const frameCount = 6;

function readPngMetadata(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  return {
    validSignature: signature === "89504e470d0a1a0a",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

const manifests = ["manifest.json", "manifest.approved.json"].map((name) => {
  const path = resolve(root, "public", "Assets", "Characters", "Animations", name);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  const nico = payload.characters.find((entry) => entry.id === characterId);
  return { name, deathEnabled: nico?.animations?.death === true };
});

const frames = directions.flatMap((direction) =>
  Array.from({ length: frameCount }, (_, index) => {
    const name = `death-${direction}-${index}.png`;
    const path = resolve(root, "public", "Assets", "Characters", "Animations", characterId, name);
    const buffer = readFileSync(path);
    const metadata = readPngMetadata(buffer);
    return {
      name,
      ...metadata,
      bytes: statSync(path).size,
      hash: createHash("sha256").update(buffer).digest("hex"),
    };
  }),
);

const southHashes = frames.filter((frame) => frame.name.includes("-south-")).map((frame) => frame.hash);
const distinctSouthFrames = new Set(southHashes).size;
const report = {
  manifests,
  frameCount: frames.length,
  distinctSouthFrames,
  totalBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0),
  frames: frames.map(({ hash: _hash, ...frame }) => frame),
};

report.pass =
  manifests.every((manifest) => manifest.deathEnabled)
  && frames.length === directions.length * frameCount
  && frames.every((frame) => frame.validSignature && frame.width === 116 && frame.height === 116 && frame.colorType === 6)
  && distinctSouthFrames === frameCount
  && report.totalBytes < 150_000;

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
