import "./styles/main.css";
import { loadGameAssets } from "./app/assets";
import { GameApp } from "./app/game-app";
import { OnlineSessionClient } from "./online/session-client";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

const assets = await loadGameAssets();
const game = new GameApp(root, assets);
new OnlineSessionClient(root, game, assets.characterRoster ?? []);
game.start();
