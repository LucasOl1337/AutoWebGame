import { assetUrl } from "./asset-url";

export type SfxKey =
  | "bombPlace"
  | "bombExplode"
  | "flames"
  | "matchStart"
  | "roundEnd"
  | "matchWin"
  | "powerCollect"
  | "suddenDeathAlarm";

interface SoundDefinition {
  url: string;
  volume: number;
}

type SoundManifestEntry = SoundDefinition | SoundDefinition[];

interface SoundPlaybackPolicy {
  minIntervalMs?: number;
}

const MASTER_VOLUME = 0.5;
const SFX_PLAYBACK_POLICIES: Partial<Record<SfxKey, SoundPlaybackPolicy>> = {
  bombExplode: { minIntervalMs: 140 },
  flames: { minIntervalMs: 110 },
  suddenDeathAlarm: { minIntervalMs: 1200 },
};

export const SFX_MANIFEST: Partial<Record<SfxKey, SoundManifestEntry>> = {
  bombPlace: { url: assetUrl("/Assets/SoundEffects/bomb_place.mp3"), volume: 0.72 * MASTER_VOLUME },
  bombExplode: { url: assetUrl("/Assets/SoundEffects/bomb_explode_default.mp3"), volume: 0.84 * MASTER_VOLUME },
  flames: { url: assetUrl("/Assets/SoundEffects/flames.mp3"), volume: 0.74 * MASTER_VOLUME },
  matchStart: { url: assetUrl("/Assets/SoundEffects/match_start.mp3"), volume: 0.84 * 0.2 * MASTER_VOLUME },
  roundEnd: { url: assetUrl("/Assets/SoundEffects/round_end.wav"), volume: 0.76 * MASTER_VOLUME },
  matchWin: { url: assetUrl("/Assets/SoundEffects/match_win.mp3"), volume: 0.9 * MASTER_VOLUME },
  powerCollect: { url: assetUrl("/Assets/SoundEffects/powerup_collect.mp3"), volume: 0.68 * MASTER_VOLUME },
  suddenDeathAlarm: { url: assetUrl("/Assets/SoundEffects/sudden_death_alarm.wav"), volume: 0.8 * MASTER_VOLUME },
};

export class SoundManager {
  private readonly sounds = new Map<SfxKey, HTMLAudioElement[]>();
  private readonly lastPlayAtMs = new Map<SfxKey, number>();
  private unlocked = false;
  private unlockTarget: EventTarget | null = null;

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
        try {
          await audio.load();
        } catch {
          // Best-effort preload only.
        }
      }
    });

    await Promise.all(loads);
  }

  public bindUnlock(target: EventTarget): void {
    if (typeof window === "undefined" || this.unlockTarget) {
      return;
    }

    this.unlockTarget = target;
    const unlock = (): void => {
      this.unlocked = true;
      this.unbindUnlock();
    };

    target.addEventListener("pointerdown", unlock, { once: true, capture: true });
    target.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  public playOneShot(key: SfxKey, gain = 1): void {
    const variants = this.sounds.get(key);
    if (!variants || variants.length === 0 || !this.unlocked) {
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

    const startIndex = variants.length === 1
      ? 0
      : Math.floor(Math.random() * variants.length);

    void this.playVariantWithFallback(variants, startIndex, gain);
  }

  private async playVariantWithFallback(
    variants: HTMLAudioElement[],
    startIndex: number,
    gain: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < variants.length; attempt += 1) {
      const base = variants[(startIndex + attempt) % variants.length];
      const clone = base.cloneNode(true) as HTMLAudioElement;
      clone.volume = Math.max(0, Math.min(1, base.volume * gain));
      clone.currentTime = 0;

      try {
        await clone.play();
        return;
      } catch {
        // Try the next variation if the chosen one fails.
      }
    }
  }

  private unbindUnlock(): void {
    if (!this.unlockTarget) {
      return;
    }

    this.unlockTarget = null;
  }

  private getNowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
}
