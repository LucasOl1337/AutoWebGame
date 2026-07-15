import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/bootstrap-drone.css", import.meta.url), "utf8");

const checks = {
  droneAssetRemainsIntegrated: css.includes('url("/Assets/UiLayouts/bootstrap-drone-estopim.png")'),
  fuseGlowIsAnchoredToDrone: css.includes(".bootstrap-state__indicator::before")
    && css.includes("bootstrap-fuse-glow"),
  fuseSparkUsesPixelShape: css.includes(".bootstrap-state__indicator::after")
    && css.includes("bootstrap-fuse-spark")
    && css.includes("steps(3, jump-none)"),
  errorStateStopsFuse: /data-state="error"[\s\S]*?indicator::before,[\s\S]*?content: none/.test(css),
  reducedMotionStopsAllLayers: /prefers-reduced-motion: reduce[\s\S]*?indicator::before,[\s\S]*?indicator::after[\s\S]*?animation: none/.test(css),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ checks, failedChecks, pass: failedChecks.length === 0 }, null, 2));

if (failedChecks.length > 0) process.exit(1);
