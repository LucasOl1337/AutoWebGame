import "./launcher-shell.css";
import type { FrontendState, LauncherMode } from "./frontend-store";
import { FrontendStore } from "./frontend-store";
import { navigateToRoute, routeHref } from "./frontend-router";
import { LAB_MODEL_CATALOG, createLabSession, fetchLabModels, type LabModelInfo } from "./lab-session";

const MODES: Array<{
  id: LauncherMode;
  title: string;
  kicker: string;
  summary: string;
  cta: string;
  meta: string;
}> = [
  {
    id: "play",
    title: "Arena PvP",
    kicker: "Online",
    summary: "Partidas multiplayer em tempo real, salas privadas e ranking.",
    cta: "Entrar na Arena",
    meta: "2-4 jogadores · matchmaking",
  },
  {
    id: "training",
    title: "Treino",
    kicker: "Local",
    summary: "Pratique contra bots locais, teste personagens e melhore o timing.",
    cta: "Abrir Treino",
    meta: "offline · bots determinísticos",
  },
  {
    id: "lab",
    title: "Laboratório",
    kicker: "IA",
    summary: "Configure modelos via 9Router e deixe LLMs controlarem os bonecos em duelo.",
    cta: "Abrir Laboratório",
    meta: "9Router · bridge local",
  },
];

export class LauncherShell {
  private readonly root: HTMLElement;
  private readonly store: FrontendStore;
  private readonly unsub: () => void;
  private shell: HTMLElement | null = null;

  constructor(root: HTMLElement, store: FrontendStore) {
    this.root = root;
    this.store = store;
    this.unsub = store.subscribe((state) => this.render(state));
  }

  mount(): void {
    this.render(this.store.getSnapshot());
  }

  destroy(): void {
    this.unsub();
    this.shell?.remove();
    this.shell = null;
  }

  private render(state: FrontendState): void {
    if (!this.shell) {
      this.shell = document.createElement("section");
      this.shell.className = "launcher-shell";
      this.root.replaceChildren(this.shell);
    }

    const selected = MODES.find((mode) => mode.id === state.selectedMode) ?? MODES[0];
    this.shell.innerHTML = `
      <div class="launcher-frame">
        <header class="launcher-topbar">
          <div class="launcher-brand">
            <span class="launcher-mark" aria-hidden="true">BP</span>
            <div>
              <p class="launcher-kicker">BombaPVP</p>
              <h1>Escolha o modo</h1>
            </div>
          </div>
          <nav class="launcher-nav" aria-label="Modos">
            ${MODES.map(
              (mode) => `
              <a class="launcher-nav-link ${state.selectedMode === mode.id ? "is-active" : ""}"
                 href="${routeHref(mode.id)}"
                 data-route="${mode.id}">${mode.title}</a>
            `,
            ).join("")}
          </nav>
        </header>

        <section class="launcher-intro">
          <p class="launcher-pulse">Arena · Treino · Laboratório de IA</p>
          <h2>${selected.title}</h2>
          <p class="launcher-lede">${selected.summary}</p>
        </section>

        <section class="launcher-modes" aria-label="Modos de jogo">
          <div class="launcher-mode-grid">
            ${MODES.map(
              (mode) => `
              <button type="button"
                class="launcher-mode ${state.selectedMode === mode.id ? "is-selected" : ""}"
                data-mode="${mode.id}"
                data-route="${mode.id}">
                <span class="launcher-mode__kicker">${mode.kicker}</span>
                <strong class="launcher-mode__title">${mode.title}</strong>
                <span class="launcher-mode__copy">${mode.summary}</span>
                <span class="launcher-mode__meta">${mode.meta}</span>
              </button>
            `,
            ).join("")}
          </div>
        </section>

        <footer class="launcher-footer">
          <button type="button" class="launcher-primary" data-route="${selected.id}">
            ${selected.cta}
          </button>
          <p class="launcher-footnote">PvP e Treino usam o jogo real. O Lab prepara agentes no broker local e abre a partida com bridge de IA.</p>
        </footer>
      </div>
    `;

    this.shell.querySelectorAll<HTMLElement>("[data-mode]").forEach((node) => {
      const mode = node.dataset.mode as LauncherMode | undefined;
      if (!mode) return;
      node.addEventListener("mouseenter", () => this.store.selectMode(mode));
      node.addEventListener("focus", () => this.store.selectMode(mode));
      node.addEventListener("click", () => navigateToRoute(mode));
    });

    this.shell.querySelectorAll<HTMLElement>("[data-route]").forEach((node) => {
      if (node.hasAttribute("data-mode")) return;
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const route = node.dataset.route as LauncherMode | undefined;
        if (route) navigateToRoute(route);
      });
    });
  }
}

export class LabShell {
  private readonly root: HTMLElement;
  private shell: HTMLElement | null = null;
  private models: LabModelInfo[] = [];
  private status = "Pronto para configurar o duelo.";
  private busy = false;
  private lastError = "";
  private selectedModelA = "cx/gpt-5.6-sol";
  private selectedModelB = "cx/gpt-5.6-terra";

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.render();
    void this.loadModels();
  }

  destroy(): void {
    this.shell?.remove();
    this.shell = null;
  }

  private async loadModels(): Promise<void> {
    const result = await fetchLabModels();
    this.models = result.models;
    if (result.warning === "broker_unreachable") {
      this.status = "O backend do Laboratório está temporariamente indisponível.";
    } else if (result.warning) {
      this.status = `A lista de modelos está usando fallback (${result.warning}).`;
    } else if (this.models.length === 0) {
      this.status = "Nenhum modelo retornado pelo 9Router. Informe o modelo manualmente.";
    } else {
      this.status = `${this.models.length} modelo(s) disponíveis via 9Router.`;
    }
    this.render();
  }

  private render(): void {
    if (!this.shell) {
      this.shell = document.createElement("section");
      this.shell.className = "launcher-shell lab-shell";
      this.root.replaceChildren(this.shell);
    }

    const visibleModels = this.models.length ? this.models : [...LAB_MODEL_CATALOG];
    const modelOptions = (selected: string) => visibleModels
      .map((model) => `<option value="${model.id}" ${model.id === selected ? "selected" : ""}>${model.label}</option>`)
      .join("");

    this.shell.innerHTML = `
      <div class="launcher-frame lab-frame">
        <header class="launcher-topbar">
          <div class="launcher-brand">
            <span class="launcher-mark" aria-hidden="true">BP</span>
            <div>
              <p class="launcher-kicker">Laboratório de IA</p>
              <h1>Duelo de modelos</h1>
            </div>
          </div>
          <nav class="launcher-nav" aria-label="Navegação">
            <a class="launcher-nav-link" href="${routeHref("launcher")}" data-nav="launcher">Início</a>
            <a class="launcher-nav-link" href="${routeHref("play")}" data-nav="play">Arena</a>
            <a class="launcher-nav-link" href="${routeHref("training")}" data-nav="training">Treino</a>
            <a class="launcher-nav-link is-active" href="${routeHref("lab")}" data-nav="lab">Lab</a>
          </nav>
        </header>

        <section class="lab-status" aria-live="polite">
          <p>${this.status}</p>
          ${this.lastError ? `<p class="lab-error">${this.lastError}</p>` : ""}
        </section>

        <form class="lab-workbench" id="lab-form">
          <section class="lab-panel">
            <h2>1. Partida</h2>
            <label>Mapa
              <select name="map">
                <option value="classic">Classic</option>
                <option value="ruins">Ruins</option>
                <option value="factory">Factory</option>
              </select>
            </label>
            <label>Rounds
              <input name="rounds" type="number" min="1" max="20" value="5" />
            </label>
            <label>Duração (s)
              <input name="durationSec" type="number" min="30" max="600" value="180" />
            </label>
            <label>Modificador
              <select name="modifier">
                <option value="none">Nenhum</option>
                <option value="sudden-death">Sudden Death</option>
                <option value="double-bombs">Double Bombs</option>
              </select>
            </label>
          </section>

          <section class="lab-panel">
            <h2>2. Modelos por jogador</h2>
            <p class="lab-note">Todos os modelos são servidos pelo 9Router. As credenciais permanecem somente no backend.</p>
            <div class="lab-agent lab-agent--p1">
              <h3><span class="lab-player-tag">P1</span> Modelo controlador</h3>
              <label>Modelo
                <select name="modelA" required>${modelOptions(this.selectedModelA)}</select>
              </label>
            </div>
            <div class="lab-agent lab-agent--p2">
              <h3><span class="lab-player-tag">P2</span> Modelo controlador</h3>
              <label>Modelo
                <select name="modelB" required>${modelOptions(this.selectedModelB)}</select>
              </label>
            </div>
          </section>

          <section class="lab-panel lab-panel--actions">
            <h2>3. Duelo</h2>
            <p class="lab-note">O broker sobe <code>live_agent.py</code> para cada slot, usa o 9Router em <code>/v1/chat/completions</code> e abre a partida com bridge de IA.</p>
            <button type="submit" class="launcher-primary" ${this.busy ? "disabled" : ""}>
              ${this.busy ? "Preparando sessão…" : "Iniciar duelo de IAs"}
            </button>
            <button type="button" class="lab-secondary" data-refresh>Atualizar modelos</button>
          </section>
        </form>
      </div>
    `;

    this.shell.querySelectorAll<HTMLElement>("[data-nav]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const route = node.dataset.nav as "launcher" | "play" | "training" | "lab" | undefined;
        if (route) navigateToRoute(route);
      });
    });

    this.shell.querySelector<HTMLElement>("[data-refresh]")?.addEventListener("click", () => {
      void this.loadModels();
    });

    this.shell.querySelector<HTMLFormElement>("#lab-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.onSubmit(event.currentTarget as HTMLFormElement);
    });
  }

  private async onSubmit(form: HTMLFormElement): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.lastError = "";
    this.status = "Criando sessão no broker e subindo agentes…";
    this.render();

    const data = new FormData(form);
    const modelA = String(data.get("modelA") || "").trim();
    const modelB = String(data.get("modelB") || "").trim();
    this.selectedModelA = modelA;
    this.selectedModelB = modelB;

    try {
      const result = await createLabSession({
        agents: [
          { slot: "1", provider: "9router", model: modelA, label: "P1" },
          { slot: "2", provider: "9router", model: modelB, label: "P2" },
        ],
        rounds: Number(data.get("rounds") || 5),
        durationSec: Number(data.get("durationSec") || 180),
        map: String(data.get("map") || "classic"),
        modifier: String(data.get("modifier") || "none"),
      });

      if (!result.ok || !result.gameUrl) {
        this.lastError = result.hint
          ? `${result.error || "falha"} — ${result.hint}`
          : result.error || "falha ao criar sessão";
        this.status = "Não foi possível iniciar o duelo.";
        this.busy = false;
        this.render();
        return;
      }

      this.status = `Sessão ${result.sessionId} pronta. Abrindo partida…`;
      this.busy = false;
      this.render();

      // Navigate into the real game with bridge-controlled slots.
      const target = result.gameUrl.startsWith("/") ? result.gameUrl : `/${result.gameUrl}`;
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      this.lastError = "broker_unreachable";
      this.status = "Broker local offline. Rode o game_broker com NINE_ROUTER_* configurados.";
      this.busy = false;
      this.render();
    }
  }
}
