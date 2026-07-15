import { readFile } from "node:fs/promises";

const [css, entrypoint, sessionClient] = await Promise.all([
  readFile(new URL("../src/UiLayouts/arena-ignition-portal.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
]);

const checks = {
  stylesheetIsLoaded: entrypoint.includes('import "./arena-ignition-portal.css"'),
  activeCanvasConsumerExists: sessionClient.includes('canvas[data-game-canvas="true"]')
    && sessionClient.includes("experience-match__ignition-core"),
  energyRailsFrameViewport: css.includes(".experience-match__viewport::before")
    && css.includes(".experience-match__viewport::after")
    && css.includes("arena-ignition-rail"),
  coresReceivePulse: css.includes(".experience-match__ignition-core")
    && css.includes("arena-ignition-core"),
  canvasKeepsVisualPriority: css.includes('canvas[data-game-canvas="true"]')
    && css.includes("0 18px 52px"),
  compactViewportIsSupported: /max-width:\s*760px[\s\S]*?viewport::before/.test(css),
  reducedMotionIsRespected: /prefers-reduced-motion:\s*reduce[\s\S]*?animation:\s*none/.test(css),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ checks, failedChecks, pass: failedChecks.length === 0 }, null, 2));
if (failedChecks.length > 0) process.exit(1);
