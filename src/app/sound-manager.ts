import { assetUrl } from "./asset-url";

export type SfxKey =
  | "bombPlace"
  | "bombExplode"
  | "crateBreak"
  | "flameIgnite"
  | "matchStart"
  | "roundWin"
  | "matchWin"
  | "playerDeath"
  | "powerupCollect"
  | "shieldBlock"
  | "suddenDeath";

interface SoundDefinition {
  url: string;
  volume: number;
}

const MASTER_VOLUME = 0.5;

export const SFX_MANIFEST: Partial<Record<SfxKey, SoundDefinition>> = {
  bombPlace: { url: assetUrl("/assets/audio/sfx/bomb_place.mp3"), volume: 0.72 * MASTER_VOLUME },
  bombExplode: { url: assetUrl("/assets/audio/sfx/explosion_boom_bak_1_1774651757711.wav"), volume: 1.0 * MASTER_VOLUME },
  matchStart: { url: assetUrl("/assets/audio/sfx/match_start.mp3"), volume: 0.84 * 0.2 * MASTER_VOLUME },
  matchWin: { url: assetUrl("/assets/audio/sfx/match_win.mp3"), volume: 0.9 * MASTER_VOLUME },
  powerupCollect: { url: assetUrl("/assets/audio/sfx/powerup_collect.mp3"), volume: 0.68 * MASTER_VOLUME },
};

export class SoundManager {
  private readonly sounds = new Map<SfxKey, HTMLAudioElement>();
  private unlocked = false;
  private unlockTarget: EventTarget | null = null;

  public async loadSounds(manifest: Partial<Record<SfxKey, SoundDefinition>>): Promise<void> {
    if (typeof Audio === "undefined") {
      return;
    }

    const loads = Object.entries(manifest).map(async ([key, definition]) => {
      const audio = new Audio(definition.url);
      audio.preload = "auto";
      audio.volume = definition.volume;
      this.sounds.set(key as SfxKey, audio);

      try {
        await audio.load();
      } catch {
        // Best-effort preload only.
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
    const base = this.sounds.get(key);
    if (!base || !this.unlocked) {
      return;
    }

    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, base.volume * gain));
    clone.currentTime = 0;
    void clone.play().catch(() => undefined);
  }

  private unbindUnlock(): void {
    if (!this.unlockTarget) {
      return;
    }

    this.unlockTarget = null;
  }
}
