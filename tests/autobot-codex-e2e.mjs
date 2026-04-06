import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const gameUrl = process.env.AUTOBOT_GAME_URL || "http://127.0.0.1:5174/game.html?autobot=3&codexbot=1";
const brokerBase = process.env.AUTOBOT_BROKER_URL || "http://127.0.0.1:8766";
const outputDir = path.join(rootDir, "output");
const screenshotPath = path.join(outputDir, "autobot-codex-e2e.png");
const logPaths = [
  path.join(rootDir, "auto-improvements", "logs", "live_agent_p1.log"),
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function brokerJson(pathname) {
  const response = await fetch(`${brokerBase}${pathname}`);
  if (!response.ok) {
    throw new Error(`Broker ${pathname} failed with ${response.status}`);
  }
  return response.json();
}

async function readLogTail(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).slice(-40).join("\n");
  } catch {
    return "";
  }
}

function summariseMovement(before, after, playerId) {
  const first = before.players.find((player) => player.id === playerId);
  const second = after.players.find((player) => player.id === playerId);
  const moved = Boolean(
    first?.tile
      && second?.tile
      && (first.tile.x !== second.tile.x || first.tile.y !== second.tile.y),
  );
  return {
    playerId,
    from: first?.tile ?? null,
    to: second?.tile ?? null,
    moved,
    aliveBefore: first?.alive ?? null,
    aliveAfter: second?.alive ?? null,
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: pickExecutablePath(),
});

try {
  await fsp.mkdir(outputDir, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__autobot), { timeout: 30000 });

  const snapshot = async () => page.evaluate(() => {
    const game = window.__autobot;
    const strictButton = [...document.querySelectorAll("button")]
      .find((button) => (button.textContent || "").includes("No Fallback"));
    return {
      mode: game.mode,
      aiBridgeTick: game.aiBridgeTick,
      activePlayerIds: [...(game.activePlayerIds || [])],
      strictButton: strictButton?.textContent ?? null,
      panelMounted: Boolean(document.querySelector("#autobot-dev-panel")),
      players: Object.values(game.players || {}).map((player) => ({
        id: player.id,
        alive: player.alive,
        tile: player.tile ? { ...player.tile } : null,
        direction: player.direction,
      })),
    };
  });

  let liveSnapshot = await snapshot();
  let report = await brokerJson("/report");
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (
      liveSnapshot.aiBridgeTick > 10
      && report?.report?.tick > 10
      && report?.report?.phase === "match"
    ) {
      break;
    }
    await sleep(1000);
    liveSnapshot = await snapshot();
    report = await brokerJson("/report");
  }

  const before = await snapshot();
  await sleep(8000);
  const after = await snapshot();
  const finalReport = await brokerJson("/report");
  const logs = await Promise.all(logPaths.map(readLogTail));
  const logText = logs.filter(Boolean).join("\n");

  const movement = [1].map((playerId) => summariseMovement(before, after, playerId));
  const movedPlayers = movement.filter((item) => item.moved).map((item) => item.playerId);
  const usageLimited = /usage limit|try again at/i.test(logText);
  const liveDecisionSeen = /tick=\s*\d+\s+\|/.test(logText);
  const strictModeOk = before.strictButton === "No Fallback: ON";
  const bridgeOk = before.panelMounted && after.aiBridgeTick > 10 && finalReport?.report?.tick > 10;
  const controlledDecisionOk = Boolean(finalReport?.report?.decisions?.["1"]);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = {
    ok: bridgeOk && strictModeOk && liveDecisionSeen && (movedPlayers.length > 0 || controlledDecisionOk) && !usageLimited,
    bridgeOk,
    strictModeOk,
    liveDecisionSeen,
    controlledDecisionOk,
    usageLimited,
    movedPlayers,
    before,
    after,
    report: finalReport,
    screenshotPath,
    logTail: logText,
  };

  console.log(JSON.stringify(result, null, 2));

  if (usageLimited) {
    process.exitCode = 2;
  } else if (!result.ok) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
