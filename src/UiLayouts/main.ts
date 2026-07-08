import "./main.css";
import { fetchActiveArenaDefinition } from "../Arenas/arena";
import { applyArenaThemeSelection } from "../Arenas/arena-theme-selection";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

async function bootstrapGame(rootElement: HTMLDivElement): Promise<void> {
  const activeArena = applyArenaThemeSelection(
    await fetchActiveArenaDefinition(),
    window.location.href,
  );
  const [
    { loadGameAssets },
    { GameApp },
    { OnlineSessionClient },
  ] = await Promise.all([
    import("../Engine/assets"),
    import("../Engine/game-app"),
    import("../NetCode/session-client"),
  ]);
  const assets = await loadGameAssets(activeArena.themeId);
  const game = new GameApp(rootElement, assets, activeArena);
  new OnlineSessionClient(rootElement, game, assets.characterRoster ?? [], activeArena.themeId);
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
}

await bootstrapGame(root);
