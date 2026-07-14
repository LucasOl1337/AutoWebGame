import { readFile } from "node:fs/promises";

const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const sessionSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const ptProof = SITE_COPY.pt.landing.commercialProof;
const enProof = SITE_COPY.en.landing.commercialProof;

const checks = {
  portugueseLeadNamesFounderAccess: SITE_COPY.pt.landing.lead.includes("acesso fundador"),
  englishLeadNamesFounderAccess: SITE_COPY.en.landing.lead.includes("founder access"),
  primaryCtasAreActionOriented: SITE_COPY.pt.landing.quickMatch === "Jogar partida rapida"
    && SITE_COPY.en.landing.quickMatch === "Play quick match",
  secondaryCtasExplainTryAndBrowse: SITE_COPY.pt.landing.botMatch === "Testar contra bots"
    && SITE_COPY.en.landing.botMatch === "Try vs bots"
    && SITE_COPY.pt.landing.enterLobby === "Ver lobbies abertos"
    && SITE_COPY.en.landing.enterLobby === "View open lobbies",
  proofHasThreeLocalizedPoints: ptProof.length === 3
    && enProof.length === 3
    && ptProof[0] !== enProof[0],
  proofMentionsCommercialAccountLink: ptProof.some((item) => item.includes("Compra vinculada"))
    && enProof.some((item) => item.includes("Purchase tied")),
  sessionRendersProofList: sessionSource.includes("experience-commercial-proof")
    && sessionSource.includes("copy.landing.commercialProof"),
  cssStylesProofList: cssSource.includes(".experience-commercial-proof")
    && cssSource.includes(".experience-commercial-proof li::before"),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  checks,
  failedChecks,
  ptLead: SITE_COPY.pt.landing.lead,
  enLead: SITE_COPY.en.landing.lead,
  ptProof,
  enProof,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
