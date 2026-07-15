const playedUrls = [];
const playedRates = [];
const playAttempts = [];
let rejectPlayback = true;
let mockNowMs = 0;

class MockAudio {
  constructor(url = "") {
    this.url = url;
    this.preload = "none";
    this.volume = 1;
    this.currentTime = 0;
  }

  cloneNode() {
    const clone = new MockAudio(this.url);
    clone.volume = this.volume;
    clone.currentTime = this.currentTime;
    return clone;
  }

  play() {
    playAttempts.push(this.url);
    if (rejectPlayback) {
      return Promise.reject(new Error("audio output unavailable"));
    }
    playedUrls.push(this.url);
    playedRates.push(this.playbackRate);
    return Promise.resolve();
  }
}

const flushPlayback = () => new Promise((resolve) => setTimeout(resolve, 0));

globalThis.Audio = MockAudio;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: {
    now: () => mockNowMs,
  },
});

const { SoundManager, SFX_MANIFEST } = await import("../output/esm/Engine/sound-manager.js");

Math.random = () => 0;

const manager = new SoundManager();
await manager.loadSounds(SFX_MANIFEST);
manager.unlocked = true;

manager.playOneShot("bombExplode");
await flushPlayback();

const failedAttemptCount = playAttempts.length;
const failedPlaybackPass = failedAttemptCount === 2 && playedUrls.length === 0;

rejectPlayback = false;
mockNowMs = 20;

manager.playOneShot("bombExplode");
await flushPlayback();

const retryAfterFailurePass = playedUrls.length === 1
  && playedUrls[0].includes("bomb_explode");
const attemptsAfterRetry = playAttempts.length;

manager.playOneShot("bombExplode");
await flushPlayback();

const throttlesAfterSuccessfulRetryPass = playedUrls.length === 1
  && playAttempts.length === attemptsAfterRetry;

rejectPlayback = true;
mockNowMs = 200;
manager.playOneShot("bombPlace");
await flushPlayback();

rejectPlayback = false;
mockNowMs = 300;
manager.playOneShot("bombPlace");
await flushPlayback();

mockNowMs = 400;
manager.playOneShot("bombPlace");
await flushPlayback();

const bombPlaceAcceptedRatePass = playedRates.at(-2) === 0.98
  && playedRates.at(-1) === 1.02;

const pass = failedPlaybackPass
  && retryAfterFailurePass
  && throttlesAfterSuccessfulRetryPass
  && bombPlaceAcceptedRatePass;

console.log(JSON.stringify({
  failedAttemptCount,
  failedPlaybackPass,
  retryAfterFailurePass,
  throttlesAfterSuccessfulRetryPass,
  bombPlaceAcceptedRatePass,
  playAttempts,
  playedUrls,
  playedRates,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
