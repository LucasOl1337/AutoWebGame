import type { CanonicalExperience } from "../FrontendKernel/frontend-kernel";
import { PUBLIC_ROUTE_POINTER } from "../FrontendKernel/public-route-pointer";

const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const isCanonicalLauncherRoute = pathname === "/" || pathname === "/game";

if (PUBLIC_ROUTE_POINTER === "canonical" && isCanonicalLauncherRoute) {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("#app root not found");

  const [kernelModule, viewModule] = await Promise.all([
    import("../FrontendKernel/frontend-kernel"),
    import("../FrontendKernel/canonical-launcher-view"),
  ]);
  const unavailable = parseUnavailableExperiences(
    document.documentElement.dataset.unavailableExperiences,
  );
  const navigation = new kernelModule.BrowserNavigationAdapter(unavailable);
  const kernel = new kernelModule.FrontendKernel(navigation);
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
