import {
  InMemoryIdentityAdapter,
  type IdentityAdapter,
} from "./identity-adapter";

export type CanonicalExperience = "continuous-room" | "training" | "lab";

export type AuxiliaryScreen = "how-to-play" | "account" | "help" | "settings";

export type AuxiliaryRoute = "/como-jogar" | "/conta" | "/ajuda" | "/configuracoes";

export type FrontendIntent =
  | { readonly type: "activate-experience"; readonly experience: CanonicalExperience }
  | { readonly type: "open-auxiliary"; readonly auxiliary: AuxiliaryScreen }
  | { readonly type: "edit-temporary-nick"; readonly value: string }
  | { readonly type: "save-temporary-nick" }
  | { readonly type: "retry-identity" }
  | { readonly type: "open-account-access"; readonly returnTo?: string }
  | { readonly type: "navigate-back" };

export type FrontendOperation = Readonly<{
  experience: CanonicalExperience;
  label: string;
  status: "leaving" | "unavailable";
}>;

export type LauncherExperience = Readonly<{
  experience: CanonicalExperience;
  href: DelegatedRoute;
  label: string;
  sequence: string;
  description: string;
  action: string;
  emphasis: "primary" | "secondary";
}>;

type LauncherFocusTarget = CanonicalExperience | "status" | null;

export type IdentitySnapshot = Readonly<
  | {
      status: "loading";
      temporaryNick: string;
      draftNick: string;
    }
  | {
      status: "visitor";
      temporaryNick: string;
      draftNick: string;
      validationMessage: string | null;
    }
  | {
      status: "authenticated";
      accountId: string;
      username: string;
      displayName: string;
    }
  | {
      status: "error";
      temporaryNick: string;
      draftNick: string;
      validationMessage: string | null;
      message: string;
    }
>;

export type FrontendSnapshot = Readonly<
  | {
      screen: "launcher";
      route: "/" | "/game";
      experiences: readonly LauncherExperience[];
      operation: FrontendOperation | null;
      focusTarget: LauncherFocusTarget;
      identity: IdentitySnapshot;
    }
  | {
      screen: "auxiliary";
      route: AuxiliaryRoute;
      auxiliary: AuxiliaryScreen;
      title: string;
      description: string;
      identity: IdentitySnapshot;
      operation: null;
    }
  | {
      screen: "lab-access";
      route: "/laboratorio";
      title: string;
      description: string;
      identity: IdentitySnapshot;
      operation: FrontendOperation | null;
    }
  | {
      screen: "delegated";
      route: DelegatedRoute;
      experience: CanonicalExperience;
      operation: null;
    }
>;

export interface FrontendKernelInterface {
  dispatch(intent: FrontendIntent): void;
  getSnapshot(): FrontendSnapshot;
  subscribe(listener: (snapshot: FrontendSnapshot) => void): () => void;
  dispose(): void;
}

type DelegatedRoute = "/game/play" | "/game/training" | "/game/lab";

type NavigationRequest = Readonly<{
  experience: CanonicalExperience;
  href: DelegatedRoute;
  label: string;
}>;

interface NavigationHandle {
  cancel(): boolean;
  isCommitted(): boolean;
}

interface NavigationAdapter {
  currentPath(): string;
  request(request: NavigationRequest): NavigationHandle;
  back(): void;
  visit(pathname: AuxiliaryRoute | "/laboratorio"): void;
  replace(pathname: "/"): void;
  openAccount(returnTo: "/" | "/laboratorio"): void;
  subscribe(listener: (pathname: string) => void): () => void;
  isUnavailable(experience: CanonicalExperience): boolean;
}

const AUXILIARY_CATALOG: Readonly<Record<AuxiliaryScreen, Readonly<{
  route: AuxiliaryRoute;
  title: string;
  description: string;
}>>> = Object.freeze({
  "how-to-play": Object.freeze({
    route: "/como-jogar",
    title: "Como jogar",
    description: "Movimente-se, abra caminho com bombas e sobreviva à última explosão da Rodada.",
  }),
  account: Object.freeze({
    route: "/conta",
    title: "Conta",
    description: "Consulte sua identidade ou entre para preservar reconhecimento e acesso ao Laboratório Bot vs Bot.",
  }),
  help: Object.freeze({
    route: "/ajuda",
    title: "Ajuda",
    description: "Encontre recuperação de acesso, conectividade e controles sem sair do Posto de Comando.",
  }),
  settings: Object.freeze({
    route: "/configuracoes",
    title: "Configurações",
    description: "Preferências de apresentação ficam separadas das decisões de entrada em combate.",
  }),
});

const AUXILIARY_BY_ROUTE = new Map(
  Object.entries(AUXILIARY_CATALOG).map(([auxiliary, content]) => [
    content.route,
    { auxiliary: auxiliary as AuxiliaryScreen, ...content },
  ] as const),
);

const EXPERIENCE_CATALOG: readonly LauncherExperience[] = Object.freeze([
  Object.freeze({
    experience: "continuous-room",
    href: "/game/play",
    label: "Sala contínua",
    sequence: "01 / Principal",
    description: "Jogar agora com quatro Vagas e Rodadas em sequência.",
    action: "Jogar agora",
    emphasis: "primary",
  }),
  Object.freeze({
    experience: "training",
    href: "/game/training",
    label: "Treino contra bots",
    sequence: "02 / Local",
    description: "Pratique o combate no seu ritmo, sem Fila da sala ou conta.",
    action: "Preparar treino",
    emphasis: "secondary",
  }),
  Object.freeze({
    experience: "lab",
    href: "/game/lab",
    label: "Laboratório Bot vs Bot",
    sequence: "03 / Observação",
    description: "Configure e observe Competidores de laboratório publicados.",
    action: "Abrir Laboratório Bot vs Bot",
    emphasis: "secondary",
  }),
]);

const EXPERIENCES = new Map(
  EXPERIENCE_CATALOG.map((experience) => [experience.experience, experience] as const),
);

export class FrontendKernel implements FrontendKernelInterface {
  private snapshot: FrontendSnapshot;
  private readonly listeners = new Set<(snapshot: FrontendSnapshot) => void>();
  private readonly unsubscribeNavigation: () => void;
  private pendingNavigation: NavigationHandle | null = null;
  private identityRequest: AbortController | null = null;
  private identityRevision = 0;
  private disposed = false;

  constructor(
    private readonly navigation: NavigationAdapter,
    private readonly identity: IdentityAdapter = new InMemoryIdentityAdapter(),
  ) {
    const temporaryNick = identity.readTemporaryNick();
    this.snapshot = snapshotForPath(
      navigation.currentPath(),
      loadingIdentity(temporaryNick),
    );
    this.unsubscribeNavigation = navigation.subscribe((pathname) => {
      if (!this.disposed) {
        this.pendingNavigation = null;
        this.update(snapshotForPath(pathname, identityForSnapshot(this.snapshot)));
      }
    });
    this.loadIdentity();
  }

  dispatch(intent: FrontendIntent): void {
    if (this.disposed) return;

    switch (intent.type) {
      case "navigate-back":
        this.navigateBack();
        return;
      case "open-auxiliary":
        this.openAuxiliary(intent.auxiliary);
        return;
      case "edit-temporary-nick":
        this.editTemporaryNick(intent.value);
        return;
      case "save-temporary-nick":
        this.saveTemporaryNick();
        return;
      case "retry-identity":
        this.loadIdentity();
        return;
      case "open-account-access":
        this.openAccountAccess(intent.returnTo);
        return;
      default:
        break;
    }

    if (this.snapshot.screen === "lab-access") {
      this.activateLabFromAccess(intent);
      return;
    }

    if (this.snapshot.screen !== "launcher" || this.snapshot.operation !== null) return;

    const destination = EXPERIENCES.get(intent.experience);
    if (!destination) return;

    if (this.navigation.isUnavailable(intent.experience)) {
      this.update(
        launcherSnapshot(this.snapshot.route, {
          experience: intent.experience,
          label: `${destination.label} indisponível`,
          status: "unavailable",
        }, "status", this.snapshot.identity),
      );
      return;
    }

    if (intent.experience === "lab" && this.snapshot.identity.status !== "authenticated") {
      this.navigation.visit("/laboratorio");
      return;
    }

    this.update(
      launcherSnapshot(this.snapshot.route, {
        experience: intent.experience,
        label: `Abrindo ${destination.label}`,
        status: "leaving",
      }, "status", this.snapshot.identity),
    );
    this.pendingNavigation = this.navigation.request({
      experience: destination.experience,
      href: destination.href,
      label: destination.label,
    });
  }

  getSnapshot(): FrontendSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: FrontendSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingNavigation?.cancel();
    this.pendingNavigation = null;
    this.identityRequest?.abort();
    this.identityRequest = null;
    this.unsubscribeNavigation();
    this.listeners.clear();
  }

  private navigateBack(): void {
    if (this.snapshot.screen === "delegated") {
      this.navigation.back();
      return;
    }

    const operation = this.snapshot.operation;
    if (operation !== null) {
      this.pendingNavigation?.cancel();
      this.pendingNavigation = null;
      if (this.snapshot.screen === "launcher") {
        this.update(launcherSnapshot(
          this.snapshot.route,
          null,
          operation.experience,
          this.snapshot.identity,
        ));
      } else if (this.snapshot.screen === "lab-access") {
        this.update(labAccessSnapshot(this.snapshot.identity, null));
      }
      return;
    }

    if (this.snapshot.screen === "auxiliary" || this.snapshot.screen === "lab-access") {
      this.navigation.replace("/");
    }
  }

  private activateLabFromAccess(intent: Extract<FrontendIntent, { type: "activate-experience" }>): void {
    if (
      intent.experience !== "lab"
      || this.snapshot.screen !== "lab-access"
      || this.snapshot.operation !== null
      || this.snapshot.identity.status !== "authenticated"
    ) return;
    const destination = EXPERIENCES.get("lab");
    if (!destination) return;
    if (this.navigation.isUnavailable("lab")) {
      this.update(labAccessSnapshot(this.snapshot.identity, {
        experience: "lab",
        label: `${destination.label} indisponível`,
        status: "unavailable",
      }));
      return;
    }
    this.update(labAccessSnapshot(this.snapshot.identity, {
      experience: "lab",
      label: `Abrindo ${destination.label}`,
      status: "leaving",
    }));
    this.pendingNavigation = this.navigation.request({
      experience: destination.experience,
      href: destination.href,
      label: destination.label,
    });
  }

  private openAuxiliary(auxiliary: AuxiliaryScreen): void {
    if (this.snapshot.screen !== "launcher" || this.snapshot.operation !== null) return;
    this.navigation.visit(AUXILIARY_CATALOG[auxiliary].route);
  }

  private editTemporaryNick(value: string): void {
    const current = identityForSnapshot(this.snapshot);
    if (current.status === "authenticated" || current.status === "loading") return;
    this.update(withIdentity(this.snapshot, Object.freeze({
      ...current,
      draftNick: value.slice(0, 32),
      validationMessage: null,
    })));
  }

  private saveTemporaryNick(): void {
    const current = identityForSnapshot(this.snapshot);
    if (current.status === "authenticated" || current.status === "loading") return;
    const validation = validateTemporaryNick(current.draftNick);
    if (!validation.ok) {
      this.update(withIdentity(this.snapshot, Object.freeze({
        ...current,
        validationMessage: validation.message,
      })));
      return;
    }

    this.identity.writeTemporaryNick(validation.value);
    this.update(withIdentity(this.snapshot, Object.freeze({
      ...current,
      temporaryNick: validation.value,
      draftNick: validation.value,
      validationMessage: null,
    })));
  }

  private openAccountAccess(returnTo = "/"): void {
    if (this.snapshot.screen === "delegated") return;
    const safeReturn = returnTo === "/laboratorio" ? "/laboratorio" : "/";
    this.navigation.openAccount(safeReturn);
  }

  private loadIdentity(): void {
    this.identityRequest?.abort();
    const controller = new AbortController();
    const revision = ++this.identityRevision;
    this.identityRequest = controller;
    const current = identityForSnapshot(this.snapshot);
    const temporaryNick = current.status === "authenticated"
      ? this.identity.readTemporaryNick()
      : current.temporaryNick;
    this.update(withIdentity(this.snapshot, loadingIdentity(temporaryNick)));

    void this.identity.load(controller.signal).then((account) => {
      if (this.disposed || controller.signal.aborted || revision !== this.identityRevision) return;
      this.identityRequest = null;
      const nextIdentity: IdentitySnapshot = account
        ? Object.freeze({
            status: "authenticated",
            accountId: account.id,
            username: account.username,
            displayName: account.displayName,
          })
        : visitorIdentity(temporaryNick);
      this.update(withIdentity(this.snapshot, nextIdentity));
    }).catch((error: unknown) => {
      if (this.disposed || controller.signal.aborted || revision !== this.identityRevision) return;
      this.identityRequest = null;
      this.update(withIdentity(this.snapshot, Object.freeze({
        status: "error",
        temporaryNick,
        draftNick: temporaryNick,
        validationMessage: null,
        message: "Não foi possível confirmar sua sessão. Sala contínua e Treino contra bots continuam disponíveis.",
      })));
      if (isAbortError(error)) return;
    });
  }

  private update(next: FrontendSnapshot): void {
    if (snapshotsEqual(this.snapshot, next)) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener(next));
  }
}

export class BrowserNavigationAdapter implements NavigationAdapter {
  private readonly listeners = new Set<(pathname: string) => void>();
  private readonly unavailable: ReadonlySet<CanonicalExperience>;

  constructor(unavailable: readonly CanonicalExperience[] = []) {
    this.unavailable = new Set(unavailable);
    window.addEventListener("popstate", this.handlePopState);
  }

  currentPath(): string {
    return window.location.pathname;
  }

  request(request: NavigationRequest): NavigationHandle {
    let committed = false;
    let cancelled = false;
    let timer: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        committed = true;
        window.location.assign(request.href);
      }, 0);
    });

    return {
      cancel: () => {
        if (committed || cancelled) return false;
        cancelled = true;
        window.cancelAnimationFrame(frame);
        if (timer !== null) window.clearTimeout(timer);
        return true;
      },
      isCommitted: () => committed,
    };
  }

  back(): void {
    window.history.back();
  }

  visit(pathname: AuxiliaryRoute | "/laboratorio"): void {
    window.history.pushState({ canonicalRoute: pathname }, "", pathname);
    this.emit(pathname);
  }

  replace(pathname: "/"): void {
    window.history.replaceState({ canonicalRoute: pathname }, "", pathname);
    this.emit(pathname);
  }

  openAccount(returnTo: "/" | "/laboratorio"): void {
    window.location.assign(`/account?return=${encodeURIComponent(returnTo)}`);
  }

  subscribe(listener: (pathname: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        window.removeEventListener("popstate", this.handlePopState);
      }
    };
  }

  isUnavailable(experience: CanonicalExperience): boolean {
    return this.unavailable.has(experience);
  }

  private readonly handlePopState = (): void => {
    this.emit(window.location.pathname);
  };

  private emit(pathname: string): void {
    this.listeners.forEach((listener) => listener(pathname));
  }
}

export class InMemoryNavigationAdapter implements NavigationAdapter {
  readonly requests: NavigationRequest[] = [];
  backRequests = 0;
  cancelRequests = 0;
  readonly visits: string[] = [];
  readonly replacements: string[] = [];
  readonly accountRequests: ("/" | "/laboratorio")[] = [];
  private readonly listeners = new Set<(pathname: string) => void>();
  private pathname: string;
  private readonly unavailable: ReadonlySet<CanonicalExperience>;

  constructor(pathname: string, unavailable: readonly CanonicalExperience[] = []) {
    this.pathname = pathname;
    this.unavailable = new Set(unavailable);
  }

  currentPath(): string {
    return this.pathname;
  }

  request(request: NavigationRequest): NavigationHandle {
    this.requests.push(request);
    let committed = false;
    let cancelled = false;
    return {
      cancel: () => {
        if (committed || cancelled) return false;
        cancelled = true;
        this.cancelRequests += 1;
        return true;
      },
      isCommitted: () => committed,
    };
  }

  back(): void {
    this.backRequests += 1;
  }

  visit(pathname: AuxiliaryRoute | "/laboratorio"): void {
    this.visits.push(pathname);
    this.pathname = pathname;
    this.listeners.forEach((listener) => listener(pathname));
  }

  replace(pathname: "/"): void {
    this.replacements.push(pathname);
    this.pathname = pathname;
    this.listeners.forEach((listener) => listener(pathname));
  }

  openAccount(returnTo: "/" | "/laboratorio"): void {
    this.accountRequests.push(returnTo);
  }

  subscribe(listener: (pathname: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isUnavailable(experience: CanonicalExperience): boolean {
    return this.unavailable.has(experience);
  }

}

function snapshotForPath(pathname: string, identity: IdentitySnapshot): FrontendSnapshot {
  const normalized = normalizePath(pathname);
  if (normalized === "/game/play") return delegatedSnapshot(normalized, "continuous-room");
  if (normalized === "/game/training") return delegatedSnapshot(normalized, "training");
  if (normalized === "/game/lab") return delegatedSnapshot(normalized, "lab");
  if (normalized === "/laboratorio") {
    return labAccessSnapshot(identity, null);
  }
  const auxiliary = AUXILIARY_BY_ROUTE.get(normalized as AuxiliaryRoute);
  if (auxiliary) {
    return Object.freeze({
      screen: "auxiliary",
      route: auxiliary.route,
      auxiliary: auxiliary.auxiliary,
      title: auxiliary.title,
      description: auxiliary.description,
      identity,
      operation: null,
    });
  }
  return launcherSnapshot(normalized === "/game" ? "/game" : "/", null, null, identity);
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return path || "/";
}

function launcherSnapshot(
  route: "/" | "/game",
  operation: FrontendOperation | null,
  focusTarget: LauncherFocusTarget,
  identity?: IdentitySnapshot,
): FrontendSnapshot {
  return Object.freeze({
    screen: "launcher",
    route,
    experiences: EXPERIENCE_CATALOG,
    operation: operation === null ? null : Object.freeze(operation),
    focusTarget,
    identity: identity ?? loadingIdentity("Visitante"),
  });
}

function delegatedSnapshot(
  route: DelegatedRoute,
  experience: CanonicalExperience,
): FrontendSnapshot {
  return Object.freeze({ screen: "delegated", route, experience, operation: null });
}

function snapshotsEqual(left: FrontendSnapshot, right: FrontendSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function identityForSnapshot(snapshot: FrontendSnapshot): IdentitySnapshot {
  return snapshot.screen === "delegated"
    ? loadingIdentity("Visitante")
    : snapshot.identity;
}

function withIdentity(snapshot: FrontendSnapshot, identity: IdentitySnapshot): FrontendSnapshot {
  if (snapshot.screen === "delegated") return snapshot;
  if (snapshot.screen === "launcher") {
    return launcherSnapshot(snapshot.route, snapshot.operation, snapshot.focusTarget, identity);
  }
  if (snapshot.screen === "lab-access") {
    return labAccessSnapshot(identity, snapshot.operation);
  }
  return snapshotForPath(snapshot.route, identity);
}

function labAccessSnapshot(
  identity: IdentitySnapshot,
  operation: FrontendOperation | null,
): Extract<FrontendSnapshot, { screen: "lab-access" }> {
  return Object.freeze({
    screen: "lab-access",
    route: "/laboratorio",
    title: "Laboratório Bot vs Bot",
    description: identity.status === "authenticated"
      ? "Sessão confirmada. Continue para configurar uma observação autoritativa."
      : "Entre com uma conta para configurar Competidores de laboratório publicados.",
    identity,
    operation: operation === null ? null : Object.freeze(operation),
  });
}

function loadingIdentity(temporaryNick: string): IdentitySnapshot {
  return Object.freeze({ status: "loading", temporaryNick, draftNick: temporaryNick });
}

function visitorIdentity(temporaryNick: string): IdentitySnapshot {
  return Object.freeze({
    status: "visitor",
    temporaryNick,
    draftNick: temporaryNick,
    validationMessage: null,
  });
}

function validateTemporaryNick(value: string):
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; message: string }> {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 16) {
    return Object.freeze({ ok: false, message: "Use de 3 a 16 caracteres." });
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(normalized)) {
    return Object.freeze({ ok: false, message: "Use letras, números, espaço, hífen ou underscore." });
  }
  return Object.freeze({ ok: true, value: normalized });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
