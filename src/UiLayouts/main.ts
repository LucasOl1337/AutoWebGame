import "./main.css";
import { fetchActiveArenaDefinition } from "../Arenas/arena";
import { loadGameAssets } from "../Engine/assets";
import { GameApp } from "../Engine/game-app";
import { OnlineSessionClient } from "../NetCode/session-client";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

const activeArena = await fetchActiveArenaDefinition();
const assets = await loadGameAssets(activeArena.themeId);
const game = new GameApp(root, assets, activeArena);
new OnlineSessionClient(root, game, assets.characterRoster ?? []);
game.start();

if (import.meta.env.DEV) {
  (window as Window & { __autobot?: typeof game }).__autobot = game;
  const params = new URLSearchParams(window.location.search);
  const autobotParam = params.get("autobot");
  const codexBotParam = params.get("codexbot");

  if (codexBotParam) {
    const playerIds = codexBotParam
      .split(",")
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 4) as Array<1 | 2 | 3 | 4>;
    game.setLiveBridgePlayers(playerIds);
  }

  if (autobotParam !== null) {
    const botFill = parseInt(autobotParam, 10);
    game.startOfflineBotMatch(isNaN(botFill) ? 3 : botFill, "endless");
  }
}
