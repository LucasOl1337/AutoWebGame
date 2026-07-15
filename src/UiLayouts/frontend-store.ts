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
      selectedMode: isLauncherMode(initialRoute) ? initialRoute : "play",
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
      selectedMode: isLauncherMode(route) ? route : this.state.selectedMode,
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

function isLauncherMode(route: FrontendRoute): route is LauncherMode {
  return route === "play" || route === "training" || route === "lab";
}
