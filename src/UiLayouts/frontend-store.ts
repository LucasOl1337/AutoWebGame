import type { FrontendRoute } from "./frontend-router";

export type LauncherMode = "play" | "training" | "lab";

export interface FrontendState {
  route: FrontendRoute;
  selectedMode: LauncherMode;
  bootingGame: boolean;
}

type Listener = (state: Readonly<FrontendState>) => void;

export class FrontendStore {
  private state: FrontendState;
  private readonly listeners = new Set<Listener>();

  constructor(initialRoute: FrontendRoute) {
    this.state = Object.freeze({
      route: initialRoute,
      selectedMode: initialRoute === "launcher" ? "play" : (initialRoute as LauncherMode),
      bootingGame: false,
    });
  }

  getSnapshot(): Readonly<FrontendState> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setRoute(route: FrontendRoute): void {
    this.update({
      route,
      selectedMode: route === "launcher" ? this.state.selectedMode : (route as LauncherMode),
    });
  }

  selectMode(selectedMode: LauncherMode): void {
    this.update({ selectedMode });
  }

  setBootingGame(bootingGame: boolean): void {
    this.update({ bootingGame });
  }

  private update(patch: Partial<FrontendState>): void {
    const next = Object.freeze({ ...this.state, ...patch });
    if (JSON.stringify(next) === JSON.stringify(this.state)) {
      return;
    }
    this.state = next;
    this.listeners.forEach((listener) => listener(this.state));
  }
}
