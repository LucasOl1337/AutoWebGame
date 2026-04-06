/**
 * auto-improvement-bridge.ts
 *
 * Telemetry + AI decision bridge between BombaPVP and the auto-improvements
 * Python backend (game_broker.py at localhost:8765).
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
const TELEMETRY_THROTTLE_MS = 200;
const DECISION_TTL_MS = 1200;
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

// Panel DOM refs (created by mountDevPanel)
let _panelEl: HTMLElement | null = null;
let _statusDot: HTMLElement | null = null;
let _statusText: HTMLElement | null = null;
let _decisionsEl: HTMLElement | null = null;
let _outputEl: HTMLElement | null = null;
let _toggleBtn: HTMLButtonElement | null = null;
let _collapsed = false;

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

  body.append(btnsRow1, btnsRow2, decisionsEl, outputEl);
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
   * Returns null if AI control is disabled or no fresh decision exists.
   */
  getDecision(playerId: number | string): BrokerDecision | null {
    if (!_enabled || !_aiControlEnabled) return null;
    const entry = _decisions.get(String(playerId));
    if (!entry) return null;
    if (Date.now() - entry.at > DECISION_TTL_MS) {
      _decisions.delete(String(playerId));
      return null;
    }
    return entry.d;
  },

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
