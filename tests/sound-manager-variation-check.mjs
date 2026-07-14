const playedUrls = [];
const playedRates = [];
let mockNowMs = 0;
class MockAudio {
  constructor(url = "") {
    this.url = url;
    this.preload = "none";
    this.volume = 1;
    this.playbackRate = 1;
    this.currentTime = 0;
  }

  load() {
    return Promise.resolve();
  }

  cloneNode() {
    const clone = new MockAudio(this.url);
    clone.volume = this.volume;
    clone.playbackRate = this.playbackRate;
    clone.currentTime = this.currentTime;
    return clone;
  }

  play() {
    playedUrls.push(this.url);
    playedRates.push(this.playbackRate);
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
const powerCollectVariants = SFX_MANIFEST.powerCollect;
const powerCollectManifestPass = Array.isArray(powerCollectVariants)
  && powerCollectVariants.length === 3
  && powerCollectVariants[0]?.url.endsWith("powerup_collect.mp3")
  && powerCollectVariants[1]?.url.endsWith("powerup_collect_bright.mp3")
  && powerCollectVariants[2]?.url.endsWith("powerup_collect_crystal.mp3");
const shieldBlock = SFX_MANIFEST.shieldBlock;
const shieldBlockManifestPass = !Array.isArray(shieldBlock)
  && shieldBlock?.url.endsWith("shield_block_deflect.mp3");

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
const bombPlaceRates = playedRates.filter((_, index) => playedUrls[index]?.endsWith("bomb_place.mp3"));
const bombPlacePlaybackRatePass = bombPlaceRates.length === 2
  && bombPlaceRates[0] === 0.98
  && bombPlaceRates[1] === 1.02;

mockNowMs = 600;
manager.playOneShot("powerCollect");
manager.playOneShot("powerCollect");
await Promise.resolve();
const powerCollectSameFramePass = playedUrls.filter((url) => url.includes("powerup_collect")).length === 1;

mockNowMs = 681;
manager.playOneShot("powerCollect");
await Promise.resolve();
const powerCollectUrls = playedUrls.filter((url) => url.includes("powerup_collect"));
const powerCollectRecoveryPass = powerCollectUrls.length === 2;
const powerCollectVariationPass = powerCollectUrls[0]?.endsWith("powerup_collect.mp3")
  && powerCollectUrls[1]?.endsWith("powerup_collect_bright.mp3");

mockNowMs = 800;
manager.playOneShot("shieldBlock");
manager.playOneShot("shieldBlock");
await Promise.resolve();
const shieldBlockSameFramePass = playedUrls.filter((url) => url.endsWith("shield_block_deflect.mp3")).length === 1;

mockNowMs = 961;
manager.playOneShot("shieldBlock");
await Promise.resolve();
const shieldBlockRecoveryPass = playedUrls.filter((url) => url.endsWith("shield_block_deflect.mp3")).length === 2;

const pass = manifestPass
  && powerCollectManifestPass
  && shieldBlockManifestPass
  && playbackPass
  && antiSpamPass
  && variationPass
  && bombPlaceSameFramePass
  && bombPlaceRecoveryPass
  && bombPlacePlaybackRatePass
  && powerCollectSameFramePass
  && powerCollectRecoveryPass
  && powerCollectVariationPass
  && shieldBlockSameFramePass
  && shieldBlockRecoveryPass;

console.log(JSON.stringify({
  manifestPass,
  powerCollectManifestPass,
  shieldBlockManifestPass,
  playbackPass,
  antiSpamPass,
  variationPass,
  bombPlaceSameFramePass,
  bombPlaceRecoveryPass,
  bombPlacePlaybackRatePass,
  bombPlaceRates,
  powerCollectSameFramePass,
  powerCollectRecoveryPass,
  powerCollectVariationPass,
  shieldBlockSameFramePass,
  shieldBlockRecoveryPass,
  playedUrls,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
