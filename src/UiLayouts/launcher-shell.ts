import "./launcher-shell.css";
import { ARENA_THEME_LIBRARY } from "../Arenas/arena-theme-library";
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
    cta: "Partida rápida",
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

const MATERIAL_THEMES = ARENA_THEME_LIBRARY.map((theme) => ({
  id: theme.id,
  name: theme.name,
  image: theme.tilePaths?.base ?? null,
  color: theme.palette.floorBase,
}));

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
      this.shell.className = "launcher-shell launcher-shell--control";
      this.root.replaceChildren(this.shell);
    }

    const selected = MODES.find((mode) => mode.id === state.selectedMode) ?? MODES[0];
    this.shell.innerHTML = `
      <div class="launcher-frame">
        <header class="launcher-commandbar">
          <div class="launcher-brand">
            <span class="launcher-registration" aria-hidden="true">BP / 01</span>
            <div>
              <p class="launcher-kicker">Match Control System</p>
              <h1>BOMBA PVP</h1>
            </div>
          </div>
          <dl class="launcher-command-meta" aria-label="Contrato do launcher">
            <div><dt>Entrada</dt><dd>Partida rápida</dd></div>
            <div><dt>Formato</dt><dd>2–4 jogadores</dd></div>
            <div><dt>Arena</dt><dd>Material variável</dd></div>
          </dl>
          <button type="button" class="launcher-primary" data-route="play">
            <span>Partida rápida</span><span aria-hidden="true">→</span>
          </button>
        </header>

        <div class="launcher-workspace">
          <nav class="launcher-mode-index" aria-label="Modos de jogo">
            <p class="launcher-index-label">Modos</p>
            ${MODES.map(
              (mode, index) => `
              <button type="button"
                class="launcher-mode ${state.selectedMode === mode.id ? "is-selected" : ""}"
                data-mode="${mode.id}"
                data-route="${mode.id}"
                aria-pressed="${state.selectedMode === mode.id ? "true" : "false"}">
                <span class="launcher-mode__number">${String(index + 1).padStart(2, "0")}</span>
                <span class="launcher-mode__name">
                  <strong>${mode.title}</strong><small>${mode.kicker}</small>
                </span>
                ${mode.id === "play" ? `
                  <span class="launcher-mode__art" aria-hidden="true">
                    <img src="/Assets/UiLayouts/arena-portal-emblem.webp" alt="" width="512" height="512" />
                  </span>
                ` : ""}
                <span class="launcher-mode__arrow" aria-hidden="true">↗</span>
              </button>
            `,
            ).join("")}
            <p class="launcher-index-note">Selecione um modo ou use o comando principal.</p>
          </nav>

          <main class="launcher-sheet">
            <header class="launcher-sheet__header">
              <p class="launcher-pulse">Modo selecionado / ${selected.kicker}</p>
              <h2>${selected.title}</h2>
              <p class="launcher-lede">${selected.summary}</p>
            </header>

            <div class="launcher-sheet__body">
              <section class="launcher-brief" aria-labelledby="launcher-brief-title">
                <h3 id="launcher-brief-title">Ficha de entrada</h3>
                <dl>
                  <div><dt>Modo</dt><dd>${selected.title}</dd></div>
                  <div><dt>Canal</dt><dd>${selected.kicker}</dd></div>
                  <div><dt>Configuração</dt><dd>${selected.meta}</dd></div>
                  <div><dt>Acesso</dt><dd>${routeHref(selected.id)}</dd></div>
                </dl>
                <button type="button" class="launcher-sheet-command" data-route="${selected.id}">
                  <span>Executar</span><strong>${selected.cta}</strong><span aria-hidden="true">→</span>
                </button>
              </section>

              <figure class="launcher-material-index">
                <figcaption>
                  <span>Índice material da arena</span>
                  <strong>Ambiente muda. Controle permanece.</strong>
                </figcaption>
                <div class="launcher-material-grid">
                  <div class="launcher-arena-emblem">
                    <img src="/Assets/UiLayouts/arena-portal-emblem.webp" alt="Emblema pixel art da arena BOMBA PvP" width="512" height="512" />
                    <span>Identidade / Arena</span>
                  </div>
                  ${MATERIAL_THEMES.map(
                    (theme, index) => `
                    <div class="launcher-material-sample">
                      ${
                        theme.image
                          ? `<img src="${theme.image}" alt="Amostra de piso ${theme.name}" width="32" height="32" />`
                          : `<span class="launcher-material-swatch" style="--material-color: ${theme.color}" role="img" aria-label="Amostra cromática ${theme.name}"></span>`
                      }
                      <span>Material ${String(index + 1).padStart(2, "0")} / ${theme.name}</span>
                    </div>
                  `,
                  ).join("")}
                </div>
              </figure>
            </div>

            <footer class="launcher-sheet__footer">
              <span>Build 0.4.3</span>
              <span>Teclado · Touch · Web</span>
              <span>Shell invariável / mapa variável</span>
            </footer>
          </main>
        </div>
      </div>
    `;

    this.shell.querySelectorAll<HTMLElement>("[data-mode]").forEach((node) => {
      const mode = node.dataset.mode as LauncherMode | undefined;
      if (!mode) return;
      node.addEventListener("mouseenter", () => this.store.selectMode(mode));
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
