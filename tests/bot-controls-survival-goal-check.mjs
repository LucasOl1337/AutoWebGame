import fs from "node:fs";
import assert from "node:assert/strict";

const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const sessionClientSource = fs.readFileSync(
  new URL("../src/NetCode/session-client.ts", import.meta.url),
  "utf8",
);

const ptHint = SITE_COPY.pt.landing.localControlsHint;
const enHint = SITE_COPY.en.landing.localControlsHint;

const checks = {
  ptStatesLastBomberGoal: ptHint.includes("Objetivo: seja o último bomber vivo."),
  enStatesLastBomberGoal: enHint.includes("Objective: be the last bomber alive."),
  existingHintWiringIsUsed:
    sessionClientSource.includes("landingControlsHint.textContent = copy.landing.localControlsHint;")
    && sessionClientSource.includes("landingControlsHeader.append(landingControlsTitle, landingControlsHint);"),
};

assert.ok(checks.ptStatesLastBomberGoal, `Texto PT inesperado: ${ptHint}`);
assert.ok(checks.enStatesLastBomberGoal, `Texto EN inesperado: ${enHint}`);
assert.ok(checks.existingHintWiringIsUsed, "O wiring existente de localControlsHint não foi encontrado.");

console.log(JSON.stringify({ checks, ptHint, enHint, pass: true }, null, 2));
