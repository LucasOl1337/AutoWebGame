/**
 * auto-improvement-bridge.ts
 *
 * Telemetry + AI decision bridge between BombaPVP and the auto-improvements
 * Python backend (game_broker.py at localhost:8766).
 *
 * DEV ONLY — Vite's dead-code elimination removes this from production builds
 * when all call sites are guarded with `if (import.meta.env.DEV)`.
 *
 * Usage (in game-app.ts)
 * ----------------------
 *   if (import.meta.env.DEV) {
 *     AutoImprovementBridge.enable();
 *     AutoImprovementBridge.mountDevPanel(document.body);
 *   }
 *   // each game tick:
 *   if (import.meta.env.DEV) AutoImprovementBridge.pushTelemetry(snapshot);
 *   // in getBotDecision:
 *   if (import.meta.env.DEV) {
 *     const d = AutoImprovementBridge.getDecision(player.id);
 *     if (d) return AutoImprovementBridge.toBotDecision(d);
 *   }
 */

import type {
  BombState,
  FlameState,
  MatchScore,
  PlayerState,
} from "../Gameplay/types";
import type { BotDecision } from "./bot-ai";

const BROKER_BASE = "http://127.0.0.1:8766";
const TELEMETRY_THROTTLE_MS = 75;
const DECISION_TTL_MS = 25000; // Codex takes ~20-30s per call; hold decisions until next one arrives
const HEALTH_CHECK_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TelemetrySnapshot {
  tick: number;
  phase: string;
  players: PlayerState[];
  bombs: BombState[];
  flames: FlameState[];
  matchScore?: MatchScore;
  suddenDeath?: { active: boolean; index?: number };
}

export interface BrokerDecision {
  playerId: string;
  botId?: string;
  direction: "up" | "down" | "left" | "right" | null;
  placeBomb: boolean;
  detonate: boolean;
  useSkill: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _enabled = false;
let _brokerOnline = false;
let _aiControlEnabled = true;
let _lastTelemetryAt = 0;
let _lastHealthAt = 0;
let _telemetryCount = 0;

const _decisions = new Map<string, { d: BrokerDecision; at: number }>();

// ── Strict mode & per-player control ──────────────────────────────────────
let _strictMode = true; // strict by default: bots idle when no Codex decision — no built-in AI fallback
const _perPlayerEnabled: Record<string, boolean> = {}; // undefined = on, false = disabled

// ── Decision history for side panels ──────────────────────────────────────
interface DecisionEntry { dir: BrokerDecision["direction"]; bomb: boolean; det: boolean; reason: string; tick: number; }
const _decisionHistory = new Map<string, DecisionEntry[]>(); // newest first
const HISTORY_MAX = 40;

// ── Corner panel DOM refs (created by mountDevPanel) ──────────────────────
let _panelEl: HTMLElement | null = null;
let _statusDot: HTMLElement | null = null;
let _statusText: HTMLElement | null = null;
let _decisionsEl: HTMLElement | null = null;
let _outputEl: HTMLElement | null = null;
let _toggleBtn: HTMLButtonElement | null = null;
let _collapsed = false;

// ── Side panel DOM refs (created by mountSidePanels) ──────────────────────
let _p1LogEl: HTMLElement | null = null;
let _p2LogEl: HTMLElement | null = null;
let _p1StatusEl: HTMLElement | null = null;
let _p2StatusEl: HTMLElement | null = null;
let _sidePanelStatsEl: HTMLElement | null = null;
let _liveRefreshStarted = false;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function _get(path: string): Promise<Response> {
  return fetch(`${BROKER_BASE}${path}`, {
    signal: AbortSignal.timeout(2500),
  });
}

function _post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BROKER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function _checkHealth(): void {
  const now = Date.now();
  if (now - _lastHealthAt < HEALTH_CHECK_INTERVAL_MS) return;
  _lastHealthAt = now;
  _get("/health")
    .then((r) => {
      _brokerOnline = r.ok;
      _updatePanelStatus();
    })
    .catch(() => {
      _brokerOnline = false;
      _updatePanelStatus();
    });
}

// ---------------------------------------------------------------------------
// Decision fetch
// ---------------------------------------------------------------------------

function _fetchDecision(playerId: string): void {
  _get(`/decision/${playerId}`)
    .then((r) => r.json())
    .then((data: { ok: boolean; decision: BrokerDecision | null }) => {
      if (data?.ok && data.decision) {
        _decisions.set(playerId, { d: data.decision, at: Date.now() });
        _updatePanelDecisions();
      }
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// History + side-panel rendering helpers
// ---------------------------------------------------------------------------

function _pushHistory(pid: string, d: BrokerDecision, tick: number): void {
  const hist = _decisionHistory.get(pid) ?? [];
  // skip duplicate ticks
  if (hist.length && hist[0].tick === tick) return;
  hist.unshift({ dir: d.direction, bomb: d.placeBomb, det: d.detonate, reason: d.reason ?? "", tick });
  if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;
  _decisionHistory.set(pid, hist);
}

function _renderPlayerSide(pid: string, statusEl: HTMLElement | null, logEl: HTMLElement | null, tick: number): void {
  const enabled = _perPlayerEnabled[pid] !== false;
  const entry = _decisions.get(pid);
  const fresh = !!entry && Date.now() - entry.at < 25000;

  if (statusEl) {
    statusEl.textContent = fresh
      ? `● P${pid}  ${enabled ? "AI ON" : "AI OFF"}  tick=${tick}`
      : `○ P${pid}  ${enabled ? "AI ON" : "AI OFF"}  —`;
    statusEl.style.color = fresh ? (enabled ? "#00ff99" : "#ff9944") : "#555";
  }

  if (logEl) {
    const hist = _decisionHistory.get(pid) ?? [];
    if (!hist.length) { logEl.textContent = "(waiting for decisions...)"; return; }
    logEl.textContent = hist.map(h => {
      const arrow = _dirArrow(h.dir);
      const b = h.bomb ? "💣" : " ";
      const d2 = h.det ? "💥" : " ";
      return `${String(h.tick).padStart(5)} ${arrow}${b}${d2} ${h.reason.slice(0, 34)}`;
    }).join("\n");
  }
}

// ---------------------------------------------------------------------------
// Shared live-refresh loop (started once, updates corner + side panels)
// ---------------------------------------------------------------------------

function _startLiveRefresh(): void {
  if (_liveRefreshStarted) return;
  _liveRefreshStarted = true;

  setInterval(() => {
    _get("/report")
      .then((r) => r.json())
      .then((data: {
        ok: boolean;
        report?: {
          decisions?: Record<string, { direction?: string | null; placeBomb?: boolean; detonate?: boolean; reason?: string }>;
          phase?: string; tick?: number;
          agentHeartbeats?: Record<string, number>;
          matchCount?: number;
        };
      }) => {
        if (!data.ok || !data.report) return;
        _brokerOnline = true;
        const report = data.report;
        const decisions = report.decisions ?? {};
        const heartbeats = report.agentHeartbeats ?? {};
        const tick = report.tick ?? 0;

        // Inject into decision cache + history
        const now = Date.now();
        for (const [pid, d] of Object.entries(decisions)) {
          const bd: BrokerDecision = {
            playerId: pid,
            direction: (d.direction as BrokerDecision["direction"]) ?? null,
            placeBomb: !!d.placeBomb,
            detonate: !!d.detonate,
            useSkill: false,
            reason: d.reason,
          };
          _decisions.set(pid, { d: bd, at: now });
          _pushHistory(pid, bd, tick);
        }

        // Update corner panel decisions area
        if (_decisionsEl) {
          const lines: string[] = [];
          for (const [pid, d] of Object.entries(decisions)) {
            const arrow = _dirArrow(d.direction ?? null);
            const bomb = d.placeBomb ? "💣" : "  ";
            const det = d.detonate ? "💥" : "  ";
            lines.push(`P${pid}: ${arrow} ${bomb}${det} ${(d.reason ?? "").slice(0, 55)}`);
          }
          for (const [agentId, ts] of Object.entries(heartbeats)) {
            const age = ((now - (ts as number)) / 1000).toFixed(1);
            lines.push(`🤖 ${agentId}: ${parseFloat(age) < 10 ? "✅" : "⚠️"} ${age}s ago`);
          }
          if (report.phase) lines.push(`phase=${report.phase} tick=${tick}`);
          _decisionsEl.textContent = lines.length ? lines.join("\n") : "(no decisions yet)";
        }

        // Update side panels for the actual live Codex-controlled slots.
        _renderPlayerSide("1", _p1StatusEl, _p1LogEl, tick);
        _renderPlayerSide("2", _p2StatusEl, _p2LogEl, tick);

        // Update stats line in right panel
        if (_sidePanelStatsEl) {
          const mc = report.matchCount ?? "—";
          _sidePanelStatsEl.textContent = `matches: ${mc}`;
        }

        _updatePanelStatus();
      })
      .catch(() => {
        _brokerOnline = false;
        _updatePanelStatus();
      });
  }, 2000);
}

// ---------------------------------------------------------------------------
// Panel rendering helpers
// ---------------------------------------------------------------------------

function _updatePanelStatus(): void {
  if (!_statusDot || !_statusText) return;
  if (_brokerOnline) {
    _statusDot.style.color = "#00e5a0";
    _statusDot.textContent = "●";
    _statusText.textContent = `ONLINE  tick=${_telemetryCount}`;
  } else {
    _statusDot.style.color = "#ff4444";
    _statusDot.textContent = "●";
    _statusText.textContent = "OFFLINE — start mainbot.py";
  }
  if (_toggleBtn) {
    _toggleBtn.textContent = _aiControlEnabled ? "AI: ON" : "AI: OFF";
    _toggleBtn.style.background = _aiControlEnabled ? "#00e5a0" : "#555";
    _toggleBtn.style.color = _aiControlEnabled ? "#000" : "#ccc";
  }
}

function _dirArrow(d: string | null): string {
  return ({ up: "↑", down: "↓", left: "←", right: "→" } as Record<string, string>)[d ?? ""] ?? "·";
}

function _updatePanelDecisions(): void {
  if (!_decisionsEl) return;
  const now = Date.now();
  const lines: string[] = [];
  for (const [pid, { d, at }] of _decisions) {
    if (now - at > DECISION_TTL_MS) continue;
    const arrow = _dirArrow(d.direction);
    const bomb = d.placeBomb ? "💣" : "  ";
    const det = d.detonate ? "💥" : "  ";
    const reason = (d.reason ?? "").slice(0, 50);
    lines.push(`P${pid}: ${arrow} ${bomb}${det} ${reason}`);
  }
  _decisionsEl.textContent = lines.length ? lines.join("\n") : "(no decisions yet)";
}

function _showOutput(text: string): void {
  if (!_outputEl) return;
  _outputEl.textContent = text;
  _outputEl.style.display = "block";
}

// ---------------------------------------------------------------------------
// Dev panel mount
// ---------------------------------------------------------------------------

const PANEL_STYLES = `
  position:fixed;bottom:12px;right:12px;z-index:99999;
  background:rgba(10,14,18,0.92);border:1px solid #00e5a0;
  border-radius:8px;font-family:monospace;font-size:12px;
  color:#e0f7f0;min-width:260px;max-width:340px;
  box-shadow:0 4px 20px rgba(0,229,160,0.15);
  backdrop-filter:blur(6px);user-select:none;
`.replace(/\n\s*/g, "");

const BTN_BASE = `
  padding:3px 8px;border-radius:4px;border:none;cursor:pointer;
  font-family:monospace;font-size:11px;font-weight:700;
  transition:opacity 0.15s;
`.replace(/\n\s*/g, "");

function _btn(label: string, bg: string, fg = "#000", onClick?: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = BTN_BASE + `background:${bg};color:${fg};`;
  b.onmouseenter = () => (b.style.opacity = "0.8");
  b.onmouseleave = () => (b.style.opacity = "1");
  if (onClick) b.onclick = onClick;
  return b;
}

export function mountDevPanel(container: HTMLElement): void {
  if (_panelEl) return; // already mounted

  const panel = document.createElement("div");
  panel.id = "autobot-dev-panel";
  panel.style.cssText = PANEL_STYLES;

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:6px;padding:7px 10px;" +
    "border-bottom:1px solid #1a3030;cursor:pointer;";

  const dot = document.createElement("span");
  dot.textContent = "●";
  dot.style.cssText = "font-size:10px;color:#555;transition:color 0.3s;";

  const titleEl = document.createElement("span");
  titleEl.textContent = "🤖 AutoBot";
  titleEl.style.cssText = "font-weight:700;color:#00e5a0;flex:1;font-size:13px;";

  const statusEl = document.createElement("span");
  statusEl.textContent = "checking...";
  statusEl.style.cssText = "font-size:10px;color:#888;";

  const collapseBtn = document.createElement("span");
  collapseBtn.textContent = "▼";
  collapseBtn.style.cssText = "cursor:pointer;color:#888;font-size:10px;";

  header.appendChild(dot);
  header.appendChild(titleEl);
  header.appendChild(statusEl);
  header.appendChild(collapseBtn);

  // ── Body ──
  const body = document.createElement("div");
  body.style.cssText = "padding:8px 10px;display:flex;flex-direction:column;gap:6px;";

  // Toggle + controls row
  const toggleBtn = _btn("AI: ON", "#00e5a0", "#000", () => {
    _aiControlEnabled = !_aiControlEnabled;
    _updatePanelStatus();
  });

  const insightsBtn = _btn("Run Insights", "#1a3a3a", "#00e5a0", () => {
    _showOutput("Running insights...");
    _post("/trigger/insights", {})
      .then((r) => r.json())
      .then((d: { ok: boolean; message?: string }) => _showOutput(d.message ?? "Insights triggered."))
      .catch(() => _showOutput("Broker unavailable."));
  });

  const managerBtn = _btn("Gen Tasks", "#1a3a3a", "#00e5a0", () => {
    _showOutput("Running manager...");
    _post("/trigger/manager", {})
      .then((r) => r.json())
      .then((d: { ok: boolean; message?: string }) => _showOutput(d.message ?? "Manager triggered."))
      .catch(() => _showOutput("Broker unavailable."));
  });

  const tasksBtn = _btn("Show Tasks", "#1a3a3a", "#00e5a0", () => {
    _showOutput("Fetching tasks...");
    _get("/tasks")
      .then((r) => r.json())
      .then((d: { ok: boolean; tasks?: Array<{ id: string; priority: number; category: string; title: string }> }) => {
        const tasks = d.tasks ?? [];
        if (!tasks.length) { _showOutput("No pending tasks."); return; }
        _showOutput(tasks.slice(0, 6).map((t) => `[${t.id}] p=${t.priority} ${t.category}\n  ${t.title}`).join("\n\n"));
      })
      .catch(() => _showOutput("Broker unavailable."));
  });

  const workerBtn = _btn("Worker Dry", "#3a1a1a", "#ff9966", () => {
    _showOutput("Running worker (dry)...");
    _post("/trigger/worker-dry", {})
      .then((r) => r.json())
      .then((d: { ok: boolean; message?: string }) => _showOutput(d.message ?? "Worker triggered."))
      .catch(() => _showOutput("Broker unavailable."));
  });

  const workerRealBtn = _btn("⚡ Apply", "#5a0000", "#ffcccc", () => {
    if (!confirm("Apply tasks for real? This will modify game source files.")) return;
    _showOutput("Running worker (REAL)...");
    _post("/trigger/worker-real", {})
      .then((r) => r.json())
      .then((d: { ok: boolean; message?: string }) => _showOutput(d.message ?? "Worker triggered."))
      .catch(() => _showOutput("Broker unavailable."));
  });

  const insightViewBtn = _btn("Latest Insight", "#1a3a3a", "#00e5a0", () => {
    _showOutput("Loading...");
    _get("/insights/latest")
      .then((r) => r.json())
      .then((d: { ok: boolean; text?: string }) => {
        if (!d.text) { _showOutput("No insights yet."); return; }
        _showInModal(d.text);
      })
      .catch(() => _showOutput("Broker unavailable."));
  });

  // ── Game controls row ──
  const startMatchBtn = _btn("🎮 Endless Match", "#003322", "#00ff99", () => {
    const g = (window as Window & { __autobot?: { startOfflineBotMatch: (n: number, mode: string) => void } }).__autobot;
    if (!g) { _showOutput("Game not ready. Navigate to the game page first."); return; }
    g.startOfflineBotMatch(3, "endless");
    _showOutput("♾️ Endless match started with 3 bots!\nAI agents will control players.\nWatch the decisions panel below for live moves.");
  });

  const reportsBtn = _btn("📊 Reports", "#1a1a3a", "#aaaaff", () => {
    _showOutput("Loading reports...");
    Promise.all([
      _get("/tasks").then((r) => r.json()).catch(() => ({ ok: false, tasks: [] })),
      _get("/insights/latest").then((r) => r.json()).catch(() => ({ ok: false, text: "" })),
      _get("/report").then((r) => r.json()).catch(() => ({ ok: false, report: null })),
    ]).then(([tasksData, insightData, reportData]) => {
      const tasks = (tasksData as { ok: boolean; tasks?: Array<{ id: string; priority: number; category: string; title: string }> }).tasks ?? [];
      const insightText = (insightData as { ok: boolean; text?: string }).text ?? "(no insights yet)";
      const report = (reportData as { ok: boolean; report?: { phase?: string; tick?: number; activePlayers?: number } }).report;
      const lines: string[] = [];
      lines.push("═══ BombaPVP AutoBot Reports ═══\n");
      if (report) {
        lines.push(`Game: phase=${report.phase ?? "-"}  tick=${report.tick ?? "-"}  players=${report.activePlayers ?? "-"}`);
      } else {
        lines.push("Game: broker offline or no match running");
      }
      lines.push(`\nPending tasks: ${tasks.length}`);
      if (tasks.length) {
        lines.push("Top tasks:");
        tasks.slice(0, 5).forEach((t) => lines.push(`  [${t.id}] p=${t.priority} ${t.category} — ${t.title}`));
      }
      lines.push("\n─── Latest Insight ───");
      lines.push(insightText.slice(0, 600) + (insightText.length > 600 ? "\n…(see Full Insight button for more)" : ""));
      _showInModal(lines.join("\n"));
    });
  });

  const gameRow = document.createElement("div");
  gameRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  gameRow.append(startMatchBtn, reportsBtn);

  const btnsRow1 = document.createElement("div");
  btnsRow1.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  btnsRow1.append(toggleBtn, insightsBtn, managerBtn);

  const btnsRow2 = document.createElement("div");
  btnsRow2.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  btnsRow2.append(tasksBtn, insightViewBtn, workerBtn, workerRealBtn);

  // Decisions display
  const decisionsEl = document.createElement("pre");
  decisionsEl.style.cssText =
    "margin:0;padding:5px 6px;background:#0a1a12;border-radius:4px;" +
    "font-size:11px;color:#a0f0c0;min-height:32px;max-height:80px;overflow-y:auto;";
  decisionsEl.textContent = "(no decisions yet)";

  // Output area
  const outputEl = document.createElement("pre");
  outputEl.style.cssText =
    "margin:0;padding:5px 6px;background:#0a0a14;border-radius:4px;" +
    "font-size:10px;color:#8080cc;display:none;max-height:100px;overflow-y:auto;white-space:pre-wrap;";

  body.append(gameRow, btnsRow1, btnsRow2, decisionsEl, outputEl);
  panel.append(header, body);

  // Collapse toggle
  header.onclick = () => {
    _collapsed = !_collapsed;
    body.style.display = _collapsed ? "none" : "flex";
    collapseBtn.textContent = _collapsed ? "▶" : "▼";
  };

  container.appendChild(panel);

  _panelEl = panel;
  _statusDot = dot;
  _statusText = statusEl;
  _decisionsEl = decisionsEl;
  _outputEl = outputEl;
  _toggleBtn = toggleBtn;

  _updatePanelStatus();
  _startLiveRefresh();
}

// ---------------------------------------------------------------------------
// Side panels (left = P2, right = P3 + controls)
// ---------------------------------------------------------------------------

const SIDE_STYLE = (side: "left" | "right") =>
  `position:fixed;${side}:4px;top:55px;width:190px;` +
  `max-height:calc(100vh - 60px);` +
  `background:rgba(4,10,7,0.91);border:1px solid #1a4030;border-radius:6px;` +
  `font-family:monospace;font-size:11px;color:#a0e0c0;` +
  `box-shadow:0 2px 14px rgba(0,229,160,0.09);backdrop-filter:blur(5px);` +
  `display:flex;flex-direction:column;z-index:9998;`;

function _sideHeader(title: string): HTMLElement {
  const h = document.createElement("div");
  h.style.cssText =
    "padding:5px 8px;font-weight:700;color:#00e5a0;font-size:12px;" +
    "border-bottom:1px solid #1a4030;flex-shrink:0;";
  h.textContent = title;
  return h;
}

function _makePerPlayerToggle(pid: string, label: string): HTMLButtonElement {
  const b = _btn(`${label}: ON`, "#00e5a0", "#000");
  b.style.cssText += "width:100%;margin-top:2px;";
  b.onclick = () => {
    const cur = _perPlayerEnabled[pid] !== false;
    _perPlayerEnabled[pid] = !cur;
    b.textContent = `${label}: ${_perPlayerEnabled[pid] !== false ? "ON" : "OFF"}`;
    b.style.background = _perPlayerEnabled[pid] !== false ? "#00e5a0" : "#444";
    b.style.color = _perPlayerEnabled[pid] !== false ? "#000" : "#ccc";
  };
  return b;
}

export function mountSidePanels(container: HTMLElement): void {
  if (_p1LogEl) return; // already mounted

  // ── LEFT PANEL — Bot P2 ───────────────────────────────────────────────
  const left = document.createElement("div");
  left.style.cssText = SIDE_STYLE("left");

  const p1Status = document.createElement("div");
  p1Status.style.cssText = "padding:3px 8px;font-size:10px;color:#555;flex-shrink:0;";
  p1Status.textContent = "○ P2  waiting...";

  const p1Toggle = _makePerPlayerToggle("1", "P1 Codex");
  const p1BtnRow = document.createElement("div");
  p1BtnRow.style.cssText = "padding:3px 8px 4px;flex-shrink:0;";
  p1BtnRow.appendChild(p1Toggle);

  const p1Log = document.createElement("pre");
  p1Log.style.cssText =
    "margin:0;padding:5px 8px;font-size:10px;color:#7ecc96;overflow-y:auto;" +
    "flex:1;white-space:pre;line-height:1.4;";
  p1Log.textContent = "(waiting for decisions...)";

  left.append(_sideHeader("🤖 Bot P2"), p1Status, p1BtnRow, p1Log);

  // ── RIGHT PANEL — Bot P3 + controls ───────────────────────────────────
  const right = document.createElement("div");
  right.style.cssText = SIDE_STYLE("right");

  const p2Status = document.createElement("div");
  p2Status.style.cssText = "padding:3px 8px;font-size:10px;color:#555;flex-shrink:0;";
  p2Status.textContent = "○ P3  waiting...";

  const p2Toggle = _makePerPlayerToggle("2", "P2 Monitor");
  const p2BtnRow = document.createElement("div");
  p2BtnRow.style.cssText = "padding:3px 8px 4px;flex-shrink:0;";
  p2BtnRow.appendChild(p2Toggle);

  const p2Log = document.createElement("pre");
  p2Log.style.cssText =
    "margin:0;padding:5px 8px;font-size:10px;color:#7ecc96;overflow-y:auto;" +
    "flex:1;white-space:pre;line-height:1.4;";
  p2Log.textContent = "(waiting for decisions...)";

  // Controls section
  const controls = document.createElement("div");
  controls.style.cssText =
    "padding:6px 8px;border-top:1px solid #1a4030;display:flex;flex-direction:column;gap:3px;flex-shrink:0;";

  const strictBtn = _btn(
    _strictMode ? "No Fallback: ON" : "No Fallback: OFF",
    _strictMode ? "#3a1a00" : "#1a1a00",
    "#ffaa44",
  );
  strictBtn.style.cssText += "width:100%;text-align:left;";
  strictBtn.onclick = () => {
    _strictMode = !_strictMode;
    strictBtn.textContent = _strictMode ? "No Fallback: ON" : "No Fallback: OFF";
    strictBtn.style.background = _strictMode ? "#3a1a00" : "#1a1a00";
  };

  const reportsBtn = _btn("📊 Reports & Tasks", "#0a1020", "#88aaff");
  reportsBtn.style.cssText += "width:100%;text-align:left;";
  reportsBtn.onclick = () => {
    Promise.all([
      _get("/tasks").then((r) => r.json()).catch(() => ({ ok: false, tasks: [] })),
      _get("/insights/latest").then((r) => r.json()).catch(() => ({ ok: false, text: "" })),
      _get("/report").then((r) => r.json()).catch(() => ({ ok: false, report: null })),
    ]).then(([td, id_, rd]) => {
      const tasks = (td as { ok: boolean; tasks?: Array<{ id: string; priority: number; category: string; title: string }> }).tasks ?? [];
      const insightText = (id_ as { ok: boolean; text?: string }).text ?? "(no insights yet)";
      const report = (rd as { ok: boolean; report?: { phase?: string; tick?: number; activePlayers?: number; matchCount?: number } }).report;
      const lines: string[] = ["═══ BombaPVP AutoBot Reports ═══\n"];
      if (report) lines.push(`phase=${report.phase ?? "-"}  tick=${report.tick ?? "-"}  players=${report.activePlayers ?? "-"}  matches=${report.matchCount ?? "-"}`);
      else lines.push("broker offline");
      lines.push(`\nPending tasks: ${tasks.length}`);
      tasks.slice(0, 8).forEach((t) => lines.push(`  [${t.id}] p=${t.priority} ${t.category}\n  ${t.title}`));
      lines.push("\n─── Latest Insight ───\n");
      lines.push(insightText.slice(0, 800) + (insightText.length > 800 ? "\n…" : ""));
      _showInModal(lines.join("\n"));
    });
  };

  const statsEl = document.createElement("div");
  statsEl.style.cssText = "font-size:10px;color:#444;padding-top:2px;";
  statsEl.textContent = "matches: —";

  controls.append(strictBtn, reportsBtn, statsEl);
  right.append(_sideHeader("🤖 Bot P3"), p2Status, p2BtnRow, p2Log, controls);

  container.appendChild(left);
  container.appendChild(right);

  _p1StatusEl = p1Status;
  _p1LogEl = p1Log;
  _p2StatusEl = p2Status;
  _p2LogEl = p2Log;
  _sidePanelStatsEl = statsEl;

  _startLiveRefresh();
}

// ---------------------------------------------------------------------------
// Modal for long text (insight reports)
// ---------------------------------------------------------------------------

function _showInModal(text: string): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100000;" +
    "display:flex;align-items:center;justify-content:center;padding:20px;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:#0d1a12;border:1px solid #00e5a0;border-radius:10px;" +
    "padding:16px;max-width:700px;max-height:80vh;overflow-y:auto;" +
    "font-family:monospace;font-size:12px;color:#c0f0d0;white-space:pre-wrap;";
  box.textContent = text;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Close";
  closeBtn.style.cssText =
    BTN_BASE + "background:#00e5a0;color:#000;margin-bottom:8px;font-size:12px;";
  closeBtn.onclick = () => overlay.remove();

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const inner = document.createElement("div");
  inner.style.cssText = "display:flex;flex-direction:column;gap:6px;max-width:700px;width:100%;";
  inner.append(closeBtn, box);
  overlay.append(inner);
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AutoImprovementBridge = {
  enable(): void {
    _enabled = true;
    _checkHealth();
  },

  disable(): void {
    _enabled = false;
  },

  get isEnabled(): boolean {
    return _enabled;
  },

  get isBrokerOnline(): boolean {
    return _brokerOnline;
  },

  /** Mount the interactive dev panel onto a container element. */
  mountDevPanel,

  /**
   * Push a telemetry snapshot. Throttled to TELEMETRY_THROTTLE_MS.
   * Also triggers async decision fetches for active players.
   */
  pushTelemetry(snapshot: TelemetrySnapshot): void {
    if (!_enabled) return;
    _checkHealth();
    const now = Date.now();
    if (now - _lastTelemetryAt < TELEMETRY_THROTTLE_MS) return;
    _lastTelemetryAt = now;
    _telemetryCount++;

    _post("/telemetry", snapshot).catch(() => {});

    for (const p of snapshot.players) {
      if (p.active && p.alive) _fetchDecision(String(p.id));
    }

    _updatePanelDecisions();
    if (_telemetryCount % 20 === 0) _updatePanelStatus();
  },

  /**
   * Get the latest cached AI decision for a player.
   * Returns null if AI control is disabled, per-player disabled, or no fresh decision.
   */
  getDecision(playerId: number | string): BrokerDecision | null {
    const pid = String(playerId);
    if (!_enabled || !_aiControlEnabled) return null;
    if (_perPlayerEnabled[pid] === false) return null;
    const entry = _decisions.get(pid);
    if (!entry) return null;
    if (Date.now() - entry.at > DECISION_TTL_MS) {
      _decisions.delete(pid);
      return null;
    }
    return entry.d;
  },

  /** When true, bots stand completely still if no Codex decision arrives (no built-in AI fallback). */
  get isStrictMode(): boolean { return _strictMode; },

  /** Returns false if this player's AI has been explicitly turned off via the side panel. */
  isPlayerEnabled(playerId: number | string): boolean {
    return _perPlayerEnabled[String(playerId)] !== false;
  },

  /** Mount the side panels (left = P2 log, right = P3 log + controls). */
  mountSidePanels,

  /** Convert a BrokerDecision to the BotDecision format used by bot-ai.ts. */
  toBotDecision(d: BrokerDecision): BotDecision {
    return {
      direction: d.direction ?? null,
      placeBomb: d.placeBomb,
      detonate: d.detonate,
    };
  },
};

export default AutoImprovementBridge;
