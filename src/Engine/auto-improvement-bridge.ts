/**
 * auto-improvement-bridge.ts
 *
 * Telemetry + AI decision bridge between BombaPVP and the auto-improvements
 * Python backend, reached through the same-origin Cloudflare Worker proxy.
 *
 * Production activation is restricted by GameApp/main.ts to a validated Lab
 * session URL. Ordinary matches never enable this bridge.
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
  PowerUpState,
} from "../Gameplay/types";
import type {
  BrowserSeriesEvent,
  BrowserSeriesRequest,
} from "../BotLab/headless-series-worker-controller";
import type { BotDecision } from "./bot-ai";

const LAB_API_BASE = "/api/lab";
const TELEMETRY_THROTTLE_MS = 100;
const DECISION_TTL_MS = 1200;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const DECISION_POLL_INTERVAL_MS = 100;
const MICRO_ACTION_MIN_MS = 400;
const MICRO_ACTION_MAX_MS = 500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TelemetrySnapshot {
  tick: number;
  phase: string;
  roundNumber?: number;
  players: PlayerState[];
  bombs: BombState[];
  flames: FlameState[];
  powerUps: PowerUpState[];
  matchScore?: MatchScore;
  suddenDeath?: { active: boolean; index?: number };
  navigation?: Record<string, LabNavigationSnapshot>;
  actionAcks?: LabActionAck[];
}

export interface LabActionAck {
  requestId: number;
  microActionIndex: number;
  playerId: string;
  direction: "up" | "down" | "left" | "right" | null;
  tileBefore: { x: number; y: number };
  tileAfter: { x: number; y: number };
  movementDelta: { x: number; y: number };
  positionChanged: boolean;
  tileChanged: boolean;
  bombAttempted: boolean;
  bombPlaced: boolean;
  detonateAttempted: boolean;
  detonated: boolean;
  skillAction: "start" | "hold" | "release" | "none";
  skillPressed: boolean;
  skillHeld: boolean;
  skillPhaseBefore: string;
  skillPhaseAfter: string;
  alive: boolean;
  updatedAtTick: number;
}

export interface LabNavigationSnapshot {
  tile: { x: number; y: number };
  walkableDirections: Array<"up" | "down" | "left" | "right">;
  blockedDirections: Array<"up" | "down" | "left" | "right">;
  stalledForMs: number;
  lastMovementDelta: { x: number; y: number };
  localTiles: Array<{
    x: number;
    y: number;
    kind: "self" | "enemy" | "open" | "solid" | "breakable" | "bomb" | "flame" | "powerup";
    dangerEtaMs: number | null;
  }>;
}

export interface BrokerDecision {
  playerId: string;
  botId?: string;
  direction: "up" | "down" | "left" | "right" | null;
  placeBomb: boolean;
  detonate: boolean;
  useSkill?: boolean;
  skillAction?: "start" | "hold" | "release" | "none";
  reason?: string;
  receivedAt?: number;
  source?: "model";
  stateTick?: number;
  requestId?: number;
  latencyMs?: number;
  microActionIndex?: number;
  expiresInMs?: number;
  microActions?: BrokerMicroAction[];
}

export interface BrokerMicroAction {
  direction: "up" | "down" | "left" | "right" | null;
  durationMs: number;
  placeBomb: boolean;
  detonate: boolean;
  skillAction: "start" | "hold" | "release" | "none";
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
const _decisionRequests = new Map<string, { pending: boolean; at: number }>();
const _controlledPlayerIds = new Set<string>();
const _consumedDecisionActions = new Map<string, string>();
const _minimumDecisionStateTick = new Map<string, number>();

function _isDecisionFromCurrentRound(playerId: string, decision: BrokerDecision): boolean {
  const minimumTick = _minimumDecisionStateTick.get(playerId) ?? 0;
  const stateTick = Number(decision.stateTick ?? -1);
  return minimumTick <= 0 || (Number.isFinite(stateTick) && stateTick >= minimumTick);
}

function _microActionDurationMs(action: BrokerMicroAction): number {
  return Math.max(
    MICRO_ACTION_MIN_MS,
    Math.min(MICRO_ACTION_MAX_MS, Number(action.durationMs) || MICRO_ACTION_MIN_MS),
  );
}

function _decisionTtlMs(decision: BrokerDecision): number {
  if (decision.microActions?.length) {
    const planMs = decision.microActions.reduce(
      (total, action) => total + _microActionDurationMs(action),
      0,
    );
    // A model-authored plan owns exactly its declared control horizon. Extending
    // the final action here made bots keep moving after the plan had ended.
    return Math.min(18000, planMs);
  }
  const requested = Number(decision.expiresInMs ?? DECISION_TTL_MS);
  return Math.max(200, Math.min(1500, Number.isFinite(requested) ? requested : DECISION_TTL_MS));
}

export interface DecisionFreshness {
  ageMs: number;
  ttlMs: number;
  remainingMs: number;
  fresh: boolean;
}

export function getDecisionFreshness(
  decision: BrokerDecision,
  receivedAt: number,
  now = Date.now(),
): DecisionFreshness {
  const ageMs = Math.max(0, now - receivedAt);
  const ttlMs = _decisionTtlMs(decision);
  return {
    ageMs,
    ttlMs,
    remainingMs: Math.max(0, ttlMs - ageMs),
    fresh: receivedAt > 0 && ageMs < ttlMs,
  };
}

function _decisionActionKey(decision: BrokerDecision): string {
  return `${decision.requestId ?? "unversioned"}:${decision.microActionIndex ?? 0}:${decision.receivedAt ?? "unreceived"}`;
}

export function resolveMicroAction(decision: BrokerDecision, receivedAt: number, now = Date.now()): BrokerDecision {
  const actions = decision.microActions;
  if (!actions?.length) return decision;
  const elapsedMs = Math.max(0, now - receivedAt);
  let horizonMs = 0;
  let selectedIndex = actions.length - 1;
  for (let index = 0; index < actions.length; index += 1) {
    horizonMs += _microActionDurationMs(actions[index]);
    if (elapsedMs < horizonMs) {
      selectedIndex = index;
      break;
    }
  }
  const selected = actions[selectedIndex];
  return {
    ...decision,
    ...selected,
    microActionIndex: selectedIndex,
    expiresInMs: _decisionTtlMs(decision),
  };
}

export function resolveFreshDecision(
  decision: BrokerDecision,
  receivedAt: number,
  now = Date.now(),
): BrokerDecision | null {
  return getDecisionFreshness(decision, receivedAt, now).fresh
    ? resolveMicroAction(decision, receivedAt, now)
    : null;
}

// ── Strict mode & per-player control ──────────────────────────────────────
let _strictMode = true; // strict by default: bots idle when no Codex decision — no built-in AI fallback
const _perPlayerEnabled: Record<string, boolean> = {}; // undefined = on, false = disabled

// ── Decision history for side panels ──────────────────────────────────────
interface DecisionEntry {
  dir: BrokerDecision["direction"];
  bomb: boolean;
  det: boolean;
  reason: string;
  tick: number;
  receivedAt: number;
  requestId?: number;
  stateTick?: number;
  latencyMs?: number;
  microActionIndex?: number;
}
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
let _latestNavigation: Record<string, LabNavigationSnapshot> = {};
let _latestPhase = "-";
let _latestTick = 0;
let _labCapability = "";
const _sessionModels = new Map<string, string>();

interface LivePlayerPanelElements {
  model: HTMLElement;
  status: HTMLElement;
  signal: HTMLElement;
  heartbeat: HTMLElement;
  decisionAge: HTMLElement;
  movement: HTMLElement;
  bomb: HTMLElement;
  reason: HTMLElement;
  coords: HTMLElement;
  delta: HTMLElement;
  log: HTMLElement;
}

const _livePlayerPanels = new Map<string, LivePlayerPanelElements>();
let _liveHudSessionEl: HTMLElement | null = null;
let _liveHudPhaseEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function _get(path: string): Promise<Response> {
  return fetch(`${LAB_API_BASE}${path}`, {
    headers: _labCapability ? { "x-bomba-lab-session": _labCapability } : undefined,
    signal: AbortSignal.timeout(2500),
  });
}

function _post(path: string, body: unknown): Promise<Response> {
  return fetch(`${LAB_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(_labCapability ? { "x-bomba-lab-session": _labCapability } : {}),
    },
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
  _get("/status")
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
  const now = Date.now();
  const requestState = _decisionRequests.get(playerId);
  if (requestState?.pending || (requestState && now - requestState.at < DECISION_POLL_INTERVAL_MS)) return;
  _decisionRequests.set(playerId, { pending: true, at: now });
  _get(`/decision/${playerId}`)
    .then((r) => r.json())
    .then((data: { ok: boolean; decision: BrokerDecision | null }) => {
      if (data?.ok && data.decision) {
        if (!_isDecisionFromCurrentRound(playerId, data.decision)) return;
        const receivedAt = Number(data.decision.receivedAt || Date.now());
        const decision = { ...data.decision, receivedAt };
        _decisions.set(playerId, { d: decision, at: receivedAt });
        _updatePanelDecisions();
      }
    })
    .catch(() => {})
    .finally(() => {
      _decisionRequests.set(playerId, { pending: false, at: Date.now() });
    });
}

// ---------------------------------------------------------------------------
// History + side-panel rendering helpers
// ---------------------------------------------------------------------------

function _pushHistory(pid: string, d: BrokerDecision, tick: number): void {
  const hist = _decisionHistory.get(pid) ?? [];
  const receivedAt = Number(d.receivedAt || Date.now());
  if (
    hist.length
    && hist[0].receivedAt === receivedAt
    && hist[0].microActionIndex === d.microActionIndex
  ) return;
  hist.unshift({
    dir: d.direction,
    bomb: d.placeBomb,
    det: d.detonate,
    reason: d.reason ?? "",
    tick,
    receivedAt,
    requestId: d.requestId,
    stateTick: d.stateTick,
    latencyMs: d.latencyMs,
    microActionIndex: d.microActionIndex,
  });
  if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;
  _decisionHistory.set(pid, hist);
}

function _renderPlayerSide(pid: string, statusEl: HTMLElement | null, logEl: HTMLElement | null, tick: number): void {
  const enabled = _perPlayerEnabled[pid] !== false;
  const entry = _decisions.get(pid);
  const fresh = !!entry && Date.now() - entry.at < _decisionTtlMs(entry.d);

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

function _friendlyModelName(model: string): string {
  return ({
    "cx/gpt-5.6-sol": "GPT-5.6 SOL",
    "cx/gpt-5.6-terra": "GPT-5.6 Terra",
    "cx/gpt-5.6-luna": "GPT-5.6 Luna",
    "cc/claude-opus-4-8": "Claude Opus 4.8",
    "cc/claude-sonnet-5": "Claude Sonnet 5",
  } as Record<string, string>)[model] ?? model;
}

function _loadSessionMetadata(): void {
  _get("/session")
    .then((response) => response.json())
    .then((data: {
      ok?: boolean;
      session?: { sessionId?: string; agents?: Array<{ slot?: string; model?: string }> } | null;
    }) => {
      if (!data.ok || !data.session) return;
      _sessionModels.clear();
      for (const agent of data.session.agents ?? []) {
        if (agent.slot && agent.model) _sessionModels.set(String(agent.slot), agent.model);
      }
      for (const [pid, panel] of _livePlayerPanels) {
        panel.model.textContent = _friendlyModelName(_sessionModels.get(pid) ?? "Modelo aguardando");
      }
      if (_liveHudSessionEl) {
        _liveHudSessionEl.textContent = `Sessão ${data.session.sessionId ?? "ativa"}`;
      }
    })
    .catch(() => {});
}

function _movementLabel(direction: BrokerDecision["direction"]): string {
  return ({ up: "CIMA", down: "BAIXO", left: "ESQUERDA", right: "DIREITA" } as Record<string, string>)[direction ?? ""] ?? "PARADO";
}

export interface LiveDecisionPresentationInput {
  decision?: BrokerDecision;
  decisionAt: number;
  now: number;
  heartbeatHealthy: boolean;
  agentError?: string;
  stalledForMs?: number;
  strictMode: boolean;
  modelControlEnabled: boolean;
  playerControlEnabled: boolean;
}

export interface LiveDecisionPresentation {
  status: string;
  tone: "danger" | "live" | "idle";
  movement: string;
  bomb: string;
  reason: string;
  freshness: DecisionFreshness | null;
  planFresh: boolean;
  planExpired: boolean;
  fallbackActive: boolean;
  controlDisabled: boolean;
}

export function getLiveDecisionPresentation({
  decision,
  decisionAt,
  now,
  heartbeatHealthy,
  agentError = "",
  stalledForMs = 0,
  strictMode,
  modelControlEnabled,
  playerControlEnabled,
}: LiveDecisionPresentationInput): LiveDecisionPresentation {
  const freshness = decision && decisionAt ? getDecisionFreshness(decision, decisionAt, now) : null;
  const modelPlanFresh = Boolean(freshness?.fresh);
  const planFresh = modelControlEnabled && playerControlEnabled && modelPlanFresh;
  const planExpired = Boolean(freshness && !freshness.fresh);
  const stalled = Boolean(planFresh && stalledForMs >= 1200 && decision?.direction);
  const fallbackActive = playerControlEnabled && !strictMode && (!modelControlEnabled || !modelPlanFresh);
  const controlDisabled = !playerControlEnabled || (!modelControlEnabled && strictMode);
  const expiredForSeconds = freshness ? ((freshness.ageMs - freshness.ttlMs) / 1000).toFixed(1) : "0.0";
  const fallbackReason = !modelControlEnabled
    ? "Controle por modelo desativado globalmente. Controle atual: IA determinística local."
    : planExpired
      ? `O plano do modelo terminou há ${expiredForSeconds}s. Controle atual: IA determinística local, até chegar uma decisão nova.`
      : "Ainda não há plano válido do modelo. Controle atual: IA determinística local, até chegar uma decisão nova.";
  const fallbackReasonWithError = agentError
    ? `Falha do modelo: ${agentError.slice(0, 100)}. ${fallbackReason}`
    : fallbackReason;
  const strictReason = planExpired
    ? `O plano do modelo terminou há ${expiredForSeconds}s. O bot está parado aguardando uma decisão nova.`
    : decision?.reason || "Aguardando a primeira decisão do modelo.";
  const disabledReason = !playerControlEnabled
    ? "Controle deste bot desativado pelo operador. O bot está parado."
    : "Controle por modelo desativado globalmente. O bot está parado porque o fallback também está bloqueado.";

  return {
    status: controlDisabled
      ? "CONTROLE DESATIVADO"
      : fallbackActive
        ? "FALLBACK DETERMINÍSTICO"
        : agentError
          ? "ERRO DO MODELO"
          : !heartbeatHealthy
            ? "SEM HEARTBEAT"
            : planExpired
              ? "PLANO EXPIRADO"
              : !decision
                ? "AGUARDANDO PLANO"
                : stalled
                  ? "MOVIMENTO BLOQUEADO"
                  : "AO VIVO",
    tone: controlDisabled || agentError || stalled || planExpired || fallbackActive ? "danger" : planFresh ? "live" : "idle",
    movement: planFresh
      ? `${_dirArrow(decision?.direction ?? null)} ${_movementLabel(decision?.direction ?? null)}`
      : fallbackActive
        ? "· POLÍTICA LOCAL"
        : "· SEM COMANDO",
    bomb: planFresh && decision?.placeBomb
      ? "COLOCAR BOMBA"
      : planFresh && decision?.detonate
        ? "DETONAR"
        : fallbackActive
          ? "DECISÃO LOCAL"
          : "NENHUMA",
    reason: controlDisabled
      ? disabledReason
      : fallbackActive
        ? fallbackReasonWithError
        : agentError
          ? agentError.slice(0, 160)
          : strictReason,
    freshness,
    planFresh,
    planExpired,
    fallbackActive,
    controlDisabled,
  };
}

function _renderLivePlayerPanel(
  pid: string,
  decision: BrokerDecision | undefined,
  heartbeatAt: number | undefined,
  agentStatus: { status?: string; error?: string } | undefined,
): void {
  const panel = _livePlayerPanels.get(pid);
  if (!panel) return;
  const now = Date.now();
  const nav = _latestNavigation[pid];
  const heartbeatAgeMs = heartbeatAt ? Math.max(0, now - heartbeatAt) : Number.POSITIVE_INFINITY;
  const decisionAt = decision?.receivedAt ?? _decisions.get(pid)?.at ?? 0;
  const decisionAgeMs = decisionAt ? Math.max(0, now - decisionAt) : Number.POSITIVE_INFINITY;
  const heartbeatHealthy = heartbeatAgeMs < 10_000;
  const presentation = getLiveDecisionPresentation({
    decision,
    decisionAt,
    now,
    heartbeatHealthy,
    agentError: agentStatus?.status === "error" ? (agentStatus.error || "Falha não identificada") : "",
    stalledForMs: nav?.stalledForMs,
    strictMode: _strictMode,
    modelControlEnabled: _aiControlEnabled,
    playerControlEnabled: _perPlayerEnabled[pid] !== false,
  });
  const configuredModel = _friendlyModelName(_sessionModels.get(pid) ?? "Modelo aguardando");
  panel.model.textContent = presentation.controlDisabled
    ? "Sem controlador · controle desativado"
    : presentation.fallbackActive
      ? "IA determinística · fallback"
      : presentation.planFresh
        ? configuredModel
        : `Sem controlador · ${configuredModel} pendente`;
  panel.status.textContent = presentation.status;
  panel.status.dataset.tone = presentation.tone;
  const signalState = !Number.isFinite(heartbeatAgeMs)
    ? "lost"
    : heartbeatAgeMs < 2_500
      ? "live"
      : heartbeatAgeMs < 10_000
        ? "aging"
        : "lost";
  const signalLabel = signalState === "live"
    ? "forte"
    : signalState === "aging"
      ? "envelhecendo"
      : "indisponível";
  panel.signal.dataset.state = signalState;
  panel.signal.setAttribute("aria-label", `Sinal do heartbeat: ${signalLabel}`);
  panel.heartbeat.textContent = Number.isFinite(heartbeatAgeMs) ? `${(heartbeatAgeMs / 1000).toFixed(1)}s` : "—";
  panel.decisionAge.textContent = Number.isFinite(decisionAgeMs)
    ? `${decision?.requestId ? `#${decision.requestId} · ` : ""}${decision?.microActionIndex != null ? `ação ${decision.microActionIndex + 1}/${decision.microActions?.length ?? 1} · ` : ""}${decision?.stateTick != null ? `tick ${decision.stateTick} · ` : ""}${decision?.latencyMs != null ? `${decision.latencyMs}ms · ` : ""}${(decisionAgeMs / 1000).toFixed(1)}s atrás${presentation.planExpired && presentation.freshness ? ` · expirado há ${((presentation.freshness.ageMs - presentation.freshness.ttlMs) / 1000).toFixed(1)}s` : ""}`
    : "aguardando";
  panel.movement.textContent = presentation.movement;
  panel.bomb.textContent = presentation.bomb;
  panel.reason.textContent = presentation.reason;
  panel.coords.textContent = nav ? `(${nav.tile.x}, ${nav.tile.y})` : "—";
  panel.delta.textContent = nav
    ? `(${nav.lastMovementDelta.x.toFixed(1)}, ${nav.lastMovementDelta.y.toFixed(1)}) · parado ${Math.round(nav.stalledForMs)}ms`
    : "—";

  const history = _decisionHistory.get(pid) ?? [];
  panel.log.replaceChildren(...history.slice(0, 6).map((entry) => {
    const row = document.createElement("li");
    const age = Math.max(0, now - entry.receivedAt);
    const time = document.createElement("time");
    const movement = document.createElement("strong");
    const reason = document.createElement("span");
    time.textContent = `${entry.requestId ? `#${entry.requestId}${entry.microActionIndex != null ? `.${entry.microActionIndex + 1}` : ""} ` : ""}${entry.latencyMs != null ? `${entry.latencyMs}ms ` : ""}${(age / 1000).toFixed(1)}s`;
    movement.textContent = `${_dirArrow(entry.dir)} ${_movementLabel(entry.dir)}`;
    reason.textContent = entry.reason || "Sem justificativa";
    row.append(time, movement, reason);
    return row;
  }));
  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "lab-live-feed__empty";
    empty.textContent = "Aguardando decisões reais do 9Router…";
    panel.log.appendChild(empty);
  }
}

function _startLiveRefresh(): void {
  if (_liveRefreshStarted) return;
  _liveRefreshStarted = true;
  _loadSessionMetadata();

  const refresh = () => {
    _get("/report")
      .then((r) => r.json())
      .then((data: {
        ok: boolean;
        report?: {
          decisions?: Record<string, BrokerDecision>;
          phase?: string;
          tick?: number;
          agentHeartbeats?: Record<string, number>;
          agentStatuses?: Record<string, { status?: string; error?: string }>;
          matchCount?: number;
        };
      }) => {
        if (!data.ok || !data.report) return;
        _brokerOnline = true;
        const report = data.report;
        const decisions = report.decisions ?? {};
        const heartbeats = report.agentHeartbeats ?? {};
        const statuses = report.agentStatuses ?? {};
        const tick = report.tick ?? 0;
        _latestTick = tick;
        _latestPhase = report.phase ?? "-";

        for (const [pid, d] of Object.entries(decisions)) {
          if (!_isDecisionFromCurrentRound(pid, d)) {
            delete decisions[pid];
            continue;
          }
          const receivedAt = Number(d.receivedAt || Date.now());
          const bd: BrokerDecision = {
            playerId: pid,
            botId: d.botId,
            direction: d.direction ?? null,
            placeBomb: !!d.placeBomb,
            detonate: !!d.detonate,
            useSkill: !!d.useSkill,
            skillAction: d.skillAction,
            reason: d.reason,
            receivedAt,
            source: d.source,
            stateTick: d.stateTick,
            requestId: d.requestId,
            latencyMs: d.latencyMs,
            expiresInMs: d.expiresInMs,
            microActions: d.microActions,
          };
          _decisions.set(pid, { d: bd, at: receivedAt });
          const activeDecision = resolveMicroAction(bd, receivedAt);
          decisions[pid] = activeDecision;
          _pushHistory(pid, activeDecision, tick);
        }

        if (_decisionsEl) {
          _decisionsEl.textContent = Object.entries(decisions).map(([pid, decision]) => (
            `P${pid}: ${_dirArrow(decision.direction)} ${(decision.reason ?? "").slice(0, 55)}`
          )).join("\n") || "(no decisions yet)";
        }

        for (const pid of _controlledPlayerIds.size ? _controlledPlayerIds : new Set(["1", "2"])) {
          _renderLivePlayerPanel(pid, decisions[pid], heartbeats[`live-${pid}`], statuses[`live-${pid}`]);
        }
        _renderPlayerSide("1", _p1StatusEl, _p1LogEl, tick);
        _renderPlayerSide("2", _p2StatusEl, _p2LogEl, tick);
        if (_sidePanelStatsEl) _sidePanelStatsEl.textContent = `matches: ${report.matchCount ?? "—"}`;
        if (_liveHudSessionEl) _liveHudSessionEl.dataset.online = "true";
        if (_liveHudPhaseEl) _liveHudPhaseEl.textContent = `${_latestPhase} · tick ${_latestTick}`;
        _updatePanelStatus();
      })
      .catch(() => {
        _brokerOnline = false;
        if (_liveHudSessionEl) _liveHudSessionEl.dataset.online = "false";
        _updatePanelStatus();
      });
  };

  refresh();
  setInterval(refresh, 250);
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
    if (!getDecisionFreshness(d, at, now).fresh) continue;
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
    void import("../BotLab/headless-automation-consumer")
      .then(({ headlessAutomationConsumer }) => {
        headlessAutomationConsumer.startLegacyLocalEndless(g, 3);
        _showOutput("♾️ Endless match started with 3 bots!\nAI agents will control players.\nWatch the decisions panel below for live moves.");
      })
      .catch(() => _showOutput("Could not load the local compatibility adapter."));
  });

  let headlessSeriesWorker: Worker | null = null;
  const releaseHeadlessSeriesWorker = (): void => {
    headlessSeriesWorker?.terminate();
    headlessSeriesWorker = null;
  };
  const headlessSeriesBtn = _btn("🧪 Headless Series", "#122640", "#7dd3fc", () => {
    if (headlessSeriesWorker) {
      const cancelRequest: BrowserSeriesRequest = { type: "command", command: "cancel" };
      headlessSeriesWorker.postMessage(cancelRequest);
      _showOutput("Cancelling the headless series at the next round boundary…");
      return;
    }

    _showOutput("Starting a two-round canonical headless series…");
    const worker = new Worker(
      new URL("../BotLab/headless-series-browser-worker.ts", import.meta.url),
      { type: "module", name: "bomba-headless-series" },
    );
    headlessSeriesWorker = worker;
    worker.onmessage = (event: MessageEvent<BrowserSeriesEvent>) => {
      if (event.data.type === "snapshot") {
        const snapshot = event.data.snapshot;
        _showOutput(
          `Headless series: ${snapshot.phase}\nRounds: ${snapshot.completedRounds}/${snapshot.totalRounds}\nTicks: ${snapshot.totalSteps}`,
        );
        return;
      }
      if (event.data.type === "result") {
        const receipt = event.data.receipt;
        const winner = receipt.rounds.at(-1)?.receipt.winner ?? "none";
        _showOutput(
          `Headless series: ${receipt.status}\nRounds: ${receipt.completedRounds}\nLast winner: ${winner}\nTicks: ${receipt.totalSteps}`,
        );
      } else {
        _showOutput(`Headless series failed closed: ${event.data.error ?? "invalid worker response"}`);
      }
      releaseHeadlessSeriesWorker();
    };
    worker.onerror = () => {
      _showOutput("Headless series worker failed before producing evidence.");
      releaseHeadlessSeriesWorker();
    };
    const startRequest: BrowserSeriesRequest = {
      type: "start",
      plan: {
        id: `dev-series-${Date.now()}`,
        roundCount: 2,
        botFill: 1,
      },
    };
    worker.postMessage(startRequest);
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
  gameRow.append(startMatchBtn, headlessSeriesBtn, reportsBtn);

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

function mountLiveLabHud(container: HTMLElement): void {
  if (container.querySelector("#lab-live-hud")) return;

  const hud = document.createElement("aside");
  hud.id = "lab-live-hud";
  hud.className = "lab-live-hud";
  hud.setAttribute("aria-label", "Monitor ao vivo do duelo de IAs");
  hud.innerHTML = `
    <header class="lab-live-hud__session">
      <strong>Duelo de IAs</strong>
      <span data-session data-online="false">Conectando à sessão…</span>
      <span data-phase>aguardando telemetria</span>
    </header>
    <div class="lab-live-hud__players">
      ${["1", "2"].map((pid) => `
        <section class="lab-live-player" data-player="${pid}" aria-live="polite">
          <header class="lab-live-player__header">
            <span class="lab-live-player__slot">P${pid}</span>
            <div>
              <small>CONTROLADOR ATUAL</small>
              <strong data-model>Modelo aguardando</strong>
            </div>
            <span class="lab-live-player__signal" data-signal data-state="lost" aria-label="Sinal do heartbeat: indisponível">
              <i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
            </span>
            <span class="lab-live-player__status" data-status data-tone="idle">SEM HEARTBEAT</span>
          </header>
          <dl class="lab-live-player__metrics">
            <div><dt>Heartbeat</dt><dd data-heartbeat>—</dd></div>
            <div><dt>Última decisão</dt><dd data-decision-age>aguardando</dd></div>
            <div><dt>Movimento</dt><dd data-movement>· PARADO</dd></div>
            <div><dt>Ação de bomba</dt><dd data-bomb>NENHUMA</dd></div>
            <div class="lab-live-player__reason"><dt>Motivo da decisão</dt><dd data-reason>Aguardando a primeira decisão do modelo.</dd></div>
            <div><dt>Coordenadas</dt><dd data-coords>—</dd></div>
            <div><dt>Delta de movimento</dt><dd data-delta>—</dd></div>
          </dl>
          <div class="lab-live-feed">
            <h3>Feed de decisões <small>recente primeiro</small></h3>
            <ol data-log></ol>
          </div>
        </section>
      `).join("")}
    </div>
  `;

  container.appendChild(hud);
  _liveHudSessionEl = hud.querySelector<HTMLElement>("[data-session]");
  _liveHudPhaseEl = hud.querySelector<HTMLElement>("[data-phase]");

  for (const pid of ["1", "2"]) {
    const player = hud.querySelector<HTMLElement>(`[data-player="${pid}"]`);
    if (!player) continue;
    const required = <T extends HTMLElement>(selector: string): T => {
      const element = player.querySelector<T>(selector);
      if (!element) throw new Error(`Lab HUD element missing: ${selector}`);
      return element;
    };
    _livePlayerPanels.set(pid, {
      model: required("[data-model]"),
      status: required("[data-status]"),
      signal: required("[data-signal]"),
      heartbeat: required("[data-heartbeat]"),
      decisionAge: required("[data-decision-age]"),
      movement: required("[data-movement]"),
      bomb: required("[data-bomb]"),
      reason: required("[data-reason]"),
      coords: required("[data-coords]"),
      delta: required("[data-delta]"),
      log: required("[data-log]"),
    });
  }

  _loadSessionMetadata();
  _startLiveRefresh();
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

  setControlledPlayerIds(playerIds: Array<number | string>): void {
    this.invalidateDecisions([..._controlledPlayerIds, ...playerIds]);
    _controlledPlayerIds.clear();
    for (const playerId of playerIds) {
      _controlledPlayerIds.add(String(playerId));
    }
  },

  setLabCapability(capability: string): void {
    _labCapability = /^[A-Za-z0-9_-]{32,128}$/.test(capability) ? capability : "";
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
    _latestNavigation = snapshot.navigation ?? {};
    _checkHealth();
    const now = Date.now();
    if (now - _lastTelemetryAt < TELEMETRY_THROTTLE_MS) return;
    _lastTelemetryAt = now;
    _telemetryCount++;

    _post("/telemetry", snapshot).catch(() => {});

    for (const p of snapshot.players) {
      const playerId = String(p.id);
      if (p.active && p.alive && (_controlledPlayerIds.size === 0 || _controlledPlayerIds.has(playerId))) {
        _fetchDecision(playerId);
      }
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
    const decision = resolveFreshDecision(entry.d, entry.at);
    if (!decision) {
      _decisions.delete(pid);
      return null;
    }
    return decision;
  },

  invalidateDecisions(
    playerIds: Iterable<number | string> = _controlledPlayerIds,
    minimumStateTick = 0,
  ): void {
    for (const playerId of playerIds) {
      const pid = String(playerId);
      _decisions.delete(pid);
      _decisionRequests.delete(pid);
      _consumedDecisionActions.delete(pid);
      if (minimumStateTick > 0) {
        _minimumDecisionStateTick.set(pid, Math.max(
          minimumStateTick,
          _minimumDecisionStateTick.get(pid) ?? 0,
        ));
      }
    }
    _updatePanelDecisions();
  },

  hasFreshDecision(playerId: number | string): boolean {
    return this.getDecision(playerId) !== null;
  },

  /** When true, bots stand completely still if no Codex decision arrives (no built-in AI fallback). */
  get isStrictMode(): boolean { return _strictMode; },

  /** Returns false if this player's AI has been explicitly turned off via the side panel. */
  isPlayerEnabled(playerId: number | string): boolean {
    return _perPlayerEnabled[String(playerId)] !== false;
  },

  /** Mount the live Lab HUD (left = P1, right = P2). */
  mountSidePanels: mountLiveLabHud,

  /** Convert a BrokerDecision to the BotDecision format used by bot-ai.ts. */
  toBotDecision(d: BrokerDecision): BotDecision {
    const pid = String(d.playerId);
    const actionKey = _decisionActionKey(d);
    const isNewAction = _consumedDecisionActions.get(pid) !== actionKey;
    if (isNewAction) _consumedDecisionActions.set(pid, actionKey);
    const skillAction = d.skillAction ?? (d.useSkill ? "start" : "none");
    return {
      direction: d.direction ?? null,
      placeBomb: isNewAction && d.placeBomb,
      detonate: isNewAction && d.detonate,
      useSkill: isNewAction && (skillAction === "start" || skillAction === "release"),
      skillHeld: skillAction === "start" || skillAction === "hold",
      skillAction,
      requestId: d.requestId,
      microActionIndex: d.microActionIndex,
    };
  },
};

export default AutoImprovementBridge;
