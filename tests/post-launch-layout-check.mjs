import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const contractStart = css.indexOf("/* Post-launch ignition surface contract */");
const contract = contractStart >= 0 ? css.slice(contractStart) : "";

const required = [
  ".experience-shell[data-screen=\"setup\"]",
  "overflow-y: auto",
  "width: min(1480px, 100%)",
  "grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr)",
  "@media (max-width: 1080px)",
  "grid-template-columns: minmax(0, 1fr)",
  "@media (max-width: 760px)",
  "padding-inline: max(14px, env(safe-area-inset-left))",
  "overflow-x: clip",
];

const missing = required.filter((token) => !contract.includes(token));
const pass = contractStart >= 0 && missing.length === 0;
console.log(JSON.stringify({ contractStart, missing, pass }, null, 2));
if (!pass) process.exit(1);
