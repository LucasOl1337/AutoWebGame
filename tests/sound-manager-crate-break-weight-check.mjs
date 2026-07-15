const played = [];
let mockNowMs = 0;

class MockAudio {
  constructor(url = "") {
    this.url = url;
    this.preload = "none";
    this.volume = 1;
    this.playbackRate = 1;
    this.currentTime = 0;
  }

  cloneNode() {
    const clone = new MockAudio(this.url);
    clone.volume = this.volume;
    clone.playbackRate = this.playbackRate;
    return clone;
  }

  play() {
    played.push({ url: this.url, playbackRate: this.playbackRate });
    return Promise.resolve();
  }
}

globalThis.Audio = MockAudio;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: { now: () => mockNowMs },
});

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");
const crateBreak = SFX_MANIFEST.crateBreak;
const shieldBlock = SFX_MANIFEST.shieldBlock;
const sharedAssetPass = !Array.isArray(crateBreak)
  && !Array.isArray(shieldBlock)
  && crateBreak?.url === shieldBlock?.url
  && crateBreak?.url.endsWith("shield_block_deflect.mp3");

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

manager.playOneShot("crateBreak");
await Promise.resolve();
mockNowMs = 91;
manager.playOneShot("crateBreak");
await Promise.resolve();
mockNowMs = 182;
manager.playOneShot("crateBreak");
await Promise.resolve();
mockNowMs = 400;
manager.playOneShot("shieldBlock");
await Promise.resolve();

const crateRates = played.slice(0, 3).map(({ playbackRate }) => playbackRate);
const shieldRate = played[3]?.playbackRate;
const deterministicPass = crateRates.length === 3
  && crateRates[0] === 0.72
  && crateRates[1] === 0.76
  && crateRates[2] === 0.72;
const distinctionPass = shieldRate === 1
  && crateRates.every((rate) => rate <= 0.76 && rate < shieldRate);
const playbackAssetPass = played.length === 4
  && played.every(({ url }) => url.endsWith("shield_block_deflect.mp3"));
const pass = sharedAssetPass && deterministicPass && distinctionPass && playbackAssetPass;

console.log(JSON.stringify({
  sharedAssetPass,
  deterministicPass,
  distinctionPass,
  playbackAssetPass,
  crateRates,
  shieldRate,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
