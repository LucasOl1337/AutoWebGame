import "./main.css";
import { fetchActiveArenaDefinition } from "../Arenas/arena";
import { applyArenaThemeSelection } from "../Arenas/arena-theme-selection";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("#app root not found");
}

type BootstrapCopy = {
  eyebrow: string;
  loadingTitle: string;
  loadingBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
};

function getBootstrapCopy(): BootstrapCopy {
  const portuguese = document.documentElement.lang.toLowerCase().startsWith("pt");
  return portuguese
    ? {
        eyebrow: "Preparando a arena",
        loadingTitle: "Carregando AutoWebGame",
        loadingBody: "Buscando arena, personagens e efeitos para sua partida.",
        errorTitle: "A arena nao carregou",
        errorBody: "Confira sua conexao e tente novamente. Suas preferencias continuam salvas.",
        retry: "Tentar novamente",
      }
    : {
        eyebrow: "Preparing the arena",
        loadingTitle: "Loading AutoWebGame",
        loadingBody: "Fetching the arena, characters, and effects for your match.",
        errorTitle: "The arena did not load",
        errorBody: "Check your connection and try again. Your preferences are still saved.",
        retry: "Try again",
      };
}

function createBootstrapPanel(
  state: "loading" | "error",
  onRetry?: () => void,
): HTMLElement {
  const copy = getBootstrapCopy();
  const panel = document.createElement("main");
  panel.className = "bootstrap-state";
  panel.dataset.state = state;
  panel.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
  panel.setAttribute("role", state === "error" ? "alert" : "status");

  const indicator = document.createElement("span");
  indicator.className = "bootstrap-state__indicator";
  indicator.setAttribute("aria-hidden", "true");

  const eyebrow = document.createElement("p");
  eyebrow.className = "bootstrap-state__eyebrow";
  eyebrow.textContent = copy.eyebrow;

  const title = document.createElement("h1");
  title.className = "bootstrap-state__title";
  title.textContent = state === "error" ? copy.errorTitle : copy.loadingTitle;

  const body = document.createElement("p");
  body.className = "bootstrap-state__body";
  body.textContent = state === "error" ? copy.errorBody : copy.loadingBody;

  panel.append(indicator, eyebrow, title, body);

  if (state === "error" && onRetry) {
    const retry = document.createElement("button");
    retry.className = "bootstrap-state__retry";
    retry.type = "button";
    retry.textContent = copy.retry;
    retry.addEventListener("click", onRetry);
    panel.appendChild(retry);
    window.requestAnimationFrame(() => retry.focus());
  }

  return panel;
}

function renderBootstrapLoading(rootElement: HTMLDivElement): void {
  rootElement.setAttribute("aria-busy", "true");
  rootElement.replaceChildren(createBootstrapPanel("loading"));
}

function renderBootstrapFailure(rootElement: HTMLDivElement): void {
  rootElement.setAttribute("aria-busy", "false");
  rootElement.replaceChildren(createBootstrapPanel("error", () => window.location.reload()));
}

async function bootstrapGame(rootElement: HTMLDivElement): Promise<void> {
  renderBootstrapLoading(rootElement);
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
  rootElement.replaceChildren();
  rootElement.setAttribute("aria-busy", "false");
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

const prototypeParams = new URLSearchParams(window.location.search);
const shouldRenderUxPrototype = import.meta.env.DEV && prototypeParams.get("prototype") === "ux";

if (shouldRenderUxPrototype) {
  await import("./prototype-ux");
} else {
  try {
    await bootstrapGame(root);
  } catch (error) {
    console.error("AutoWebGame bootstrap failed", error);
    renderBootstrapFailure(root);
  }
}
