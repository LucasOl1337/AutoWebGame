import { assetUrl } from "./asset-url";

export const SFX_MANIFEST = {
  bombPlace: "/assets/audio/sfx/bomb_place.mp3",
  bombExplode: "/assets/audio/sfx/bomb_explode.mp3",
  flameIgnite: "/assets/audio/sfx/flame_ignite.mp3",
  crateBreak: "/assets/audio/sfx/crate_break.mp3",
  playerDeath: "/assets/audio/sfx/player_death.mp3",
  powerupCollect: "/assets/audio/sfx/powerup_collect.mp3",
  matchStart: "/assets/audio/sfx/match_start.mp3",
  roundWin: "/assets/audio/sfx/round_win.mp3",
  matchWin: "/assets/audio/sfx/match_win.mp3"
} as const;

export type SoundEffectKey = keyof typeof SFX_MANIFEST;

export class SoundManager {
  private buffers: Map<string, AudioBuffer> = new Map();
  private context: AudioContext | null = null;
  private volume: number = 0.5;

  constructor() {}

  async loadSounds(sounds: Record<string, string>) {
    if (typeof window === "undefined") {
      return;
    }
    
    // Create AudioContext only on first interaction or here, modern browsers might suspend it
    if (!this.context) {
      if (window.AudioContext) {
        this.context = new window.AudioContext();
      } else if ((window as any).webkitAudioContext) {
        this.context = new (window as any).webkitAudioContext();
      }
    }

    if (!this.context) return;

    await Promise.all(
      Object.entries(sounds).map(async ([key, path]) => {
        try {
          const url = assetUrl(path);
          const response = await fetch(url);
          if (!response.ok) return;
          const arrayBuffer = await response.arrayBuffer();
          const buffer = await this.context!.decodeAudioData(arrayBuffer);
          this.buffers.set(key, buffer);
        } catch (e) {
          console.error(`Failed to load sound: ${key}`, e);
        }
      })
    );
  }

  playOneShot(key: SoundEffectKey, volScale = 1.0) {
    if (!this.context || !this.buffers.has(key)) return;
    
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    
    source.buffer = this.buffers.get(key)!;
    gainNode.gain.value = this.volume * volScale;
    
    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);
  }
}
