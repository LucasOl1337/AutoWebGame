const loadCalls = [];
const playedUrls = [];

class MockAudio {
  constructor(url = "") {
    this.url = url;
    this.preload = "auto";
    this.volume = 1;
    this.currentTime = 0;
  }

  load() {
    loadCalls.push(this.url);
    return Promise.resolve();
  }

  cloneNode() {
    const clone = new MockAudio(this.url);
    clone.preload = this.preload;
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

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

const entries = Object.values(SFX_MANIFEST)
  .flatMap((definition) => (Array.isArray(definition) ? definition : [definition]))
  .filter(Boolean);

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;
manager.playOneShot("bombPlace");
await Promise.resolve();

const pass = loadCalls.length === 0
  && entries.length === 12
  && playedUrls.length === 1
  && playedUrls[0].endsWith("bomb_place.mp3");

console.log(JSON.stringify({
  manifestEntries: entries.length,
  audioLoadCallsDuringLoadSounds: loadCalls.length,
  playedUrls,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
