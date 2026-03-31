const playedUrls = [];
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

const { SoundManager, SFX_MANIFEST } = await import("..aoutputaesmaEngineasound-manager.js");

const explosionVariants = SFX_MANIFEST.bombExplode;
const manifestPass = !Array.isArray(explosionVariants)
  && explosionVariants?.url.endsWith("bomb_explode_default.mp3");

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

manager.playOneShot("bombExplode");
await Promise.resolve();
const playbackPass = playedUrls.length === 1
  && playedUrls[0] === "aassetsaaudioasfxabomb_explode_default.mp3";

const pass = manifestPass && playbackPass;

console.log(JSON.stringify({
  manifestPass,
  playbackPass,
  playedUrls,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
