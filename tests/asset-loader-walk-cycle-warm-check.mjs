const imageRequests = [];
const pendingWalkLoads = [];

globalThis.fetch = async () => ({ ok: false });

class FakeImage {
  onload = null;
  onerror = null;
  naturalWidth = 32;
  naturalHeight = 48;
  width = 32;
  height = 48;
  #src = "";

  get src() {
    return this.#src;
  }

  set src(value) {
    this.#src = String(value);
    imageRequests.push(this.#src);

    if (this.#src.includes("-walk-")) {
      pendingWalkLoads.push(() => this.onload?.());
      return;
    }

    queueMicrotask(() => this.onload?.());
  }

  async decode() {}
}

globalThis.Image = FakeImage;

const { loadGameAssets } = await import("../output/esm/Engine/assets.js");

const timeoutMs = 60;
const result = await Promise.race([
  loadGameAssets().then((assets) => ({ type: "assets", assets })),
  new Promise((resolve) => {
    setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
  }),
]);

const returnedBeforeWalkFrames =
  result.type === "assets"
  && pendingWalkLoads.length === 96
  && result.assets.players[1]?.walk.down.length === 0
  && result.assets.players[2]?.walk.down.length === 0;

for (const finishWalkLoad of pendingWalkLoads.splice(0)) {
  finishWalkLoad();
}

await new Promise((resolve) => {
  setTimeout(resolve, 0);
});

const playerOneWalk = result.type === "assets" ? result.assets.players[1]?.walk : null;
const playerTwoWalk = result.type === "assets" ? result.assets.players[2]?.walk : null;
const hydratedAfterWarm =
  playerOneWalk?.down.length === 12
  && playerOneWalk.right.length === 12
  && playerOneWalk.up.length === 12
  && playerOneWalk.left.length === 12
  && playerTwoWalk?.down.length === 12
  && playerTwoWalk.right.length === 12
  && playerTwoWalk.up.length === 12
  && playerTwoWalk.left.length === 12;

const pass = returnedBeforeWalkFrames && hydratedAfterWarm;

console.log(
  JSON.stringify(
    {
      resultType: result.type,
      imageRequests: imageRequests.length,
      returnedBeforeWalkFrames,
      hydratedAfterWarm,
      pendingWalkLoadsAfterHydrate: pendingWalkLoads.length,
      playerOneWalkDownFrames: playerOneWalk?.down.length ?? null,
      playerTwoWalkDownFrames: playerTwoWalk?.down.length ?? null,
      pass,
    },
    null,
    2,
  ),
);

if (!pass) {
  process.exit(1);
}
