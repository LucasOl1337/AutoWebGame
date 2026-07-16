import type { CanonicalExperience } from "../FrontendKernel/frontend-kernel";
import { PUBLIC_ROUTE_POINTER } from "../FrontendKernel/public-route-pointer";

const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const canonicalLauncherRoutes = new Set([
  "/",
  "/game",
  "/jogar/personagem",
  "/treino/personagem",
  "/como-jogar",
  "/conta",
  "/ajuda",
  "/configuracoes",
  "/laboratorio",
]);
const isCanonicalLauncherRoute = canonicalLauncherRoutes.has(pathname)
  || /^\/sala\/[A-Za-z0-9_-]{8,128}$/.test(pathname);

if (PUBLIC_ROUTE_POINTER === "canonical" && isCanonicalLauncherRoute) {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("#app root not found");

  const [kernelModule, identityModule, viewModule] = await Promise.all([
    import("../FrontendKernel/frontend-kernel"),
    import("../FrontendKernel/identity-adapter"),
    import("../FrontendKernel/canonical-launcher-view"),
  ]);
  const unavailable = parseUnavailableExperiences(
    document.documentElement.dataset.unavailableExperiences,
  );
  const navigation = new kernelModule.BrowserNavigationAdapter(unavailable);
  const identity = new identityModule.BrowserIdentityAdapter();
  const kernel = new kernelModule.FrontendKernel(navigation, identity);
  const view = new viewModule.CanonicalLauncherView(root, kernel);
  view.mount();
  window.addEventListener("pagehide", () => {
    view.dispose();
    kernel.dispose();
  }, { once: true });
} else if (!(PUBLIC_ROUTE_POINTER === "legacy" && pathname === "/")) {
  await import("./legacy-bootstrap");
}

function parseUnavailableExperiences(configured: string | undefined): CanonicalExperience[] {
  const known = new Set<CanonicalExperience>(["continuous-room", "training", "lab"]);
  return (configured ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is CanonicalExperience => known.has(value as CanonicalExperience));
}
