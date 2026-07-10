import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatLobbyReadyReminder } from "../output/esm/NetCode/session-client.js";
import { SITE_COPY } from "../output/esm/UiLayouts/i18n.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionSource = fs.readFileSync(path.join(root, "src/NetCode/session-client.ts"), "utf8");

function seat({ clientId = null, displayName = null, ready = false, occupantType = "empty" } = {}) {
  return { clientId, displayName, characterIndex: 0, ready, occupantType };
}

function lobby(seats) {
  return {
    roomCode: "READY1",
    title: "Reminder check",
    status: "open",
    roomMode: "classic",
    roomKind: "manual",
    createdAt: 0,
    seats,
    occupantCount: Object.values(seats).filter((entry) => entry.clientId || entry.occupantType === "bot").length,
  };
}

const oneWaiting = lobby({
  1: seat({ clientId: "self", displayName: "Ari", ready: true, occupantType: "human" }),
  2: seat({ clientId: "guest", displayName: "Nico", occupantType: "human" }),
  3: seat(),
  4: seat(),
});

const twoWaiting = lobby({
  1: seat({ clientId: "self", displayName: "Ari", ready: true, occupantType: "human" }),
  2: seat({ clientId: "guest", displayName: "Nico", occupantType: "human" }),
  3: seat({ clientId: "guest-2", occupantType: "human" }),
  4: seat(),
});

const everyoneReady = lobby({
  1: seat({ clientId: "self", displayName: "Ari", ready: true, occupantType: "human" }),
  2: seat({ clientId: "guest", displayName: "Nico", ready: true, occupantType: "human" }),
  3: seat(),
  4: seat(),
});

const report = {
  portugueseNamesSinglePlayer: formatLobbyReadyReminder(SITE_COPY.pt, oneWaiting)
    === "Ainda precisa marcar pronto: Nico (P2).",
  englishNamesSinglePlayer: formatLobbyReadyReminder(SITE_COPY.en, oneWaiting)
    === "Still needs to ready up: Nico (P2).",
  multiplePlayersIncludeFallbackSeat: formatLobbyReadyReminder(SITE_COPY.pt, twoWaiting)
    === "Ainda precisam marcar pronto: Nico (P2), P3.",
  emptySeatsAreIgnored: !formatLobbyReadyReminder(SITE_COPY.en, twoWaiting).includes("P4"),
  everyoneReadyStarts: formatLobbyReadyReminder(SITE_COPY.pt, everyoneReady)
    === "Todos estao prontos. Iniciando partida...",
  setupUsesReminder: sessionSource.includes(": formatLobbyReadyReminder(copy, lobby);"),
};

report.pass = Object.values(report).every(Boolean);
console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
