import type {
  CanonicalExperience,
  FrontendKernelInterface,
  FrontendSnapshot,
} from "./frontend-kernel";
import "./canonical-launcher.css";

export class CanonicalLauncherView {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly kernel: FrontendKernelInterface,
  ) {}

  mount(): void {
    if (this.unsubscribe !== null) return;
    document.body.classList.add("canonical-launcher-active");
    this.root.removeAttribute("hidden");
    this.root.classList.add("canonical-launcher-root");
    this.root.addEventListener("click", this.handleClick);
    this.unsubscribe = this.kernel.subscribe((snapshot) => this.render(snapshot));
    this.render(this.kernel.getSnapshot());
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root.removeEventListener("click", this.handleClick);
    this.root.classList.remove("canonical-launcher-root");
    this.root.replaceChildren();
    document.body.classList.remove("canonical-launcher-active");
  }

  private readonly handleClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;

    if (button.dataset.intent === "navigate-back") {
      this.kernel.dispatch({ type: "navigate-back" });
      return;
    }

    const experience = button.dataset.experience as CanonicalExperience | undefined;
    if (experience) {
      this.kernel.dispatch({ type: "activate-experience", experience });
    }
  };

  private render(snapshot: FrontendSnapshot): void {
    if (snapshot.screen !== "launcher") return;
    const operation = snapshot.operation;
    const actionsDisabled = operation !== null ? "disabled" : "";
    const status = operation?.label ?? "Escolha sua próxima experiência";
    const experienceButtons = snapshot.experiences.map((experience) => `
      <button
        class="canonical-launcher__experience${experience.emphasis === "primary" ? " canonical-launcher__experience--primary" : ""}"
        type="button"
        data-experience="${experience.experience}"
        ${actionsDisabled}
      >
        <span class="canonical-launcher__sequence">${experience.sequence}</span>
        <strong>${experience.label}</strong>
        <span>${experience.description}</span>
        <span class="canonical-launcher__action">${experience.action} <span aria-hidden="true">→</span></span>
      </button>
    `).join("");

    this.root.innerHTML = `
      <main class="canonical-launcher" aria-labelledby="canonical-launcher-title" aria-busy="${operation?.status === "leaving"}">
        <header class="canonical-launcher__header">
          <div class="canonical-launcher__brand" aria-label="BOMBA PvP — Launcher">
            <span aria-hidden="true">BP / 01</span>
            <strong>BOMBA PvP</strong>
          </div>
        </header>

        <section class="canonical-launcher__command" aria-describedby="canonical-launcher-description">
          <p class="canonical-launcher__kicker">Posto de Comando / online</p>
          <h1 id="canonical-launcher-title">Escolha o próximo confronto.</h1>
          <p id="canonical-launcher-description">
            Entre direto na Sala contínua ou prepare uma sessão controlada.
          </p>

          <div class="canonical-launcher__grid" aria-label="Experiências públicas">
            ${experienceButtons}
          </div>
        </section>

        <footer class="canonical-launcher__status">
          <p role="status" aria-live="polite" tabindex="-1" data-launcher-status>${status}</p>
          ${operation === null ? "" : `<button type="button" data-intent="navigate-back">${operation.status === "leaving" ? "Cancelar" : "Voltar"}</button>`}
        </footer>
      </main>
    `;

    if (snapshot.focusTarget === "status") {
      this.root.querySelector<HTMLElement>("[data-launcher-status]")?.focus();
    } else if (snapshot.focusTarget !== null) {
      this.root.querySelector<HTMLElement>(`[data-experience='${snapshot.focusTarget}']`)?.focus();
    }
  }
}
