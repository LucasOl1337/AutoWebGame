import assert from "node:assert/strict";

Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {};
globalThis.window = { addEventListener() {} };
globalThis.document = {};

const { GameApp } = await import("../output/esm/Engine/game-app.js");

function getOverlay(language, reason, winner) {
  const game = Object.create(GameApp.prototype);
  Object.assign(game, {
    language,
    mode: "match",
    roundOutcome: { winner, reason, message: "Server-authored English fallback.", countdownMs: 2_000 },
    players: { 1: { name: "P1" }, 2: { name: "P2" } },
    onlineRoomMode: "classic",
  });
  game.hasMatchWinnerScore = () => false;
  game.formatActiveScore = () => "P1 1 - P2 0";
  return game.getCenterOverlayState();
}

const cases = [
  ["pt", "elimination", 1, "P1 venceu a rodada.", "Arena reiniciando...", "Placar:"],
  ["pt", "double-ko", null, "Eliminacao simultanea.", "Eliminacao simultanea:", "Placar:"],
  ["pt", "timer", null, "Tempo esgotado.", "Nenhum ponto foi marcado.", "Placar:"],
  ["en", "elimination", 1, "P1 wins the round.", "Arena rebooting...", "Score:"],
  ["en", "double-ko", null, "Double KO.", "Simultaneous elimination:", "Score:"],
  ["en", "timer", null, "Time expired.", "No points awarded.", "Score:"],
];

for (const [language, reason, winner, title, subtitle, footerPrefix] of cases) {
  const overlay = getOverlay(language, reason, winner);
  assert.equal(overlay.title, title);
  assert.match(overlay.subtitle, new RegExp(`^${subtitle}`));
  assert.match(overlay.footer, new RegExp(`^${footerPrefix}`));
  assert.doesNotMatch(overlay.title, /Server-authored/);
}

console.log("round-outcome-localization-check: ok");
