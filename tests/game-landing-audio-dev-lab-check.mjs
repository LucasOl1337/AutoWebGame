import fs from "node:fs";

const sound = fs.readFileSync(new URL("../src/Engine/sound-manager.ts", import.meta.url), "utf8");
const game = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const session = fs.readFileSync(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const checks = {
  persistentKeys: sound.includes('AUDIO_VOLUME_STORAGE_KEY = "bomba-audio-volume"')
    && sound.includes('AUDIO_MUTED_STORAGE_KEY = "bomba-audio-muted"'),
  runtimeControls: game.includes("setAudioVolume(volume: number)")
    && game.includes("setAudioMuted(muted: boolean)")
    && game.includes("getAudioSettings()")
    && !game.includes("this.getLocalStorage()?.setItem(AUDIO_VOLUME_STORAGE_KEY")
    && !game.includes("this.getLocalStorage()?.setItem(AUDIO_MUTED_STORAGE_KEY")
    && game.includes("this.writeStorageItem(AUDIO_VOLUME_STORAGE_KEY")
    && game.includes("this.writeStorageItem(AUDIO_MUTED_STORAGE_KEY"),
  quietMaster: sound.includes("const MASTER_VOLUME = 0.38"),
  landingControls: session.includes("experience-audio__range")
    && session.includes("renderAudioControls()"),
  devLabRoutes: session.includes('devBotVsBot.href = "?autobot=3"')
    && session.includes('devExternalModels.href = "?autobot=3&codexbot=1,2,3,4"')
    && session.includes("landingDevLab.hidden = !import.meta.env?.DEV"),
  responsiveLanding: css.includes("@media (max-width: 560px)")
    && css.includes(".experience-audio, .experience-dev-lab"),
};

const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ...checks, pass }, null, 2));
if (!pass) process.exit(1);
