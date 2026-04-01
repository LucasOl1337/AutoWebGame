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
