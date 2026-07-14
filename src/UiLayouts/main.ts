import "./main.css";
import "./match-control-experience.css";
import "./lab-live-hud.css";
import { fetchActiveArenaDefinition } from "../Arenas/arena";
import { applyArenaThemeSelection } from "../Arenas/arena-theme-selection";
import { LauncherShell, LabShell } from "./launcher-shell";
import { resolveFrontendRoute, type FrontendRoute } from "./frontend-router";
import { FrontendStore } from "./frontend-store";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("#app root not found");
}
const root: HTMLDivElement = rootElement;

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

async function bootstrapGame(rootElement: HTMLDivElement, route: FrontendRoute): Promise<void> {
  rootElement.setAttribute("aria-busy", "true");
  rootElement.innerHTML = '<p role="status" aria-live="polite">Carregando arena…</p>';

  renderBootstrapLoading(rootElement);
  const activeArena = applyArenaThemeSelection(
    await fetchActiveArenaDefinition(),
    window.location.href,
  );
  const [
    { loadGameAssets },
    { GameApp },
    { installAiriGameBridge },
    { AutoImprovementBridge },
    { OnlineSessionClient },
  ] = await Promise.all([
    import("../Engine/assets"),
    import("../Engine/game-app"),
    import("../Engine/airi-bridge"),
    import("../Engine/auto-improvement-bridge"),
    import("../NetCode/session-client"),
  ]);
  const assets = await loadGameAssets(activeArena.themeId);
  rootElement.removeAttribute("aria-busy");
  rootElement.replaceChildren();
  rootElement.setAttribute("aria-busy", "false");
  const game = new GameApp(rootElement, assets, activeArena);
  new OnlineSessionClient(rootElement, game, assets.characterRoster ?? [], activeArena.themeId);
  installAiriGameBridge(game);

  const params = new URLSearchParams(window.location.search);
  const autobotParam = params.get("autobot");
  const codexBotParam = params.get("codexbot");
  const labSessionParam = params.get("labSession");
  const validLabSession = /^lab-[a-f0-9]{10}$/.test(labSessionParam ?? "");
  const labCapability = params.get("labCapability") ?? "";
  const livePlayerIds = validLabSession && codexBotParam
    ? codexBotParam
      .split(",")
      .map((value) => parseInt(value.trim(), 10))
      .filter((value, index, values) => (
        Number.isInteger(value) && value >= 1 && value <= 4 && values.indexOf(value) === index
      )) as Array<1 | 2 | 3 | 4>
    : [];

  if (livePlayerIds.length > 0) {
    AutoImprovementBridge.setLabCapability(labCapability);
    game.setLiveBridgePlayers(livePlayerIds);
  }
  game.start();

  // Training alone starts a simple local bot match. Lab sessions open training
  // with autobot/codexbot and must not be overridden by the default 1-bot start.
  if (route === "training" && autobotParam === null && codexBotParam === null) {
    game.startOfflineBotMatch(1, "classic");
  }

  if (import.meta.env.DEV) {
    (window as Window & { __autobot?: typeof game }).__autobot = game;
  }

  if ((import.meta.env.DEV || livePlayerIds.length > 0) && autobotParam !== null) {
    const botFill = parseInt(autobotParam, 10);
    game.startOfflineBotMatch(isNaN(botFill) ? 3 : botFill, "endless");
  }
}

let gameBootPromise: Promise<void> | null = null;

function bootGameOnce(rootElement: HTMLDivElement, route: FrontendRoute): Promise<void> {
  gameBootPromise ??= bootstrapGame(rootElement, route);
  return gameBootPromise;
}

const initialRoute = resolveFrontendRoute(window.location.pathname);
const frontendStore = new FrontendStore(initialRoute);
let launcherShell: LauncherShell | null = null;
let labShell: LabShell | null = null;

function destroyShells(): void {
  launcherShell?.destroy();
  launcherShell = null;
  labShell?.destroy();
  labShell = null;
}

async function renderRoute(): Promise<void> {
  const route = resolveFrontendRoute(window.location.pathname);
  frontendStore.setRoute(route);
  if (route === "launcher") {
    if (gameBootPromise !== null) {
      window.location.reload();
      return;
    }
    destroyShells();
    launcherShell = new LauncherShell(root, frontendStore);
    launcherShell.mount();
    return;
  }

  if (route === "lab") {
    if (gameBootPromise !== null) {
      window.location.reload();
      return;
    }
    destroyShells();
    labShell = new LabShell(root);
    labShell.mount();
    return;
  }

  destroyShells();
  frontendStore.setBootingGame(true);
  try {
    await bootGameOnce(root, route);
  } catch (error) {
    gameBootPromise = null;
    console.error("AutoWebGame bootstrap failed", error);
    renderBootstrapFailure(root);
  } finally {
    frontendStore.setBootingGame(false);
  }
}

window.addEventListener("popstate", () => void renderRoute());
await renderRoute();
