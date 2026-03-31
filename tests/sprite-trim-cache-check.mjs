const contextOptions = [];
let getImageDataCalls = 0;

const alphaGrid = new Uint8ClampedArray(4 * 4 * 4);
for (const [x, y] of [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
]) {
  const alphaIndex = (y * 4 + x) * 4 + 3;
  alphaGrid[alphaIndex] = 255;
}

const fakeContext = {
  clearRect: () => {},
  drawImage: () => {},
  getImageData: () => {
    getImageDataCalls += 1;
    return { data: alphaGrid };
  },
};

const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: (_kind, options) => {
    contextOptions.push(options ?? null);
    return fakeContext;
  },
};

globalThis.document = {
  createElement: () => fakeCanvas,
};

const { SpriteTrimCache } = await import("../output/esm/Engine/sprite-trim-cache.js");

const cache = new SpriteTrimCache();
const sprite = { naturalWidth: 4, naturalHeight: 4, width: 4, height: 4 };

const first = cache.getBounds(sprite);
const second = cache.getBounds(sprite);

const pass = Boolean(first)
  && first.x === 1
  && first.y === 1
  && first.width === 2
  && first.height === 2
  && second === first
  && getImageDataCalls === 1
  && contextOptions.length === 1
  && contextOptions[0]?.willReadFrequently === true;

console.log(JSON.stringify({
  first,
  secondMatchesFirst: second === first,
  getImageDataCalls,
  contextOptions,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
