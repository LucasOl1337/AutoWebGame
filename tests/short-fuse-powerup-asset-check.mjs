import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetPath = path.join(repoRoot, "public", "Assets", "UiLayouts", "power-short-fuse.png");
const loadedUrls = [];

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

function paethPredictor(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function unfilterRgba(width, height, inflated) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rows = Buffer.alloc(stride * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? rows[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? rows[prevRowStart + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? rows[prevRowStart + x - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      if (filter === 2) value = raw + up;
      if (filter === 3) value = raw + Math.floor((left + up) / 2);
      if (filter === 4) value = raw + paethPredictor(left, up, upperLeft);
      rows[rowStart + x] = value & 0xff;
    }

    sourceOffset += stride;
  }

  return rows;
}

function inspectPng(filePath) {
  if (!existsSync(filePath)) {
    return { ok: false, error: "missing asset" };
  }

  const buffer = readFileSync(filePath);
  const signatureOk = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  const idat = chunks.filter((chunk) => chunk.type === "IDAT");
  if (!signatureOk || !ihdr || idat.length === 0) {
    return { ok: false, signatureOk, hasIhdr: Boolean(ihdr), idatCount: idat.length };
  }

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const inflated = zlib.inflateSync(Buffer.concat(idat.map((chunk) => chunk.data)));
  const rgba = unfilterRgba(width, height, inflated);
  let transparentPixels = 0;
  let visiblePixels = 0;
  let greenFringePixels = 0;

  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const alpha = rgba[index + 3];
    if (alpha === 0) transparentPixels += 1;
    if (alpha > 20) {
      visiblePixels += 1;
      if (green > 200 && red < 80 && blue < 80) {
        greenFringePixels += 1;
      }
    }
  }

  return {
    ok: width === 64
      && height === 64
      && bitDepth === 8
      && colorType === 6
      && transparentPixels > 0
      && visiblePixels > 300
      && visiblePixels < 3600
      && greenFringePixels === 0,
    signatureOk,
    width,
    height,
    bitDepth,
    colorType,
    transparentPixels,
    visiblePixels,
    greenFringePixels,
  };
}

class MockImage {
  set src(value) {
    this._src = value;
    loadedUrls.push(value);
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this._src;
  }

  decode() {
    return Promise.resolve();
  }
}

Object.defineProperty(globalThis, "Image", { value: MockImage, configurable: true });
Object.defineProperty(globalThis, "fetch", {
  value: async () => ({ ok: false, json: async () => ({}) }),
  configurable: true,
});

const { loadGameAssets } = await import("../output/esm/Engine/assets.js");
const { SKILL_POWER_UP_TYPES } = await import("../output/esm/Gameplay/powerups.js");
const assets = await loadGameAssets();
const expectedPowerUpPaths = {
  "shield-up": "/Assets/UiLayouts/power-shield.png",
  "bomb-pass-up": "/Assets/UiLayouts/power-bomb-pass.png",
  "kick-up": "/Assets/UiLayouts/power-kick.png",
  "short-fuse-up": "/Assets/UiLayouts/power-short-fuse.png",
};
const png = inspectPng(assetPath);
const loadedPowerUpPaths = Object.fromEntries(
  Object.entries(expectedPowerUpPaths).map(([type, url]) => [
    type,
    assets.powerUps[type]?.src === url && loadedUrls.includes(url),
  ]),
);
const allPowerUpTypesMapped = SKILL_POWER_UP_TYPES.every((type) => Object.hasOwn(assets.powerUps, type));
const pass = png.ok
  && Object.values(loadedPowerUpPaths).every(Boolean)
  && allPowerUpTypesMapped;

console.log(JSON.stringify({
  assetPath,
  png,
  loadedPowerUpPaths,
  allPowerUpTypesMapped,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
