class FakeAudio {
  static playedUrls = [];

  constructor(url) {
    this.url = url;
    this.preload = "none";
    this.volume = 1;
    this.playbackRate = 1;
    this.currentTime = 0;
  }

  cloneNode() {
    const clone = new FakeAudio(this.url);
    clone.volume = this.volume;
    return clone;
  }

  async play() {
    FakeAudio.playedUrls.push(this.url);
  }
}

globalThis.Audio = FakeAudio;
globalThis.window = {};

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

manager.playOneShot("roundEnd");
manager.playOneShot("matchWin");
await Promise.resolve();
await Promise.resolve();

const roundEndPlays = FakeAudio.playedUrls.filter((url) => url.includes("round_end.wav")).length;
const matchWinPlays = FakeAudio.playedUrls.filter((url) => url.includes("match_win.mp3")).length;
const pass = roundEndPlays === 0 && matchWinPlays === 1;

console.log(JSON.stringify({
  playedUrls: FakeAudio.playedUrls,
  roundEndPlays,
  matchWinPlays,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
