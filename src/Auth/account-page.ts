import "./account-page.css";
import type { PlayerAccount } from "../NetCode/account";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./account-credentials";

type AccountPageMode = "login" | "register";

interface AccountPageNodes {
  shell: HTMLElement;
  authPanel: HTMLElement;
  accountPanel: HTMLElement;
  loginTab: HTMLButtonElement;
  registerTab: HTMLButtonElement;
  loginForm: HTMLFormElement;
  registerForm: HTMLFormElement;
  loginEmail: HTMLInputElement;
  loginPassword: HTMLInputElement;
  registerUsername: HTMLInputElement;
  registerEmail: HTMLInputElement;
  registerPassword: HTMLInputElement;
  registerPasswordConfirmation: HTMLInputElement;
  loginSubmit: HTMLButtonElement;
  registerSubmit: HTMLButtonElement;
  status: HTMLParagraphElement;
  accountName: HTMLElement;
  accountEmail: HTMLElement;
  accountRole: HTMLElement;
  logoutButton: HTMLButtonElement;
}

export class AccountPage {
  private readonly root: HTMLElement;
  private readonly abortController = new AbortController();
  private nodes: AccountPageNodes | null = null;
  private busy = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.root.replaceChildren(this.createShell());
    this.bindEvents();
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    this.setMode(requestedMode === "register" ? "register" : "login");
    void this.refreshSession();
  }

  destroy(): void {
    this.abortController.abort();
    this.nodes?.shell.remove();
    this.nodes = null;
  }

  private createShell(): HTMLElement {
    const shell = document.createElement("section");
    shell.className = "account-shell";
    shell.innerHTML = `
      <div class="account-shell__grid" aria-hidden="true"></div>
      <header class="account-commandbar">
        <a class="account-brand" href="/game" aria-label="Voltar ao AutoWebGame">
          <span class="account-brand__mark" aria-hidden="true">BP</span>
          <span><small>IDENTIDADE DE JOGADOR</small><strong>BOMBA PVP</strong></span>
        </a>
        <a class="account-back" href="/game"><span aria-hidden="true">←</span> Voltar ao jogo</a>
      </header>

      <main class="account-layout">
        <section class="account-manifesto" aria-labelledby="account-manifesto-title">
          <p class="account-overline"><span></span> SISTEMA DE ACESSO / 01</p>
          <h1 id="account-manifesto-title">Sua identidade entra na arena com você.</h1>
          <p class="account-manifesto__lede">
            Uma conta única para partidas online, progresso, compras e administração — sem perfis descartáveis ou logins paralelos.
          </p>
          <div class="account-signal" aria-label="Garantias da conta">
            <article><span>01</span><div><strong>Sessão protegida</strong><p>Cookie HttpOnly, expiração automática e senha armazenada apenas como hash.</p></div></article>
            <article><span>02</span><div><strong>Nome reservado</strong><p>Seu username permanece ligado ao mesmo perfil e ao histórico comercial.</p></div></article>
            <article><span>03</span><div><strong>Acesso por papel</strong><p>Jogadores entram no jogo. Administradores seguem direto para o painel.</p></div></article>
          </div>
          <footer class="account-manifesto__footer">
            <span><i></i> AUTENTICAÇÃO ONLINE</span>
            <span>PBKDF2 · SHA-256</span>
          </footer>
        </section>

        <section class="account-deck" aria-label="Acesso à conta">
          <div class="account-deck__registration" aria-hidden="true">ACCESS / SECURE</div>
          <div class="account-auth-panel" data-account-auth-panel>
            <div class="account-tabs" role="tablist" aria-label="Escolha entrar ou criar conta">
              <button type="button" role="tab" data-account-tab="login">Entrar</button>
              <button type="button" role="tab" data-account-tab="register">Criar conta</button>
            </div>

            <form class="account-form" data-account-form="login" novalidate>
              <div class="account-form__heading">
                <p>Bem-vindo de volta</p>
                <h2>Entrar na conta</h2>
                <span>Use o mesmo acesso em qualquer dispositivo.</span>
              </div>
              <label class="account-field">
                <span>E-mail</span>
                <input data-login-email type="email" inputmode="email" autocomplete="email" maxlength="254" required placeholder="voce@email.com" />
              </label>
              <label class="account-field">
                <span>Senha</span>
                <input data-login-password type="password" autocomplete="current-password" maxlength="${PASSWORD_MAX_LENGTH}" required placeholder="Sua senha" />
              </label>
              <button class="account-submit" data-login-submit type="submit"><span>Entrar</span><span aria-hidden="true">→</span></button>
              <p class="account-form__fineprint">Ao entrar, sua sessão fica disponível apenas neste navegador.</p>
            </form>

            <form class="account-form" data-account-form="register" novalidate hidden>
              <div class="account-form__heading">
                <p>Novo piloto</p>
                <h2>Criar sua identidade</h2>
                <span>Três dados. Uma conta persistente.</span>
              </div>
              <label class="account-field">
                <span>Username</span>
                <input data-register-username type="text" autocomplete="username" minlength="3" maxlength="16" pattern="[A-Za-z0-9_]+" required placeholder="Seu nome na arena" />
                <small>3–16 caracteres: letras, números e underscore.</small>
              </label>
              <label class="account-field">
                <span>E-mail</span>
                <input data-register-email type="email" inputmode="email" autocomplete="email" maxlength="254" required placeholder="voce@email.com" />
              </label>
              <div class="account-form__split">
                <label class="account-field">
                  <span>Senha</span>
                  <input data-register-password type="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" maxlength="${PASSWORD_MAX_LENGTH}" required placeholder="${PASSWORD_MIN_LENGTH}+ caracteres" />
                </label>
                <label class="account-field">
                  <span>Confirmar senha</span>
                  <input data-register-confirmation type="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" maxlength="${PASSWORD_MAX_LENGTH}" required placeholder="Repita a senha" />
                </label>
              </div>
              <button class="account-submit" data-register-submit type="submit"><span>Criar conta</span><span aria-hidden="true">→</span></button>
              <p class="account-form__fineprint">Sua senha nunca é salva em texto puro.</p>
            </form>

            <p class="account-status" data-account-status role="status" aria-live="polite"></p>
          </div>

          <section class="account-session" data-account-panel hidden aria-labelledby="account-session-title">
            <p class="account-overline"><span></span> SESSÃO ATIVA</p>
            <h2 id="account-session-title">Conta pronta para jogar.</h2>
            <dl>
              <div><dt>Username</dt><dd data-account-name></dd></div>
              <div><dt>E-mail</dt><dd data-account-email></dd></div>
              <div><dt>Papel</dt><dd data-account-role></dd></div>
            </dl>
            <div class="account-session__actions">
              <a class="account-submit" href="/game/play"><span>Entrar na arena</span><span aria-hidden="true">→</span></a>
              <button class="account-secondary" data-account-logout type="button">Sair da conta</button>
            </div>
          </section>
        </section>
      </main>
    `;

    this.nodes = {
      shell,
      authPanel: requireElement(shell, "[data-account-auth-panel]"),
      accountPanel: requireElement(shell, "[data-account-panel]"),
      loginTab: requireElement(shell, '[data-account-tab="login"]'),
      registerTab: requireElement(shell, '[data-account-tab="register"]'),
      loginForm: requireElement(shell, '[data-account-form="login"]'),
      registerForm: requireElement(shell, '[data-account-form="register"]'),
      loginEmail: requireElement(shell, "[data-login-email]"),
      loginPassword: requireElement(shell, "[data-login-password]"),
      registerUsername: requireElement(shell, "[data-register-username]"),
      registerEmail: requireElement(shell, "[data-register-email]"),
      registerPassword: requireElement(shell, "[data-register-password]"),
      registerPasswordConfirmation: requireElement(shell, "[data-register-confirmation]"),
      loginSubmit: requireElement(shell, "[data-login-submit]"),
      registerSubmit: requireElement(shell, "[data-register-submit]"),
      status: requireElement(shell, "[data-account-status]"),
      accountName: requireElement(shell, "[data-account-name]"),
      accountEmail: requireElement(shell, "[data-account-email]"),
      accountRole: requireElement(shell, "[data-account-role]"),
      logoutButton: requireElement(shell, "[data-account-logout]"),
    };
    return shell;
  }

  private bindEvents(): void {
    const nodes = this.requireNodes();
    const signal = this.abortController.signal;
    nodes.loginTab.addEventListener("click", () => this.setMode("login"), { signal });
    nodes.registerTab.addEventListener("click", () => this.setMode("register"), { signal });
    nodes.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.login();
    }, { signal });
    nodes.registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.register();
    }, { signal });
    nodes.logoutButton.addEventListener("click", () => void this.logout(), { signal });
  }

  private setMode(mode: AccountPageMode): void {
    const nodes = this.requireNodes();
    const login = mode === "login";
    nodes.loginForm.hidden = !login;
    nodes.registerForm.hidden = login;
    nodes.loginTab.setAttribute("aria-selected", String(login));
    nodes.registerTab.setAttribute("aria-selected", String(!login));
    nodes.loginTab.classList.toggle("is-active", login);
    nodes.registerTab.classList.toggle("is-active", !login);
    this.setStatus("");
  }

  private async refreshSession(): Promise<void> {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: this.abortController.signal,
      });
      if (!response.ok) return;
      const payload = await response.json() as { account?: PlayerAccount | null };
      if (payload.account) {
        if (payload.account.authLevel === "username") {
          const nodes = this.requireNodes();
          nodes.registerUsername.value = payload.account.username;
          this.setMode("register");
          this.setStatus("Conclua o cadastro para preservar seu perfil e histórico.");
          return;
        }
        this.activateAccount(payload.account);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.setStatus("Não foi possível consultar sua sessão agora.", "error");
      }
    }
  }

  private async login(): Promise<void> {
    if (this.busy) return;
    const nodes = this.requireNodes();
    if (!nodes.loginForm.reportValidity()) return;
    await this.submitAuth("login", {
      email: nodes.loginEmail.value,
      password: nodes.loginPassword.value,
    });
  }

  private async register(): Promise<void> {
    if (this.busy) return;
    const nodes = this.requireNodes();
    if (!nodes.registerForm.reportValidity()) return;
    if (nodes.registerPassword.value !== nodes.registerPasswordConfirmation.value) {
      this.setStatus("As senhas não coincidem.", "error");
      nodes.registerPasswordConfirmation.focus();
      return;
    }
    await this.submitAuth("register", {
      username: nodes.registerUsername.value,
      email: nodes.registerEmail.value,
      password: nodes.registerPassword.value,
    });
  }

  private async submitAuth(
    action: "login" | "register",
    body: Record<string, string>,
  ): Promise<void> {
    const nodes = this.requireNodes();
    this.setBusy(true);
    this.setStatus(action === "login" ? "Validando acesso…" : "Criando sua identidade…");
    try {
      const response = await fetch(action === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });
      const payload = await response.json() as {
        account?: PlayerAccount;
        error?: string;
      };
      if (!response.ok || !payload.account) {
        this.setStatus(payload.error ?? "Não foi possível concluir o acesso.", "error");
        return;
      }
      nodes.loginPassword.value = "";
      nodes.registerPassword.value = "";
      nodes.registerPasswordConfirmation.value = "";
      this.activateAccount(payload.account);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.setStatus("Falha de conexão. Tente novamente.", "error");
      }
    } finally {
      this.setBusy(false);
    }
  }

  private activateAccount(account: PlayerAccount): void {
    if (account.role === "admin") {
      window.location.assign("/admin");
      return;
    }
    const nodes = this.requireNodes();
    nodes.accountName.textContent = account.displayName || account.username;
    nodes.accountEmail.textContent = account.email ?? "Conta rápida pendente de migração";
    nodes.accountRole.textContent = "Jogador";
    nodes.authPanel.hidden = true;
    nodes.accountPanel.hidden = false;
  }

  private async logout(): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        signal: this.abortController.signal,
      });
      const nodes = this.requireNodes();
      nodes.accountPanel.hidden = true;
      nodes.authPanel.hidden = false;
      this.setMode("login");
      this.setStatus("Sessão encerrada.");
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const nodes = this.requireNodes();
    nodes.loginSubmit.disabled = busy;
    nodes.registerSubmit.disabled = busy;
    nodes.logoutButton.disabled = busy;
  }

  private setStatus(message: string, state: "neutral" | "error" = "neutral"): void {
    const status = this.requireNodes().status;
    status.textContent = message;
    status.dataset.state = state;
  }

  private requireNodes(): AccountPageNodes {
    if (!this.nodes) {
      throw new Error("Account page is not mounted.");
    }
    return this.nodes;
  }
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing account page element: ${selector}`);
  }
  return element;
}
