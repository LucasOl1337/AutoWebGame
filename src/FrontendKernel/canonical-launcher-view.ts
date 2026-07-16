import type {
  AuxiliaryScreen,
  CanonicalExperience,
  FrontendKernelInterface,
  FrontendSnapshot,
  IdentitySnapshot,
} from "./frontend-kernel";
import "./canonical-launcher.css";
import "./canonical-launcher-signal-grid.css";

const UTILITY_LINKS: readonly Readonly<{
  auxiliary: AuxiliaryScreen;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ auxiliary: "how-to-play", label: "Como jogar" }),
  Object.freeze({ auxiliary: "account", label: "Conta" }),
  Object.freeze({ auxiliary: "help", label: "Ajuda" }),
  Object.freeze({ auxiliary: "settings", label: "Configurações" }),
]);

export class CanonicalLauncherView {
  private unsubscribe: (() => void) | null = null;
  private renderedRoute: string | null = null;

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
    this.root.addEventListener("input", this.handleInput);
    this.unsubscribe = this.kernel.subscribe((snapshot) => this.render(snapshot));
    this.render(this.kernel.getSnapshot());
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("input", this.handleInput);
    this.root.classList.remove("canonical-launcher-root");
    this.root.replaceChildren();
    this.renderedRoute = null;
    document.body.classList.remove("canonical-launcher-active");
  }

  private readonly handleClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;

    if (button.dataset.intent === "navigate-back") {
      this.kernel.dispatch({ type: "navigate-back" });
      return;
    }
    if (button.dataset.intent === "save-temporary-nick") {
      this.kernel.dispatch({ type: "save-temporary-nick" });
      return;
    }
    if (button.dataset.intent === "retry-identity") {
      this.kernel.dispatch({ type: "retry-identity" });
      return;
    }
    if (button.dataset.intent === "open-account-access") {
      this.kernel.dispatch({
        type: "open-account-access",
        returnTo: button.dataset.returnTo,
      });
      return;
    }

    const auxiliary = button.dataset.auxiliary as AuxiliaryScreen | undefined;
    if (auxiliary) {
      this.kernel.dispatch({ type: "open-auxiliary", auxiliary });
      return;
    }

    const experience = button.dataset.experience as CanonicalExperience | undefined;
    if (experience) {
      this.kernel.dispatch({ type: "activate-experience", experience });
    }
  };

  private readonly handleInput = (event: Event): void => {
    const input = (event.target as Element | null)?.closest<HTMLInputElement>(
      "[data-temporary-nick]",
    );
    if (!input) return;
    this.kernel.dispatch({ type: "edit-temporary-nick", value: input.value });
  };

  private render(snapshot: FrontendSnapshot): void {
    if (snapshot.screen === "delegated") return;
    const previousRoute = this.renderedRoute;
    const nickWasFocused = document.activeElement?.hasAttribute("data-temporary-nick") ?? false;

    this.root.innerHTML = snapshot.screen === "launcher"
      ? this.renderLauncher(snapshot)
      : this.renderSecondary(snapshot);
    this.renderedRoute = snapshot.route;

    if (nickWasFocused) {
      const input = this.root.querySelector<HTMLInputElement>("[data-temporary-nick]");
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    } else if (snapshot.screen === "launcher" && snapshot.focusTarget === "status") {
      this.root.querySelector<HTMLElement>("[data-launcher-status]")?.focus();
    } else if (snapshot.screen === "launcher" && snapshot.focusTarget !== null) {
      this.root.querySelector<HTMLElement>(
        `[data-experience='${snapshot.focusTarget}']`,
      )?.focus();
    } else if (previousRoute !== null && previousRoute !== snapshot.route) {
      this.root.querySelector<HTMLElement>("[data-route-heading]")?.focus();
    }
  }

  private renderLauncher(snapshot: Extract<FrontendSnapshot, { screen: "launcher" }>): string {
    const operation = snapshot.operation;
    const actionsDisabled = operation !== null ? "disabled" : "";
    const status = operation?.label ?? identityStatus(snapshot.identity);
    const experienceButtons = snapshot.experiences.map((experience) => {
      const labAccess = experience.experience === "lab"
        ? `<span class="canonical-launcher__access">${snapshot.identity.status === "authenticated" ? "Sessão confirmada" : "Login obrigatório"}</span>`
        : "";
      return `
        <button
          class="canonical-launcher__experience${experience.emphasis === "primary" ? " canonical-launcher__experience--primary" : ""}"
          type="button"
          data-experience="${experience.experience}"
          ${actionsDisabled}
        >
          <span class="canonical-launcher__sequence">${experience.sequence}</span>
          <strong>${escapeHtml(experience.label)}</strong>
          <span>${escapeHtml(experience.description)}</span>
          ${labAccess}
          <span class="canonical-launcher__action">${escapeHtml(experience.action)} <span aria-hidden="true">→</span></span>
        </button>
      `;
    }).join("");

    return `
      <main class="canonical-launcher" aria-labelledby="canonical-launcher-title" aria-busy="${operation?.status === "leaving"}">
        <header class="canonical-launcher__header">
          <div class="canonical-launcher__brand" aria-label="BOMBA PvP — Launcher">
            <span aria-hidden="true">BP / 01</span>
            <strong>BOMBA PvP</strong>
          </div>
          ${renderIdentity(snapshot.identity)}
        </header>

        <section class="canonical-launcher__command" aria-describedby="canonical-launcher-description">
          <p class="canonical-launcher__kicker">Posto de Comando / online</p>
          <h1 id="canonical-launcher-title" data-route-heading tabindex="-1">Escolha o próximo confronto.</h1>
          <p id="canonical-launcher-description">
            Entre direto na Sala contínua ou prepare uma sessão controlada.
          </p>

          <div class="canonical-launcher__grid" aria-label="Experiências públicas">
            ${experienceButtons}
          </div>
        </section>

        <footer class="canonical-launcher__status">
          <p role="status" aria-live="polite" tabindex="-1" data-launcher-status>${escapeHtml(status)}</p>
          ${operation === null ? renderUtilities() : `<button type="button" data-intent="navigate-back">${operation.status === "leaving" ? "Cancelar" : "Voltar"}</button>`}
        </footer>
      </main>
    `;
  }

  private renderSecondary(
    snapshot: Extract<FrontendSnapshot, { screen: "auxiliary" | "lab-access" }>,
  ): string {
    const isLab = snapshot.screen === "lab-access";
    const actionDisabled = snapshot.operation === null ? "" : "disabled";
    const action = isLab
      ? snapshot.identity.status === "authenticated"
        ? `<button class="canonical-launcher__secondary-primary" type="button" data-experience="lab" ${actionDisabled}>Continuar para o Laboratório Bot vs Bot <span aria-hidden="true">→</span></button>`
        : `<button class="canonical-launcher__secondary-primary" type="button" data-intent="open-account-access" data-return-to="/laboratorio" ${actionDisabled}>Entrar ou criar conta <span aria-hidden="true">→</span></button>`
      : snapshot.auxiliary === "account" && snapshot.identity.status !== "authenticated"
        ? `<button class="canonical-launcher__secondary-primary" type="button" data-intent="open-account-access">Entrar ou criar conta <span aria-hidden="true">→</span></button>`
        : "";

    return `
      <main class="canonical-launcher canonical-launcher--secondary" aria-labelledby="canonical-secondary-title">
        <header class="canonical-launcher__header">
          <div class="canonical-launcher__brand" aria-label="BOMBA PvP — Launcher">
            <span aria-hidden="true">BP / 01</span>
            <strong>BOMBA PvP</strong>
          </div>
          ${renderIdentity(snapshot.identity)}
        </header>
        <section class="canonical-launcher__secondary-panel">
          <p class="canonical-launcher__kicker">Posto de Comando / ${isLab ? "acesso restrito" : "suporte"}</p>
          <h1 id="canonical-secondary-title" data-route-heading tabindex="-1">${escapeHtml(snapshot.title)}</h1>
          <p>${escapeHtml(snapshot.description)}</p>
          ${renderSecondaryDetails(snapshot)}
          ${action}
        </section>
        <footer class="canonical-launcher__status">
          <p role="status" aria-live="polite">${escapeHtml(snapshot.operation?.label ?? identityStatus(snapshot.identity))}</p>
          <button type="button" data-intent="navigate-back">${snapshot.operation === null ? "Voltar ao Launcher" : "Cancelar"}</button>
        </footer>
      </main>
    `;
  }
}

function renderIdentity(identity: IdentitySnapshot): string {
  if (identity.status === "authenticated") {
    return `
      <section class="canonical-launcher__identity" aria-label="Identidade autenticada">
        <span>Conta conectada</span>
        <strong>${escapeHtml(identity.displayName)}</strong>
        <small>@${escapeHtml(identity.username)}</small>
      </section>
    `;
  }

  const loading = identity.status === "loading";
  const message = identity.status === "error"
    ? `<p class="canonical-launcher__identity-error" role="alert">${escapeHtml(identity.message)} <button type="button" data-intent="retry-identity">Tentar novamente</button></p>`
    : identity.status === "visitor" && identity.validationMessage
      ? `<p class="canonical-launcher__identity-error" role="alert">${escapeHtml(identity.validationMessage)}</p>`
      : "";
  return `
    <section class="canonical-launcher__identity" aria-label="Identidade de visitante">
      <label for="temporary-nick">Nick temporário</label>
      <div>
        <input id="temporary-nick" data-temporary-nick type="text" minlength="3" maxlength="16" value="${escapeHtml(identity.draftNick)}" ${loading ? "disabled" : ""}>
        <button type="button" data-intent="save-temporary-nick" ${loading ? "disabled" : ""}>Salvar</button>
      </div>
      ${loading ? "<small>Confirmando sessão…</small>" : message}
    </section>
  `;
}

function renderUtilities(): string {
  return `
    <nav class="canonical-launcher__utilities" aria-label="Ações secundárias">
      ${UTILITY_LINKS.map((item) => `<button type="button" data-auxiliary="${item.auxiliary}">${item.label}</button>`).join("")}
    </nav>
  `;
}

function renderSecondaryDetails(
  snapshot: Extract<FrontendSnapshot, { screen: "auxiliary" | "lab-access" }>,
): string {
  if (snapshot.screen === "lab-access") {
    return `<ul><li>2–4 Competidores de laboratório publicados</li><li>Mapa de Arena e Rodadas reprodutíveis</li><li>Observação sem comandos de combate</li></ul>`;
  }
  const details: Record<AuxiliaryScreen, string> = {
    "how-to-play": "Setas/WASD movem. Bombar abre caminho. Detonar aparece com o Detonador. Habilidade usa a ação estável do personagem.",
    account: snapshot.identity.status === "authenticated"
      ? `Identidade ativa: ${escapeHtml(snapshot.identity.displayName)} (@${escapeHtml(snapshot.identity.username)}).`
      : "Sala contínua e Treino contra bots não exigem conta. O Laboratório Bot vs Bot exige uma sessão autenticada.",
    help: "Se uma operação falhar, use Tentar novamente. Nenhuma ação pendente cria uma Sala contínua, Fila da sala ou execução invisível.",
    settings: "Movimento reduzido segue o sistema. Preferências avançadas de touch chegam na fase dedicada do InputHub.",
  };
  return `<p class="canonical-launcher__secondary-detail">${details[snapshot.auxiliary]}</p>`;
}

function identityStatus(identity: IdentitySnapshot): string {
  if (identity.status === "loading") return "Confirmando sessão…";
  if (identity.status === "authenticated") return `Identidade ativa: ${identity.displayName}`;
  if (identity.status === "error") return "Sessão não confirmada — entrada pública disponível";
  return `Jogando como ${identity.temporaryNick}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
