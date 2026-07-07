import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

const expectedPowerCollectFiles = [
  "powerup_collect.mp3",
  "powerup_collect_bright.mp3",
  "powerup_collect_crystal.mp3",
];

const powerCollect = SFX_MANIFEST.powerCollect;
const manifestPass = Array.isArray(powerCollect)
  && powerCollect.length === expectedPowerCollectFiles.length
  && expectedPowerCollectFiles.every((filename, index) => (
    powerCollect[index]?.url === `/Assets/SoundEffects/${filename}`
  ));

function probeAudio(filePath) {
  const result = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name,codec_type:format=duration,size",
    "-of",
    "json",
    filePath,
  ], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `ffprobe exited with ${result.status}`,
    };
  }

  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] ?? {};
  const format = parsed.format ?? {};
  const durationSeconds = Number(format.duration);
  const sizeBytes = Number(format.size);

  return {
    ok: stream.codec_type === "audio"
      && stream.codec_name === "mp3"
      && durationSeconds > 0
      && durationSeconds <= 1.2
      && sizeBytes >= 8_000
      && sizeBytes <= 80_000,
    codec: stream.codec_name,
    durationSeconds,
    sizeBytes,
  };
}

const assets = expectedPowerCollectFiles.map((filename) => {
  const filePath = path.join(repoRoot, "public", "Assets", "SoundEffects", filename);
  return {
    filename,
    exists: existsSync(filePath),
    ...(existsSync(filePath) ? probeAudio(filePath) : { ok: false, error: "missing" }),
  };
});

const pass = manifestPass && assets.every((asset) => asset.ok);

console.log(JSON.stringify({
  manifestPass,
  assets,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
