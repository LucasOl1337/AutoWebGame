import "./styles/main.css";
import { loadGameAssets } from "./app/assets";
import { GameApp } from "./app/game-app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

const assets = await loadGameAssets();
const game = new GameApp(root, assets);
game.start();
