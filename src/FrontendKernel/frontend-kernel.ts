export type CanonicalExperience = "continuous-room" | "training" | "lab";

export type FrontendIntent =
  | { readonly type: "activate-experience"; readonly experience: CanonicalExperience }
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

export type FrontendSnapshot = Readonly<
  | {
      screen: "launcher";
      route: "/" | "/game";
      experiences: readonly LauncherExperience[];
      operation: FrontendOperation | null;
      focusTarget: LauncherFocusTarget;
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
  subscribe(listener: (pathname: string) => void): () => void;
  isUnavailable(experience: CanonicalExperience): boolean;
}

const EXPERIENCE_CATALOG: readonly LauncherExperience[] = Object.freeze([
  Object.freeze({
    experience: "continuous-room",
    href: "/game/play",
    label: "Sala contínua",
    sequence: "01 / Principal",
    description: "Jogar agora com quatro Vagas e Rodadas em sequência.",
    action: "Entrar agora",
    emphasis: "primary",
  }),
  Object.freeze({
    experience: "training",
    href: "/game/training",
    label: "Treino contra bots",
    sequence: "02 / Local",
    description: "Pratique o combate no seu ritmo, sem Fila ou conta.",
    action: "Preparar treino",
    emphasis: "secondary",
  }),
  Object.freeze({
    experience: "lab",
    href: "/game/lab",
    label: "Laboratório Bot vs Bot",
    sequence: "03 / Observação",
    description: "Configure e observe Competidores de laboratório publicados.",
    action: "Abrir Laboratório",
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
  private disposed = false;

  constructor(private readonly navigation: NavigationAdapter) {
    this.snapshot = snapshotForPath(navigation.currentPath());
    this.unsubscribeNavigation = navigation.subscribe((pathname) => {
      if (!this.disposed) {
        this.pendingNavigation = null;
        this.update(snapshotForPath(pathname));
      }
    });
  }

  dispatch(intent: FrontendIntent): void {
    if (this.disposed) return;

    if (intent.type === "navigate-back") {
      this.navigateBack();
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
        }, "status"),
      );
      return;
    }

    this.update(
      launcherSnapshot(this.snapshot.route, {
        experience: intent.experience,
        label: `Abrindo ${destination.label}`,
        status: "leaving",
      }, "status"),
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
    this.unsubscribeNavigation();
    this.listeners.clear();
  }

  private navigateBack(): void {
    if (this.snapshot.screen === "delegated") {
      this.navigation.back();
      return;
    }

    const operation = this.snapshot.operation;
    if (operation === null) return;

    this.pendingNavigation?.cancel();
    this.pendingNavigation = null;
    this.update(launcherSnapshot(this.snapshot.route, null, operation.experience));
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
    const pathname = window.location.pathname;
    this.listeners.forEach((listener) => listener(pathname));
  };
}

export class InMemoryNavigationAdapter implements NavigationAdapter {
  readonly requests: NavigationRequest[] = [];
  backRequests = 0;
  cancelRequests = 0;
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

  subscribe(listener: (pathname: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isUnavailable(experience: CanonicalExperience): boolean {
    return this.unavailable.has(experience);
  }

  visit(pathname: string): void {
    this.pathname = pathname;
    this.listeners.forEach((listener) => listener(pathname));
  }
}

function snapshotForPath(pathname: string): FrontendSnapshot {
  const normalized = normalizePath(pathname);
  if (normalized === "/game/play") return delegatedSnapshot(normalized, "continuous-room");
  if (normalized === "/game/training") return delegatedSnapshot(normalized, "training");
  if (normalized === "/game/lab") return delegatedSnapshot(normalized, "lab");
  return launcherSnapshot(normalized === "/game" ? "/game" : "/", null, null);
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return path || "/";
}

function launcherSnapshot(
  route: "/" | "/game",
  operation: FrontendOperation | null,
  focusTarget: LauncherFocusTarget,
): FrontendSnapshot {
  return Object.freeze({
    screen: "launcher",
    route,
    experiences: EXPERIENCE_CATALOG,
    operation: operation === null ? null : Object.freeze(operation),
    focusTarget,
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
