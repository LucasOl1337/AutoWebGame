import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameAppSource = fs.readFileSync(path.join(repoRoot, "src/Engine/game-app.ts"), "utf8");
const { playOnlineAudioTransition } = await import("../output/esm/NetCode/online-sync.js");
const { SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

const localExplosionBlock = gameAppSource.match(
  /private explodeBomb[\s\S]*?this\.ensureDemolitionComboDrop\(brokenCrateKeys\);([\s\S]*?)flameTiles\.forEach/,
)?.[1] ?? "";
const localOncePerExplosionPass = localExplosionBlock.includes("brokenCrateKeys.length > 0")
  && (localExplosionBlock.match(/playOneShot\("crateBreak"\)/g) ?? []).length === 1;

const crateManifest = SFX_MANIFEST.crateBreak;
const manifestPass = !Array.isArray(crateManifest)
  && crateManifest?.url.endsWith("shield_block_deflect.mp3")
  && crateManifest.volume > 0;

const baseArgs = {
  headless: false,
  role: "guest",
  audioPrimed: true,
  localPlayerId: 2,
  suppressLocalBombAudio: false,
  previousBombs: [],
  previousFlames: [],
  previousPlayers: {},
  previousMatchWinner: null,
  previousRoundOutcome: null,
  previousSuddenDeathActive: false,
  didCollectRemotePowerUp: () => false,
};

const removedCalls = [];
playOnlineAudioTransition({
  ...baseArgs,
  previousBreakableTiles: ["4,4", "5,4"],
  next: {
    bombs: [],
    flames: [],
    players: {},
    roundOutcome: null,
    matchWinner: null,
    suddenDeathActive: false,
    breakableTiles: ["5,4"],
  },
  playSound: (name) => removedCalls.push(name),
});

const unchangedCalls = [];
playOnlineAudioTransition({
  ...baseArgs,
  previousBreakableTiles: ["5,4"],
  next: {
    bombs: [],
    flames: [],
    players: {},
    roundOutcome: null,
    matchWinner: null,
    suddenDeathActive: false,
    breakableTiles: ["5,4"],
  },
  playSound: (name) => unchangedCalls.push(name),
});

const guestDiffPass = removedCalls.filter((name) => name === "crateBreak").length === 1
  && unchangedCalls.length === 0;
const pass = manifestPass && localOncePerExplosionPass && guestDiffPass;

console.log(JSON.stringify({
  manifestAsset: Array.isArray(crateManifest) ? null : crateManifest?.url,
  manifestPass,
  localOncePerExplosionPass,
  removedCalls,
  unchangedCalls,
  guestDiffPass,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
