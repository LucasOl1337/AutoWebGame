import { assetUrl } from "./asset-url";

export type SfxKey =
  | "bombPlace"
  | "bombExplode"
  | "crateBreak"
  | "flames"
  | "matchStart"
  | "roundEnd"
  | "matchWin"
  | "powerCollect"
  | "shieldBlock"
  | "suddenDeathAlarm";

interface SoundDefinition {
  url: string;
  volume: number;
}

type SoundManifestEntry = SoundDefinition | SoundDefinition[];

interface SoundPlaybackPolicy {
  minIntervalMs?: number;
}

const MASTER_VOLUME = 0.38;
export const AUDIO_VOLUME_STORAGE_KEY = "bomba-audio-volume";
export const AUDIO_MUTED_STORAGE_KEY = "bomba-audio-muted";

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}
const SFX_PLAYBACK_POLICIES: Partial<Record<SfxKey, SoundPlaybackPolicy>> = {
  bombPlace: { minIntervalMs: 45 },
  bombExplode: { minIntervalMs: 140 },
  crateBreak: { minIntervalMs: 90 },
  flames: { minIntervalMs: 110 },
  powerCollect: { minIntervalMs: 80 },
  shieldBlock: { minIntervalMs: 160 },
  suddenDeathAlarm: { minIntervalMs: 1200 },
};

export const SFX_MANIFEST: Partial<Record<SfxKey, SoundManifestEntry>> = {
  bombPlace: { url: assetUrl("/Assets/SoundEffects/bomb_place.mp3"), volume: 0.72 * MASTER_VOLUME },
  bombExplode: [
    { url: assetUrl("/Assets/SoundEffects/bomb_explode_default.mp3"), volume: 0.84 * MASTER_VOLUME },
    { url: assetUrl("/Assets/SoundEffects/bomb_explode_main.mp3"), volume: 0.78 * MASTER_VOLUME },
  ],
  crateBreak: { url: assetUrl("/Assets/SoundEffects/shield_block_deflect.mp3"), volume: 0.5 * MASTER_VOLUME },
  flames: { url: assetUrl("/Assets/SoundEffects/flames.mp3"), volume: 0.74 * MASTER_VOLUME },
  matchStart: { url: assetUrl("/Assets/SoundEffects/match_start.mp3"), volume: 0.84 * 0.45 * MASTER_VOLUME },
  roundEnd: { url: assetUrl("/Assets/SoundEffects/round_end.wav"), volume: 0.76 * MASTER_VOLUME },
  matchWin: { url: assetUrl("/Assets/SoundEffects/match_win.mp3"), volume: 0.9 * MASTER_VOLUME },
  powerCollect: [
    { url: assetUrl("/Assets/SoundEffects/powerup_collect.mp3"), volume: 0.68 * MASTER_VOLUME },
    { url: assetUrl("/Assets/SoundEffects/powerup_collect_bright.mp3"), volume: 0.58 * MASTER_VOLUME },
    { url: assetUrl("/Assets/SoundEffects/powerup_collect_crystal.mp3"), volume: 0.52 * MASTER_VOLUME },
  ],
  shieldBlock: { url: assetUrl("/Assets/SoundEffects/shield_block_deflect.mp3"), volume: 0.64 * MASTER_VOLUME },
  suddenDeathAlarm: { url: assetUrl("/Assets/SoundEffects/sudden_death_alarm.wav"), volume: 0.8 * MASTER_VOLUME },
};

export class SoundManager {
  private readonly sounds = new Map<SfxKey, HTMLAudioElement[]>();
  private readonly lastPlayAtMs = new Map<SfxKey, number>();
  private readonly lastVariantIndexByKey = new Map<SfxKey, number>();
  private readonly playbackRateIndexByKey = new Map<SfxKey, number>();
  private bombPlacePlaybackRateIndex = 0;
  private roundEndRequestId = 0;
  private unlocked = false;
  private unlockTarget: EventTarget | null = null;
  private unlockListener: EventListener | null = null;
  private volume = 0.7;
  private muted = false;

  public setVolume(volume: number): void {
    this.volume = clampVolume(volume);
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public async loadSounds(manifest: Partial<Record<SfxKey, SoundManifestEntry>>): Promise<void> {
    if (typeof Audio === "undefined") {
      return;
    }

    const loads = Object.entries(manifest).map(async ([key, definition]) => {
      const variants = Array.isArray(definition) ? definition : [definition];
      const audioVariants = variants.map((entry) => {
        const audio = new Audio(entry.url);
        audio.preload = "auto";
        audio.volume = entry.volume;
        return audio;
      });
      this.sounds.set(key as SfxKey, audioVariants);

      for (const audio of audioVariants) {
        audio.preload = "none";
      }
    });

    await Promise.all(loads);
  }

  public bindUnlock(target: EventTarget): void {
    if (typeof window === "undefined" || this.unlocked || this.unlockTarget) {
      return;
    }

    this.unlockTarget = target;
    const unlock: EventListener = (): void => {
      this.unlocked = true;
      this.unbindUnlock();
    };
    this.unlockListener = unlock;

    target.addEventListener("pointerdown", unlock, { once: true, capture: true });
    target.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  public playOneShot(key: SfxKey, gain = 1): void {
    if (key === "roundEnd") {
      const requestId = ++this.roundEndRequestId;
      queueMicrotask(() => {
        if (requestId === this.roundEndRequestId) {
          this.playOneShotNow(key, gain);
        }
      });
      return;
    }
    if (key === "matchWin") {
      this.roundEndRequestId += 1;
    }

    this.playOneShotNow(key, gain);
  }

  private playOneShotNow(key: SfxKey, gain: number): void {
    const variants = this.sounds.get(key);
    if (!variants || variants.length === 0 || !this.unlocked || this.muted || this.volume <= 0) {
      return;
    }

    const nowMs = this.getNowMs();
    const policy = SFX_PLAYBACK_POLICIES[key];
    if (policy?.minIntervalMs !== undefined) {
      const lastPlayAtMs = this.lastPlayAtMs.get(key);
      if (lastPlayAtMs !== undefined && nowMs - lastPlayAtMs < policy.minIntervalMs) {
        return;
      }
      this.lastPlayAtMs.set(key, nowMs);
    }

    const startIndex = this.selectVariantIndex(key, variants.length);
    const playbackRate = key === "bombPlace"
      ? this.selectBombPlacePlaybackRate()
      : this.selectDeterministicPlaybackRate(key);

    const throttleMarkedAtMs = policy?.minIntervalMs !== undefined ? nowMs : null;
    void this.playVariantWithFallback(variants, startIndex, gain, playbackRate).then((playedVariantIndex) => {
      if (playedVariantIndex !== null && key === "bombExplode") {
        this.lastVariantIndexByKey.set(key, playedVariantIndex);
      }
      if (playedVariantIndex === null && key === "bombPlace") {
        this.rewindBombPlacePlaybackRate();
      }
      if (playedVariantIndex === null && throttleMarkedAtMs !== null && this.lastPlayAtMs.get(key) === throttleMarkedAtMs) {
        this.lastPlayAtMs.delete(key);
      }
    });
  }

  private selectVariantIndex(key: SfxKey, variantCount: number): number {
    if (variantCount <= 1) {
      this.lastVariantIndexByKey.set(key, 0);
      return 0;
    }

    const previousIndex = this.lastVariantIndexByKey.get(key);
    let nextIndex: number;
    if (key === "bombExplode" || key === "powerCollect") {
      nextIndex = previousIndex === undefined ? 0 : (previousIndex + 1) % variantCount;
    } else {
      nextIndex = Math.floor(Math.random() * variantCount);
      if (previousIndex !== undefined && nextIndex === previousIndex) {
        nextIndex = (nextIndex + 1) % variantCount;
      }
    }
    if (key !== "bombExplode") {
      this.lastVariantIndexByKey.set(key, nextIndex);
    }
    return nextIndex;
  }

  private selectBombPlacePlaybackRate(): number {
    const rates = [0.98, 1.02] as const;
    const rate = rates[this.bombPlacePlaybackRateIndex];
    this.bombPlacePlaybackRateIndex = (this.bombPlacePlaybackRateIndex + 1) % rates.length;
    return rate;
  }

  private rewindBombPlacePlaybackRate(): void {
    const rateCount = 2;
    this.bombPlacePlaybackRateIndex = (this.bombPlacePlaybackRateIndex + rateCount - 1) % rateCount;
  }

  private selectDeterministicPlaybackRate(key: SfxKey): number {
    if (key !== "crateBreak") {
      return 1;
    }

    const rates = [0.72, 0.76] as const;
    const index = this.playbackRateIndexByKey.get(key) ?? 0;
    this.playbackRateIndexByKey.set(key, (index + 1) % rates.length);
    return rates[index];
  }

  private async playVariantWithFallback(
    variants: HTMLAudioElement[],
    startIndex: number,
    gain: number,
    playbackRate: number,
  ): Promise<number | null> {
    for (let attempt = 0; attempt < variants.length; attempt += 1) {
      const variantIndex = (startIndex + attempt) % variants.length;
      const base = variants[variantIndex];
      const clone = base.cloneNode(true) as HTMLAudioElement;
      clone.volume = clampVolume(base.volume * gain * this.volume);
      clone.playbackRate = playbackRate;
      clone.currentTime = 0;

      try {
        await clone.play();
        return variantIndex;
      } catch {
        // Try the next variation if the chosen one fails.
      }
    }
    return null;
  }

  private unbindUnlock(): void {
    if (!this.unlockTarget || !this.unlockListener) {
      this.unlockTarget = null;
      this.unlockListener = null;
      return;
    }

    this.unlockTarget.removeEventListener?.("pointerdown", this.unlockListener, true);
    this.unlockTarget.removeEventListener?.("keydown", this.unlockListener, true);
    this.unlockTarget = null;
    this.unlockListener = null;
  }

  private getNowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
}
