const playedUrls = [];
const failedUrls = new Set();

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
    if (failedUrls.has(this.url)) {
      return Promise.reject(new Error(`Failed to play ${this.url}`));
    }
    return Promise.resolve();
  }
}

globalThis.Audio = MockAudio;

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/app/sound-manager.js");

const explosionVariants = SFX_MANIFEST.bombExplode;
const manifestPass = Array.isArray(explosionVariants)
  && explosionVariants.length === 2
  && explosionVariants.some((entry) => entry.url.endsWith("bomb_explode_default.mp3"))
  && explosionVariants.some((entry) => entry.url.endsWith("bomb_explode_main.mp3"));

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

const originalRandom = Math.random;

Math.random = () => 0;
manager.playOneShot("bombExplode");
await Promise.resolve();

Math.random = () => 0.999999;
manager.playOneShot("bombExplode");
await Promise.resolve();

failedUrls.add("/assets/audio/sfx/bomb_explode_default.mp3");
Math.random = () => 0;
manager.playOneShot("bombExplode");
await Promise.resolve();
await Promise.resolve();

Math.random = originalRandom;

const selectedBothPass = playedUrls.includes("/assets/audio/sfx/bomb_explode_default.mp3")
  && playedUrls.includes("/assets/audio/sfx/bomb_explode_main.mp3");
const fallbackPass = playedUrls.slice(-2).join("|") === "/assets/audio/sfx/bomb_explode_default.mp3|/assets/audio/sfx/bomb_explode_main.mp3";

const pass = manifestPass && selectedBothPass && fallbackPass;

console.log(JSON.stringify({
  manifestPass,
  selectedBothPass,
  fallbackPass,
  playedUrls,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
