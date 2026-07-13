export type FrontendRoute = "launcher" | "play" | "training" | "lab";

const ROUTE_PATHS: Record<FrontendRoute, string> = {
  launcher: "/game",
  play: "/game/play",
  training: "/game/training",
  lab: "/game/lab",
};

export function resolveFrontendRoute(pathname: string): FrontendRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/game.html" || normalized === "/game/play") return "play";
  if (normalized === "/game/training") return "training";
  if (normalized === "/game/lab") return "lab";
  return "launcher";
}

export function routeHref(route: FrontendRoute): string {
  return ROUTE_PATHS[route];
}

export function navigateToRoute(route: FrontendRoute): void {
  window.history.pushState({ route }, "", routeHref(route) + window.location.search);
  window.dispatchEvent(new PopStateEvent("popstate", { state: { route } }));
}
