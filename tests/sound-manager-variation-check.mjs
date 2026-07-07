const playedUrls = [];
let mockNowMs = 0;
class MockAudio {
  constructor(url = "") {
    this.url = url;
    this.preload = "none";
    this.volume = 1;
    this.currentTime = 0;
  }

  load() {
    return Promise.resolve();
  }

  cloneNode() {
    const clone = new MockAudio(this.url);
    clone.volume = this.volume;
    clone.currentTime = this.currentTime;
    return clone;
  }

  play() {
    playedUrls.push(this.url);
    return Promise.resolve();
  }
}

globalThis.Audio = MockAudio;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: {
    now: () => mockNowMs,
  },
});

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

Math.random = () => 0;

const explosionVariants = SFX_MANIFEST.bombExplode;
const manifestPass = Array.isArray(explosionVariants)
  && explosionVariants.length === 2
  && explosionVariants[0]?.url.endsWith("bomb_explode_default.mp3")
  && explosionVariants[1]?.url.endsWith("bomb_explode_main.mp3");

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

manager.playOneShot("bombExplode");
manager.playOneShot("bombExplode");
await Promise.resolve();
const playbackPass = playedUrls.length === 1
  && playedUrls[0] === "/Assets/SoundEffects/bomb_explode_default.mp3";

mockNowMs = 200;
manager.playOneShot("bombExplode");
await Promise.resolve();
const antiSpamPass = playedUrls.length === 2;
const variationPass = playedUrls[1] === "/Assets/SoundEffects/bomb_explode_main.mp3";

mockNowMs = 400;
manager.playOneShot("bombPlace");
manager.playOneShot("bombPlace");
await Promise.resolve();
const bombPlaceSameFramePass = playedUrls.filter((url) => url.endsWith("bomb_place.mp3")).length === 1;

mockNowMs = 446;
manager.playOneShot("bombPlace");
await Promise.resolve();
const bombPlaceRecoveryPass = playedUrls.filter((url) => url.endsWith("bomb_place.mp3")).length === 2;

mockNowMs = 600;
manager.playOneShot("powerCollect");
manager.playOneShot("powerCollect");
await Promise.resolve();
const powerCollectSameFramePass = playedUrls.filter((url) => url.endsWith("powerup_collect.mp3")).length === 1;

mockNowMs = 681;
manager.playOneShot("powerCollect");
await Promise.resolve();
const powerCollectRecoveryPass = playedUrls.filter((url) => url.endsWith("powerup_collect.mp3")).length === 2;

const pass = manifestPass
  && playbackPass
  && antiSpamPass
  && variationPass
  && bombPlaceSameFramePass
  && bombPlaceRecoveryPass
  && powerCollectSameFramePass
  && powerCollectRecoveryPass;

console.log(JSON.stringify({
  manifestPass,
  playbackPass,
  antiSpamPass,
  variationPass,
  bombPlaceSameFramePass,
  bombPlaceRecoveryPass,
  powerCollectSameFramePass,
  powerCollectRecoveryPass,
  playedUrls,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
