import "./launcher-shell.css";
import { navigateToRoute, routeHref, type FrontendRoute } from "./frontend-router";
import { FrontendStore, type LauncherMode } from "./frontend-store";

const MODES: Array<{ id: LauncherMode; number: string; kicker: string; title: string; description: string; meta: string }> = [
  { id: "play", number: "01", kicker: "VERSUS", title: "PvP", description: "Competição online, salas privadas e partidas rápidas.", meta: "ARENA AO VIVO" },
  { id: "training", number: "02", kicker: "DOJO", title: "Treino", description: "Partida local imediata contra bots calibrados.", meta: "LOCAL · IMEDIATO" },
  { id: "lab", number: "03", kicker: "LAB_00", title: "Lab", description: "Arenas, modificadores e experiências em evolução.", meta: "EXPERIMENTAL" },
];

export class LauncherShell {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly root: HTMLDivElement, private readonly store: FrontendStore) {}

  mount(): void {
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.render();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render(): void {
    const state = this.store.getSnapshot();
    const current = MODES.find((mode) => mode.id === state.selectedMode) ?? MODES[0];
    this.root.innerHTML = `
      <div class="launcher-shell">
        <header class="launcher-topbar">
          <a class="launcher-brand" href="/" aria-label="BOMBA PvP, página inicial"><span class="launcher-bomb" aria-hidden="true"><i></i></span><span>BOMBA</span></a>
          <nav class="launcher-nav" aria-label="Destinos do jogo">
            <a href="${routeHref("launcher")}" aria-current="page">Início</a>
            <a href="${routeHref("play")}">PvP</a>
            <a href="${routeHref("training")}">Treino</a>
            <a href="${routeHref("lab")}">Lab</a>
          </nav>
          <span class="launcher-live"><i></i> SA-EAST · ONLINE</span>
        </header>
        <main class="launcher-main">
          <section class="launcher-intro" aria-labelledby="launcher-title">
            <p class="launcher-signal"><span></span> TEMPORADA ZERO · ESCOLHA SEU CAMPO</p>
            <h1 id="launcher-title">Acenda<br>o pavio.</h1>
            <p class="launcher-lead">Uma porta clara para competição, treino e experimentação — sem substituir o jogo que já funciona.</p>
            <a class="launcher-primary" href="${routeHref(current.id)}" data-route="${current.id}"><span>${current.id === "play" ? "Jogar agora" : `Abrir ${current.title.toLowerCase()}`}</span><i aria-hidden="true">↗</i></a>
          </section>
          <aside class="launcher-pulse" aria-label="Status da arena">
            <header><span>PULSO DA ARENA</span><small>AGORA</small></header>
            <strong><span>04</span> combatentes</strong>
            <div class="launcher-meter"><i></i></div>
            <p>Servidor autoritativo pronto</p>
            <footer><span><i></i> DISPONÍVEL</span><b>v0.4.1</b></footer>
          </aside>
          <section class="launcher-modes" aria-labelledby="modes-title">
            <header><h2 id="modes-title">ESCOLHA O CAMPO</h2><p>três maneiras de entrar na arena</p></header>
            <div class="launcher-mode-grid">${MODES.map((mode) => `
              <a class="launcher-mode${mode.id === state.selectedMode ? " is-selected" : ""}" href="${routeHref(mode.id)}" data-mode="${mode.id}" data-route="${mode.id}" ${mode.id === state.selectedMode ? 'aria-current="true"' : ""}>
                <span class="launcher-mode__number">${mode.number}</span><span class="launcher-mode__copy"><small>${mode.kicker}</small><b>${mode.title}</b><span>${mode.description}</span></span><span class="launcher-mode__meta">${mode.meta}<i>↗</i></span>
              </a>`).join("")}</div>
          </section>
        </main>
        <footer class="launcher-footer"><span>BOMBA / TEMPORADA ZERO</span><a href="/how-to-play.html">COMO JOGAR</a></footer>
      </div>`;

    this.root.querySelectorAll<HTMLElement>("[data-mode]").forEach((element) => {
      element.addEventListener("pointerenter", () => this.store.selectMode(element.dataset.mode as LauncherMode));
      element.addEventListener("focus", () => this.store.selectMode(element.dataset.mode as LauncherMode));
    });
    this.root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        navigateToRoute(element.dataset.route as FrontendRoute);
      });
    });
  }
}
