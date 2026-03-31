import "./main.css";
import { loadGameAssets } from "../Engine/assets";
import { GameApp } from "../Engine/game-app";
import { OnlineSessionClient } from "../NetCode/session-client";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

const assets = await loadGameAssets();
const game = new GameApp(root, assets);
new OnlineSessionClient(root, game, assets.characterRoster ?? []);
game.start();
