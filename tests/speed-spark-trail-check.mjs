import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetPath = path.join(repoRoot, "public", "Assets", "VisualEffects", "speed-spark-trail.png");
const assetsSource = readFileSync(path.join(repoRoot, "src", "Engine", "assets.ts"), "utf8");
const gameAppSource = readFileSync(path.join(repoRoot, "src", "Engine", "game-app.ts"), "utf8");

function readChunks(buffer) {
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
}

function unfilterPngRgba(width, height, inflated) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rows = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? rows[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? rows[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? rows[prevRowStart + x - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft));
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      rows[rowStart + x] = value & 0xff;
    }
    sourceOffset += stride;
  }
  return rows;
}

function inspectPng(filePath) {
  const buffer = readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!ihdr) {
    return { ok: false, error: "missing IHDR" };
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const idatData = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const inflated = zlib.inflateSync(idatData);
  const pixels = colorType === 6 && bitDepth === 8
    ? unfilterPngRgba(width, height, inflated)
    : Buffer.alloc(0);
  let transparentPixels = 0;
  let opaquePixels = 0;
  let partialAlphaPixels = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha === 0) {
      transparentPixels += 1;
    } else if (alpha === 255) {
      opaquePixels += 1;
    } else {
      partialAlphaPixels += 1;
    }
  }
  return {
    ok: signature === "89504e470d0a1a0a"
      && width === 64
      && height === 64
      && bitDepth === 8
      && colorType === 6
      && transparentPixels > 0
      && opaquePixels + partialAlphaPixels > 0,
    width,
    height,
    bitDepth,
    colorType,
    transparentPixels,
    opaquePixels,
    partialAlphaPixels,
  };
}

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { getArenaThemeById } = await import("../output/esm/Arenas/arena-theme-library.js");

const noop = () => {};
const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [] },
  cast: { up: [], down: [], left: [], right: [] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};
const root = { appendChild: noop };
const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
  characterSpriteLoader: async () => emptySprites,
  arenaTheme: getArenaThemeById("tournament-clean"),
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  effects: { speedSparkTrail: { width: 64, height: 64 } },
  powerUps: {},
};

const game = new GameApp(root, assets);
game.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 0, 3: 0, 4: 0 });
const player = game.players[1];
player.spawnProtectionMs = 0;
player.flameGuardMs = 0;
player.perfectStartWindowMs = 0;
player.perfectStartBoostMs = 0;
player.breakawayBoostMs = 0;
player.pickupSprintMs = 0;
player.speedLevel = 0;
player.velocity = { x: 0, y: 0 };

const idleBaseHidden = game.isSpeedSparkTrailActive(player, false) === false;
const movingBaseHidden = game.isSpeedSparkTrailActive(player, true) === false;
player.speedLevel = 1;
const speedLevelVisible = game.isSpeedSparkTrailActive(player, true) === true;
player.speedLevel = 0;
player.pickupSprintMs = 120;
const timedBoostVisible = game.isSpeedSparkTrailActive(player, true) === true;
const idleTimedBoostHidden = game.isSpeedSparkTrailActive(player, false) === false;
player.pickupSprintMs = 0;
player.alive = false;
const deadHidden = game.isSpeedSparkTrailActive(player, true) === false;

const png = existsSync(assetPath) ? inspectPng(assetPath) : { ok: false, error: "missing asset" };
const loaderRegistered = assetsSource.includes('loadImage(assetUrl("/Assets/VisualEffects/speed-spark-trail.png"))')
  && assetsSource.includes("effects: {")
  && assetsSource.includes("speedSparkTrail");
const rendererRegistered = gameAppSource.includes("drawSpeedSparkTrail")
  && gameAppSource.includes("isSpeedSparkTrailActive")
  && gameAppSource.includes("this.assets.effects?.speedSparkTrail")
  && gameAppSource.includes("player.speedLevel > 0")
  && gameAppSource.includes("player.pickupSprintMs");

const conditionPass = idleBaseHidden
  && movingBaseHidden
  && speedLevelVisible
  && timedBoostVisible
  && idleTimedBoostHidden
  && deadHidden;
const pass = png.ok && loaderRegistered && rendererRegistered && conditionPass;

console.log(JSON.stringify({
  assetPath,
  png,
  loaderRegistered,
  rendererRegistered,
  condition: {
    idleBaseHidden,
    movingBaseHidden,
    speedLevelVisible,
    timedBoostVisible,
    idleTimedBoostHidden,
    deadHidden,
    pass: conditionPass,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
