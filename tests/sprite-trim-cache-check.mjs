const contextOptions = [];
let getImageDataCalls = 0;
let canvasWidthWrites = 0;
let canvasHeightWrites = 0;

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
  _width: 0,
  _height: 0,
  get width() {
    return this._width;
  },
  set width(value) {
    canvasWidthWrites += 1;
    this._width = value;
  },
  get height() {
    return this._height;
  },
  set height(value) {
    canvasHeightWrites += 1;
    this._height = value;
  },
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
const lateSprite = { naturalWidth: 0, naturalHeight: 0, width: 0, height: 0 };
const sprite = { naturalWidth: 4, naturalHeight: 4, width: 4, height: 4 };

const beforeLoad = cache.getBounds(lateSprite);
lateSprite.naturalWidth = 4;
lateSprite.naturalHeight = 4;
lateSprite.width = 4;
lateSprite.height = 4;
const afterLoad = cache.getBounds(lateSprite);
const afterLoadCached = cache.getBounds(lateSprite);
const first = cache.getBounds(sprite);
const second = cache.getBounds(sprite);

const pass = Boolean(first)
  && first.x === 1
  && first.y === 1
  && first.width === 2
  && first.height === 2
  && beforeLoad === null
  && Boolean(afterLoad)
  && afterLoad.x === 1
  && afterLoad.y === 1
  && afterLoad.width === 2
  && afterLoad.height === 2
  && afterLoadCached === afterLoad
  && second === first
  && getImageDataCalls === 2
  && canvasWidthWrites === 1
  && canvasHeightWrites === 1
  && contextOptions.length === 1
  && contextOptions[0]?.willReadFrequently === true;

console.log(JSON.stringify({
  beforeLoad,
  afterLoad,
  afterLoadCachedMatches: afterLoadCached === afterLoad,
  first,
  secondMatchesFirst: second === first,
  getImageDataCalls,
  canvasWidthWrites,
  canvasHeightWrites,
  contextOptions,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
