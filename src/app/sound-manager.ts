import { assetUrl } from "./asset-url";

export type SfxKey =
  | "bombPlace"
  | "bombExplode"
  | "flames"
  | "matchStart"
  | "matchWin"
  | "powerCollect";

interface SoundDefinition {
  url: string;
  volume: number;
}

type SoundManifestEntry = SoundDefinition | SoundDefinition[];

const MASTER_VOLUME = 0.5;

export const SFX_MANIFEST: Partial<Record<SfxKey, SoundManifestEntry>> = {
  bombPlace: { url: assetUrl("/assets/audio/sfx/bomb_place.mp3"), volume: 0.72 * MASTER_VOLUME },
  bombExplode: [
    { url: assetUrl("/assets/audio/sfx/bomb_explode_default.mp3"), volume: 0.84 * MASTER_VOLUME },
    { url: assetUrl("/assets/audio/sfx/bomb_explode_main.mp3"), volume: 0.92 * MASTER_VOLUME },
  ],
  flames: { url: assetUrl("/assets/audio/sfx/flames.mp3"), volume: 0.74 * MASTER_VOLUME },
  matchStart: { url: assetUrl("/assets/audio/sfx/match_start.mp3"), volume: 0.84 * 0.2 * MASTER_VOLUME },
  matchWin: { url: assetUrl("/assets/audio/sfx/match_win.mp3"), volume: 0.9 * MASTER_VOLUME },
  powerCollect: { url: assetUrl("/assets/audio/sfx/powerup_collect.mp3"), volume: 0.68 * MASTER_VOLUME },
};

export class SoundManager {
  private readonly sounds = new Map<SfxKey, HTMLAudioElement[]>();
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
}
