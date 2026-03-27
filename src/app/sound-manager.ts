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

export const SFX_MANIFEST: Record<SfxKey, SoundDefinition> = {
  bombPlace: { url: assetUrl("/assets/audio/sfx/bomb_place.mp3"), volume: 0.72 },
  bombExplode: { url: assetUrl("/assets/audio/sfx/bomb_explode.mp3"), volume: 0.82 },
  crateBreak: { url: assetUrl("/assets/audio/sfx/crate_break.mp3"), volume: 0.62 },
  flameIgnite: { url: assetUrl("/assets/audio/sfx/flame_ignite.mp3"), volume: 0.56 },
  matchStart: { url: assetUrl("/assets/audio/sfx/match_start.mp3"), volume: 0.84 },
  roundWin: { url: assetUrl("/assets/audio/sfx/round_win.mp3"), volume: 0.84 },
  matchWin: { url: assetUrl("/assets/audio/sfx/match_win.mp3"), volume: 0.9 },
  playerDeath: { url: assetUrl("/assets/audio/sfx/player_death.mp3"), volume: 0.88 },
  powerupCollect: { url: assetUrl("/assets/audio/sfx/powerup_collect.mp3"), volume: 0.68 },
  shieldBlock: { url: assetUrl("/assets/audio/sfx/shield_block.mp3"), volume: 0.7 },
  suddenDeath: { url: assetUrl("/assets/audio/sfx/sudden_death.mp3"), volume: 0.72 },
};

export class SoundManager {
  private readonly sounds = new Map<SfxKey, HTMLAudioElement>();
  private unlocked = false;
  private unlockTarget: EventTarget | null = null;

  public async loadSounds(manifest: Record<SfxKey, SoundDefinition>): Promise<void> {
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
