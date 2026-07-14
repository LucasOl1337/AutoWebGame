import { readFile } from "node:fs/promises";

Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });

const noop = () => {};
const listeners = new Map();
const preventedCodes = [];
const fakeWindow = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: (event, handler) => {
    listeners.set(event, handler);
  },
  requestAnimationFrame: noop,
};

const fakeCtx = {
  imageSmoothingEnabled: false,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fill: noop,
  stroke: noop,
  arc: noop,
  ellipse: noop,
  drawImage: noop,
  fillText: noop,
  strokeText: noop,
  save: noop,
  restore: noop,
  translate: noop,
  rotate: noop,
  setTransform: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  setAttribute: noop,
  getContext: () => fakeCtx,
  requestFullscreen: async () => {},
};

globalThis.window = fakeWindow;
globalThis.document = {
  fullscreenElement: null,
  visibilityState: "visible",
  createElement: () => fakeCanvas,
  addEventListener: noop,
  exitFullscreen: async () => {},
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { KEY_BINDINGS } = await import("../output/esm/PersonalConfig/config.js");
const { NICO_CHARACTER_ID } = await import("../output/esm/ultimate/skill-registry.js");

const sprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [] },
  cast: { up: [], down: [], left: [], right: [] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};

const game = new GameApp(
  { appendChild: noop },
  {
    players: { 1: sprites, 2: sprites },
    characterRoster: [
      { id: "plain", name: "Plain", size: null, sprites, order: 0 },
      { id: NICO_CHARACTER_ID, name: "Nico", size: null, sprites, order: 1 },
    ],
    floor: { base: null, lane: null, spawn: null },
    props: { wall: null, crate: null, bomb: null, flame: null },
    powerUps: {
      "bomb-up": null,
      "flame-up": null,
      "speed-up": null,
      "remote-up": null,
      "shield-up": null,
      "bomb-pass": null,
      "kick-up": null,
      "short-fuse": null,
    },
  },
);

function resetSkill(player) {
  player.skill.phase = "idle";
  player.skill.channelRemainingMs = 0;
  player.skill.cooldownRemainingMs = 0;
  player.skill.castElapsedMs = 0;
  player.skill.projectedPosition = null;
  player.skill.projectedLastMoveDirection = null;
}

game.mode = "match";
game.activePlayerIds = [1, 2];
game.botControlledPlayers[1] = false;
game.botControlledPlayers[2] = false;
game.players[1].active = true;
game.players[2].active = true;
game.players[1].alive = true;
game.players[2].alive = true;
game.players[1].spawnProtectionMs = 0;
game.players[2].spawnProtectionMs = 0;
game.selectedCharacterIndex[2] = 1;

const skillCode = KEY_BINDINGS[2].skill;
const keydown = listeners.get("keydown");
keydown?.({
  code: skillCode,
  repeat: false,
  target: null,
  preventDefault: () => preventedCodes.push(skillCode),
});

game.update(17);
const started = {
  id: game.players[2].skill.id,
  phase: game.players[2].skill.phase,
  castElapsedMs: game.players[2].skill.castElapsedMs,
};
game.update(17);
const heldCastElapsedMs = game.players[2].skill.castElapsedMs;

listeners.get("keyup")?.({ code: skillCode, target: null, preventDefault: noop });
game.update(17);
game.automationMode = true;
game.automationControlledPlayer = 2;
keydown?.({ code: skillCode, repeat: false, target: null, preventDefault: noop });
game.update(17);
const automationStarted = {
  phase: game.players[2].skill.phase,
  castElapsedMs: game.players[2].skill.castElapsedMs,
};
game.update(17);
const automationHeldCastElapsedMs = game.players[2].skill.castElapsedMs;

listeners.get("keyup")?.({ code: skillCode, target: null, preventDefault: noop });
game.update(17);
game.automationMode = false;
game.botControlledPlayers[2] = true;
resetSkill(game.players[2]);
keydown?.({ code: skillCode, repeat: false, target: null, preventDefault: noop });
game.update(17);
const botPhaseAfterHumanSkillKey = game.players[2].skill.phase;

listeners.get("keyup")?.({ code: skillCode, target: null, preventDefault: noop });
game.botControlledPlayers[2] = false;
game.automationMode = true;
game.automationControlledPlayer = 1;
resetSkill(game.players[2]);
keydown?.({ code: skillCode, repeat: false, target: null, preventDefault: noop });
game.update(17);
const unselectedAutomationPhase = game.players[2].skill.phase;

listeners.get("keyup")?.({ code: skillCode, target: null, preventDefault: noop });
game.automationMode = false;
game.selectedCharacterIndex[1] = 1;
resetSkill(game.players[1]);
keydown?.({ code: KEY_BINDINGS[1].skill, repeat: false, target: null, preventDefault: noop });
game.update(17);
const playerOneStarted = {
  phase: game.players[1].skill.phase,
  castElapsedMs: game.players[1].skill.castElapsedMs,
};
game.update(17);
const playerOneHeldCastElapsedMs = game.players[1].skill.castElapsedMs;

const guideSource = await readFile(new URL("../how-to-play.html", import.meta.url), "utf8");
const guideShowsBothSkillKeys = /<kbd>Space<\/kbd><kbd>I<\/kbd>/.test(guideSource)
  && guideSource.includes("P1 usa Espaco e P2 usa I");

const report = {
  skillCode,
  started,
  heldCastElapsedMs,
  automationStarted,
  automationHeldCastElapsedMs,
  botPhaseAfterHumanSkillKey,
  unselectedAutomationPhase,
  playerOneStarted,
  playerOneHeldCastElapsedMs,
  guideShowsBothSkillKeys,
  prevented: preventedCodes.includes(skillCode),
  pass: skillCode === "KeyI"
    && started.id === "nico-arcane-beam"
    && started.phase === "channeling"
    && heldCastElapsedMs > started.castElapsedMs
    && automationStarted.phase === "channeling"
    && automationHeldCastElapsedMs > automationStarted.castElapsedMs
    && botPhaseAfterHumanSkillKey === "idle"
    && unselectedAutomationPhase === "idle"
    && KEY_BINDINGS[1].skill === "Space"
    && playerOneStarted.phase === "channeling"
    && playerOneHeldCastElapsedMs > playerOneStarted.castElapsedMs
    && guideShowsBothSkillKeys
    && preventedCodes.includes(skillCode),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
