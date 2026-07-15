"""
live_agent.py — Real-time gameplay observer and bot controller for BombaPVP.

This agent:
1. Polls GET /state from the broker every POLL_INTERVAL_SECONDS
2. When a new game tick arrives, builds a compact state prompt
3. Calls the configured model (Codex / Claude / OpenRouter)
4. Posts the bot decision back to POST /decision
5. On match end, logs a summary event for the insights pipeline

Environment variables
---------------------
BROKER_BASE             http://127.0.0.1:8766  (default)
AGENT_BOT_ID            bot-default
AGENT_PLAYER_ID         1
AGENT_PROVIDER          claude | openai_codex | openrouter | ollama
AGENT_MODEL             model name (empty = provider default)
AGENT_POLL_INTERVAL_SEC 0.05
AGENT_IDLE_INTERVAL_SEC 1.0
CODEX_HOME              path to .codex home
ANTHROPIC_API_KEY       for Claude provider
OPENROUTER_API_KEY      for OpenRouter provider
"""

import json
import os
import re
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Force UTF-8 so log output doesn't crash on Windows cp1252 consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    from action_outcomes import BLOCKED_CODES, classify_directional_movement
    from model_manager import call_model, compact_line
    from memory import append_event, append_match
except ModuleNotFoundError:
    from auto_improvements.action_outcomes import BLOCKED_CODES, classify_directional_movement
    from auto_improvements.model_manager import call_model, compact_line
    from auto_improvements.memory import append_event, append_match


BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8766").rstrip("/")
BROKER_INTERNAL_SECRET = os.environ.get("BROKER_INTERNAL_SECRET", "").strip()
AGENT_ID = os.environ.get("AGENT_BOT_ID", "bot-default")
PLAYER_ID = str(os.environ.get("AGENT_PLAYER_ID", "1"))
POLL_INTERVAL = float(os.environ.get("AGENT_POLL_INTERVAL_SEC", "0.05"))
IDLE_INTERVAL = float(os.environ.get("AGENT_IDLE_INTERVAL_SEC", "1.0"))
PROVIDER = compact_line(os.environ.get("AGENT_PROVIDER", "openai_codex"))
MODEL = compact_line(os.environ.get("AGENT_MODEL", ""))
REASONING_EFFORT = compact_line(os.environ.get(
    "CODEX_REASONING_EFFORT",
    "none" if PROVIDER == "9router" else "",
))
CODEX_HOME = os.environ.get("CODEX_HOME", "").strip()
CODEX_HOME_CHAIN_JSON = os.environ.get("AGENT_CODEX_HOME_CHAIN_JSON", "").strip()
OPENROUTER_API_KEY_ENV = os.environ.get("OPENROUTER_API_KEY_ENV_VAR", "OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")

TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "live_agent_system_prompt.txt").read_text(encoding="utf-8").strip()

VALID_DIRECTIONS = {"up", "down", "left", "right"}
VALID_SKILL_ACTIONS = {"start", "hold", "release", "none"}
ACCOUNT_FAILURE_THRESHOLD = 3
ACK_WAIT_TIMEOUT_MS = 1500
BLOCKED_ACTION_REPLAN_THRESHOLD = 2
MAX_IN_FLIGHT_MODEL_CALLS = max(1, int(os.environ.get("AGENT_MAX_IN_FLIGHT", "3")))
MODEL_TURN_MIN_INTERVAL_MS = max(50, int(os.environ.get("AGENT_TURN_INTERVAL_MS", "100")))
MODEL_DECISION_TTL_MS = max(200, int(os.environ.get("AGENT_DECISION_TTL_MS", "1200")))
MODEL_MAX_TOKENS = max(384, int(os.environ.get("AGENT_MAX_TOKENS", "768")))
MODEL_TURN_TIMEOUT_SECONDS = max(3.0, float(os.environ.get("AGENT_TURN_TIMEOUT_SEC", "20")))
REQUIRED_MICRO_ACTIONS = 30
PLAN_INVALID_RETRY_MS = max(500, int(os.environ.get("AGENT_PLAN_INVALID_RETRY_MS", "1500")))
_QUOTA_OR_AUTH_ERROR_KEYWORDS = (
    "rate_limit",
    "rate limit",
    "quota",
    "429",
    "insufficient_quota",
    "billing",
    "auth",
    "unauthorized",
    "401",
    "403",
    "token limit",
    "usage limit",
    "try again at",
)


def log(msg: str) -> None:
    print(f"[live-agent pid={player_id_label()}] {msg}", flush=True)


def player_id_label() -> str:
    return f"P{PLAYER_ID}"


def now_ms() -> int:
    return int(time.time() * 1000)


def _load_codex_home_chain() -> list[str]:
    homes: list[str] = []
    seen: set[str] = set()

    def _push(value: str) -> None:
        value = compact_line(value)
        if not value or value in seen:
            return
        homes.append(value)
        seen.add(value)

    if CODEX_HOME:
        _push(CODEX_HOME)
    if CODEX_HOME_CHAIN_JSON:
        try:
            payload = json.loads(CODEX_HOME_CHAIN_JSON)
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, str):
                        _push(item)
        except json.JSONDecodeError:
            for item in CODEX_HOME_CHAIN_JSON.split("||"):
                _push(item)
    default_home = Path.home() / ".codex"
    _push(str(default_home))
    for entry in sorted(Path.home().glob(".codex*")):
        if not entry.is_dir():
            continue
        if not (
            (entry / "auth.json").exists()
            or (entry / "config.toml").exists()
            or (entry / ".sandbox-bin" / "codex.exe").exists()
        ):
            continue
        _push(str(entry))
    codex2 = Path.home() / ".codex2"
    if codex2.exists():
        _push(str(codex2))
    return homes


def _is_quota_or_auth_error(status: str) -> bool:
    lowered = compact_line(status).lower()
    return any(keyword in lowered for keyword in _QUOTA_OR_AUTH_ERROR_KEYWORDS)


# ---------------------------------------------------------------------------
# Broker HTTP helpers
# ---------------------------------------------------------------------------

def _http_get(path: str) -> tuple[int, Any]:
    headers = {"x-bomba-lab-secret": BROKER_INTERNAL_SECRET} if BROKER_INTERNAL_SECRET else {}
    try:
        request = Request(f"{BROKER_BASE}{path}", headers=headers, method="GET")
        with urlopen(request, timeout=3) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8", errors="replace"))
        except Exception:
            return exc.code, {"ok": False}
    except (URLError, OSError) as exc:
        return 0, {"ok": False, "error": str(exc)}


def _http_post(path: str, payload: dict[str, Any]) -> tuple[int, Any]:
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    request = Request(
        f"{BROKER_BASE}{path}",
        data=raw,
        headers={
            "Content-Type": "application/json",
            **({"x-bomba-lab-secret": BROKER_INTERNAL_SECRET} if BROKER_INTERNAL_SECRET else {}),
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=3) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8", errors="replace"))
        except Exception:
            return exc.code, {"ok": False}
    except (URLError, OSError) as exc:
        return 0, {"ok": False, "error": str(exc)}


def _public_error_code(value: str) -> str:
    normalized = compact_line(str(value or "")).lower()
    action_error = re.search(r"action_(\d{1,2})_invalid", normalized)
    if action_error:
        return f"action_{action_error.group(1)}_invalid"
    action_count = re.search(r"action_count_(\d{1,3})", normalized)
    if action_count:
        return f"action_count_{action_count.group(1)}"
    plan_oscillation = re.search(r"plan_oscillation_(\d{1,2})", normalized)
    if plan_oscillation:
        return f"plan_oscillation_{plan_oscillation.group(1)}"
    if "timeout" in normalized:
        return "model_timeout"
    if _is_quota_or_auth_error(normalized):
        return "model_access_error"
    allowed = {
        "", "invalid_json", "response_not_object", "micro_actions_missing",
        "no_valid_actions", "repair_call_failed", "repair_budget_exhausted", "plan_invalid",
    }
    return normalized if normalized in allowed else "agent_error"


def send_heartbeat(
    status: str = "online",
    error: str = "",
    *,
    plan_action_count: int = 0,
    plan_valid_action_count: int = 0,
    plan_required_action_count: int = REQUIRED_MICRO_ACTIONS,
    plan_duration_ms: int = 0,
    plan_reversal_count: int = 0,
    plan_oscillation_run: int = 0,
    plan_valid_until_ms: int = 0,
    latency_ms: int = 0,
    repair_latency_ms: int = 0,
    plan_repaired: bool = False,
    last_action_outcome: str = "",
    last_action_code: str = "",
    last_action_request_id: int = 0,
    last_action_step: int = 0,
    last_action_direction: str = "",
    last_action_delta_x: float = 0,
    last_action_delta_y: float = 0,
    last_action_observed_at: int = 0,
    blocked_action_streak: int = 0,
    replan_request_id: int = 0,
    replan_reason: str = "",
    replan_triggered_at: int = 0,
    model_requests_in_flight: int = 0,
    stale_model_requests: int = 0,
) -> None:
    _http_post("/agent/heartbeat", {
        "agentId": f"live-{PLAYER_ID}",
        "botId": AGENT_ID,
        "provider": PROVIDER,
        "model": MODEL,
        "status": status,
        "error": _public_error_code(error),
        "planActionCount": max(0, int(plan_action_count)),
        "planValidActionCount": max(0, int(plan_valid_action_count)),
        "planRequiredActionCount": max(0, int(plan_required_action_count)),
        "planDurationMs": max(0, int(plan_duration_ms)),
        "planReversalCount": max(0, int(plan_reversal_count)),
        "planOscillationRun": max(0, int(plan_oscillation_run)),
        "planValidUntilMs": max(0, int(plan_valid_until_ms)),
        "latencyMs": max(0, int(latency_ms)),
        "repairLatencyMs": max(0, int(repair_latency_ms)),
        "planRepaired": bool(plan_repaired),
        "lastActionOutcome": str(last_action_outcome or ""),
        "lastActionCode": str(last_action_code or ""),
        "lastActionRequestId": max(0, int(last_action_request_id)),
        "lastActionStep": max(0, int(last_action_step)),
        "lastActionDirection": str(last_action_direction or ""),
        "lastActionDeltaX": float(last_action_delta_x or 0),
        "lastActionDeltaY": float(last_action_delta_y or 0),
        "lastActionObservedAt": max(0, int(last_action_observed_at)),
        "blockedActionStreak": max(0, int(blocked_action_streak)),
        "replanRequestId": max(0, int(replan_request_id)),
        "replanReason": str(replan_reason or ""),
        "replanTriggeredAt": max(0, int(replan_triggered_at)),
        "modelRequestsInFlight": max(0, int(model_requests_in_flight)),
        "staleModelRequests": max(0, int(stale_model_requests)),
    })


# ---------------------------------------------------------------------------
# Game state → compact prompt
# ---------------------------------------------------------------------------

def _tile_distance(a: dict[str, Any] | None, b: dict[str, Any] | None) -> int:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return 999
    try:
        return abs(int(a.get("x", 0)) - int(b.get("x", 0))) + abs(int(a.get("y", 0)) - int(b.get("y", 0)))
    except (TypeError, ValueError):
        return 999


def _tile_key(tile: dict[str, Any] | None) -> tuple[int, int]:
    if not isinstance(tile, dict):
        return (0, 0)
    try:
        return int(tile.get("x", 0)), int(tile.get("y", 0))
    except (TypeError, ValueError):
        return (0, 0)


def _player_state(state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
    players = state.get("players", [])
    return next((p for p in (players or []) if str(p.get("id")) == player_id), None)


def _current_life_active(state: dict[str, Any]) -> bool:
    me = _player_state(state, PLAYER_ID)
    return bool(me and me.get("alive") and me.get("active"))


def _navigation_for_player(state: dict[str, Any]) -> dict[str, Any]:
    navigation = state.get("navigation", {})
    if not isinstance(navigation, dict):
        return {}
    player_navigation = navigation.get(PLAYER_ID, {})
    return player_navigation if isinstance(player_navigation, dict) else {}


class ConcurrentTurnCoordinator:
    """Bounded model concurrency with newest-completed response ordering."""

    def __init__(self, max_in_flight: int = MAX_IN_FLIGHT_MODEL_CALLS) -> None:
        self._lock = threading.Lock()
        self._max_in_flight = max(1, int(max_in_flight))
        self._next_request_id = 1
        self._in_flight: dict[int, dict[str, int]] = {}
        self._latest_applied_request_id = 0
        self._latest_applied_state_tick = -1
        self._highest_applied_request_id = 0
        self._highest_terminal_request_id = 0
        self._context_generation = 0

    @property
    def in_flight_count(self) -> int:
        with self._lock:
            return len(self._in_flight)

    @property
    def stale_in_flight_count(self) -> int:
        with self._lock:
            return sum(
                1
                for token in self._in_flight.values()
                if int(token.get("contextGeneration", -1)) != self._context_generation
            )

    def reset(self) -> None:
        """Invalidate the old context while its physical calls keep their slots."""
        with self._lock:
            self._context_generation += 1
            self._latest_applied_request_id = 0
            self._latest_applied_state_tick = -1
            self._highest_applied_request_id = 0
            self._highest_terminal_request_id = 0

    def invalidate_context(self) -> int:
        """Reject pre-feedback responses without freeing their running slots."""
        with self._lock:
            self._context_generation += 1
            return self._next_request_id - 1

    def reserve(self, *, tick: int, round_epoch: int, life_epoch: int) -> dict[str, int] | None:
        with self._lock:
            if len(self._in_flight) >= self._max_in_flight:
                return None
            request_id = self._next_request_id
            self._next_request_id += 1
            token = {
                "requestId": request_id,
                "tick": int(tick),
                "roundEpoch": int(round_epoch),
                "lifeEpoch": int(life_epoch),
                "contextGeneration": self._context_generation,
                "startedAtMs": now_ms(),
            }
            self._in_flight[request_id] = token
            return dict(token)

    def release(self, token: dict[str, int]) -> None:
        """Free capacity after a failed call without advancing response ordering."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            self._in_flight.pop(request_id, None)

    def release_failure(
        self,
        token: dict[str, int],
        reporter: Callable[[], None] | None = None,
    ) -> bool:
        """Free capacity and report only if no newer request has already published."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            stored = self._in_flight.pop(request_id, None)
            if stored is None:
                return False
            if int(stored.get("contextGeneration", -1)) != self._context_generation:
                return False
            current = request_id > self._highest_terminal_request_id
            if current:
                self._highest_terminal_request_id = request_id
            if current and reporter is not None:
                reporter()
            return current

    def report_progress(self, token: dict[str, int], reporter: Callable[[], None]) -> bool:
        """Publish transient status only while no newer request has completed."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            current = (
                request_id in self._in_flight
                and int(token.get("contextGeneration", -1)) == self._context_generation
                and request_id > self._highest_terminal_request_id
            )
            if current:
                reporter()
            return current

    def publish(
        self,
        token: dict[str, int],
        *,
        round_epoch: int,
        life_epoch: int,
        state_tick: int | None = None,
        publisher: Callable[[], int],
        failure_reporter: Callable[[int], None] | None = None,
    ) -> tuple[bool, int | None]:
        """Serialize publication so an older HTTP POST cannot finish after a newer one."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            self._in_flight.pop(request_id, None)
            if int(token.get("contextGeneration", -1)) != self._context_generation:
                return False, None
            if int(token.get("roundEpoch", -1)) != int(round_epoch):
                return False, None
            if int(token.get("lifeEpoch", -1)) != int(life_epoch):
                return False, None
            candidate_state_tick = int(token.get("tick", -1) if state_tick is None else state_tick)
            if candidate_state_tick < self._latest_applied_state_tick:
                return False, None
            if (
                candidate_state_tick == self._latest_applied_state_tick
                and request_id <= self._latest_applied_request_id
            ):
                return False, None
            status = publisher()
            if status != 200:
                if request_id > self._highest_terminal_request_id:
                    self._highest_terminal_request_id = request_id
                    if failure_reporter is not None:
                        failure_reporter(status)
                return False, status
            self._latest_applied_request_id = request_id
            self._latest_applied_state_tick = candidate_state_tick
            self._highest_applied_request_id = max(self._highest_applied_request_id, request_id)
            self._highest_terminal_request_id = max(self._highest_terminal_request_id, request_id)
            return True, status


def relay_model_decision(
    decision: dict[str, Any],
    state: dict[str, Any],
    *,
    request_id: int,
    latency_ms: int,
) -> dict[str, Any]:
    """Attach transport metadata without changing any gameplay choice made by the model."""
    relayed = dict(decision)
    try:
        requested_ttl = int(relayed.get("expiresInMs", MODEL_DECISION_TTL_MS) or MODEL_DECISION_TTL_MS)
    except (TypeError, ValueError):
        requested_ttl = MODEL_DECISION_TTL_MS
    relayed.update({
        "source": "model",
        "stateTick": int(state.get("tick", -1) or -1),
        "requestId": int(request_id),
        "latencyMs": max(0, int(latency_ms)),
        "expiresInMs": max(200, min(18000, requested_ttl)),
    })
    return relayed


class ActionOutcomeMemory:
    """Per-request observations returned to the model; never changes an action locally."""

    def __init__(self, max_outcomes: int = 8) -> None:
        self._lock = threading.RLock()
        self._pending: dict[Any, dict[str, Any]] = {}
        self._outcomes: deque[dict[str, Any]] = deque(maxlen=max_outcomes)
        self._latest_outcome: dict[str, Any] = {}
        self._blocked_request_id = 0
        self._blocked_streak = 0
        self._last_replan_request_id = 0
        self._pending_replan_signal: dict[str, Any] | None = None

    def reset(self) -> None:
        with self._lock:
            self._pending.clear()
            self._outcomes.clear()
            self._latest_outcome = {}
            self._blocked_request_id = 0
            self._blocked_streak = 0
            self._last_replan_request_id = 0
            self._pending_replan_signal = None

    def _set_latest_outcome(self, outcome: dict[str, Any]) -> None:
        request_id = int(outcome.get("requestId", 0) or 0)
        if (
            outcome.get("executionState") == "blocked"
            and str(outcome.get("code", "") or "") in BLOCKED_CODES
            and not outcome.get("commandReplaced")
            and request_id > 0
        ):
            if request_id == self._blocked_request_id:
                self._blocked_streak += 1
            else:
                self._blocked_request_id = request_id
                self._blocked_streak = 1
        else:
            self._blocked_request_id = 0
            self._blocked_streak = 0

        outcome["consecutiveBlockedActions"] = self._blocked_streak
        self._latest_outcome = outcome
        if (
            self._blocked_streak >= BLOCKED_ACTION_REPLAN_THRESHOLD
            and request_id != self._last_replan_request_id
        ):
            self._last_replan_request_id = request_id
            self._pending_replan_signal = {
                "requestId": request_id,
                "consecutiveBlockedActions": self._blocked_streak,
                "code": str(outcome.get("code", "") or ""),
                "observedAtMs": int(outcome.get("observedAtMs", 0) or 0),
            }

    def record(self, decision: dict[str, Any], state: dict[str, Any]) -> None:
        with self._lock:
            me = _player_state(state, PLAYER_ID)
            if not me:
                return
            try:
                request_id = int(decision.get("requestId", 0) or 0)
            except (TypeError, ValueError):
                request_id = 0
            if request_id <= 0:
                request_id = now_ms()
            recorded_at_ms = now_ms()
            for pending_key, pending in list(self._pending.items()):
                if pending["requestId"] != request_id and not pending["commandReplaced"]:
                    if int(pending["recordedAtMs"]) > recorded_at_ms:
                        self._pending.pop(pending_key, None)
                        continue
                    pending["commandReplaced"] = True
                    pending["replacedAtMs"] = recorded_at_ms

            actions = decision.get("microActions")
            if not isinstance(actions, list) or not actions:
                actions = [decision]
            scheduled_offset_ms = 0
            for index, action in enumerate(actions):
                if not isinstance(action, dict):
                    continue
                direction = str(action.get("direction") or "")
                if direction not in VALID_DIRECTIONS:
                    direction = ""
                try:
                    duration_ms = max(100, min(500, int(action.get("durationMs", 250) or 250)))
                except (TypeError, ValueError):
                    duration_ms = 250
                pending_key: Any = request_id if len(actions) == 1 else (request_id, index)
                self._pending[pending_key] = {
                    "requestId": request_id,
                    "microActionIndex": index,
                    "direction": direction,
                    "origin": _tile_key(me.get("tile", {})),
                    "placeBomb": bool(action.get("placeBomb")),
                    "detonate": bool(action.get("detonate")),
                    "skillAction": str(action.get("skillAction", "none") or "none"),
                    "recordedAtMs": recorded_at_ms + scheduled_offset_ms,
                    "evaluateAfterMs": duration_ms,
                    "commandReplaced": False,
                    "replacedAtMs": 0,
                }
                scheduled_offset_ms += duration_ms

    def observe(self, state: dict[str, Any]) -> None:
        with self._lock:
            if not self._pending:
                return
            me = _player_state(state, PLAYER_ID)
            if not me:
                return
            observed_at_ms = now_ms()
            action_acks = {
                (int(ack.get("requestId", 0) or 0), int(ack.get("microActionIndex", 0) or 0)): ack
                for ack in (state.get("actionAcks") or [])
                if isinstance(ack, dict) and str(ack.get("playerId")) == PLAYER_ID
            }

            for pending_key, pending in list(self._pending.items()):
                request_id = int(pending["requestId"])
                micro_action_index = int(pending["microActionIndex"])
                age_ms = max(0, observed_at_ms - int(pending["recordedAtMs"]))
                origin = pending["origin"]
                direction = pending["direction"]
                details: list[str] = []
                ack = action_acks.get((request_id, micro_action_index))
                if not ack:
                    deadline_ms = (
                        int(pending["replacedAtMs"]) + ACK_WAIT_TIMEOUT_MS
                        if pending["commandReplaced"]
                        else int(pending["recordedAtMs"]) + int(pending["evaluateAfterMs"]) + ACK_WAIT_TIMEOUT_MS
                    )
                    if observed_at_ms < deadline_ms:
                        continue
                    self._outcomes.append({
                        "summary": (
                            f"request={request_id} step={micro_action_index} UNACKNOWLEDGED direction={direction or 'null'} "
                            f"origin={origin} age={age_ms}ms"
                        )
                    })
                    self._set_latest_outcome({
                        "executionState": "unconfirmed",
                        "code": "UNACKNOWLEDGED",
                        "requestId": request_id,
                        "microActionIndex": micro_action_index,
                        "direction": direction,
                        "movementDelta": {"x": 0.0, "y": 0.0},
                        "observedAtMs": observed_at_ms,
                        "commandReplaced": bool(pending["commandReplaced"]),
                    })
                    self._pending.pop(pending_key, None)
                    continue
                ack_origin = ack.get("tileBefore")
                if isinstance(ack_origin, dict):
                    origin = _tile_key(ack_origin)
                ack_destination = ack.get("tileAfter")
                destination = _tile_key(ack_destination) if isinstance(ack_destination, dict) else origin
                if (
                    bool(ack.get("alive", True))
                    and not pending["commandReplaced"]
                    and age_ms < int(pending["evaluateAfterMs"])
                ):
                    continue
                ack_delta = ack.get("movementDelta", {}) if isinstance(ack, dict) else {}

                primary_code = "WAITED"
                execution_state = "executed"
                movement_delta = {"x": 0.0, "y": 0.0}
                if direction:
                    movement_outcome = classify_directional_movement(
                        direction,
                        ack_delta if isinstance(ack_delta, dict) else {},
                        tile_changed=bool(ack.get("tileChanged")),
                    )
                    primary_code = movement_outcome.code
                    execution_state = movement_outcome.execution_state
                    movement_delta = {
                        "x": movement_outcome.delta_x,
                        "y": movement_outcome.delta_y,
                    }
                    details.append(primary_code)

                if pending["placeBomb"]:
                    placed = bool(ack.get("bombPlaced"))
                    bomb_code = "BOMB_PLACED" if placed else "BOMB_NO_EFFECT"
                    details.append(bomb_code)
                    if not placed or primary_code == "WAITED":
                        primary_code = bomb_code
                    if not placed:
                        execution_state = "blocked"

                if pending["detonate"]:
                    detonated = bool(ack.get("detonated"))
                    detonate_code = "DETONATED" if detonated else "DETONATE_NO_EFFECT"
                    details.append(detonate_code)
                    if not detonated or primary_code == "WAITED":
                        primary_code = detonate_code
                    if not detonated:
                        execution_state = "blocked"

                skill_action = pending["skillAction"]
                skill_phase_before = str(ack.get("skillPhaseBefore", "idle") or "idle")
                skill_phase = str(ack.get("skillPhaseAfter", "idle") or "idle")
                skill_code = ""
                skill_succeeded = True
                if skill_action == "start":
                    started = bool(ack.get("skillPressed")) and skill_phase_before == "idle" and skill_phase != "idle"
                    skill_code = "SKILL_STARTED" if started else "SKILL_NO_EFFECT"
                    skill_succeeded = started
                elif skill_action == "hold":
                    held = bool(ack.get("skillHeld")) and skill_phase_before in {"channeling", "releasing"}
                    skill_code = "SKILL_HELD" if held else "SKILL_HOLD_NO_EFFECT"
                    skill_succeeded = held
                elif skill_action == "release":
                    released = (
                        bool(ack.get("skillPressed"))
                        and skill_phase_before in {"channeling", "releasing"}
                        and skill_phase != skill_phase_before
                    )
                    skill_code = "SKILL_RELEASED" if released else "SKILL_RELEASE_NO_EFFECT"
                    skill_succeeded = released
                if skill_code:
                    details.append(skill_code)
                    if not skill_succeeded or primary_code == "WAITED":
                        primary_code = skill_code
                    if not skill_succeeded:
                        execution_state = "blocked"

                if not details:
                    details.append("WAITED")
                if not bool(ack.get("alive", True)):
                    details.append("DIED_AFTER")
                    primary_code = "DIED_AFTER"
                    execution_state = "blocked"
                if pending["commandReplaced"]:
                    details.append("COMMAND_REPLACED")
                self._outcomes.append({
                    "summary": (
                        f"request={request_id} step={micro_action_index} {'+'.join(details)} direction={direction or 'null'} "
                        f"origin={origin} final={destination} delta=({ack_delta.get('x', 0)},{ack_delta.get('y', 0)}) "
                        f"ack=true age={age_ms}ms"
                    )
                })
                self._set_latest_outcome({
                    "executionState": execution_state,
                    "code": primary_code,
                    "requestId": request_id,
                    "microActionIndex": micro_action_index,
                    "direction": direction,
                    "movementDelta": movement_delta,
                    "observedAtMs": observed_at_ms,
                    "commandReplaced": bool(pending["commandReplaced"]),
                })
                self._pending.pop(pending_key, None)

    def prompt_context(self, state: dict[str, Any]) -> str:
        with self._lock:
            lines = [str(item["summary"]) for item in self._outcomes]
            return "\n".join(lines) if lines else "No evaluated actions yet."

    def latest_outcome(self) -> dict[str, Any]:
        with self._lock:
            latest = dict(self._latest_outcome)
            delta = latest.get("movementDelta")
            if isinstance(delta, dict):
                latest["movementDelta"] = dict(delta)
            return latest

    def consume_replan_signal(self) -> dict[str, Any] | None:
        with self._lock:
            signal = self._pending_replan_signal
            self._pending_replan_signal = None
            return dict(signal) if signal is not None else None

    def requeue_replan_signal(self, signal: dict[str, Any]) -> None:
        with self._lock:
            if self._pending_replan_signal is None:
                self._pending_replan_signal = dict(signal)




def build_prompt(state: dict[str, Any], *, outcome_context: str = "") -> str:
    players = [p for p in (state.get("players") or []) if isinstance(p, dict)]
    me = next((p for p in players if str(p.get("id")) == PLAYER_ID), None)
    if me is None:
        return '{"microActions":[[null,500,false,false,"none"]],"reason":"no self state"}'

    me_tile = me.get("tile", {})
    navigation = _navigation_for_player(state)

    def compact_player(player: dict[str, Any]) -> dict[str, Any]:
        return {
            key: player.get(key)
            for key in (
                "id", "alive", "active", "tile", "direction", "activeBombs", "maxBombs",
                "flameRange", "speedLevel", "remoteLevel", "shieldCharges", "bombPassLevel",
                "kickLevel", "shortFuseLevel", "flameGuardMs", "spawnProtectionMs", "skill",
            )
            if key in player
        }

    enemies = sorted(
        [p for p in players if str(p.get("id")) != PLAYER_ID and p.get("alive")],
        key=lambda player: _tile_distance(me_tile, player.get("tile", {})),
    )[:3]
    bombs = sorted(
        [b for b in (state.get("bombs") or []) if isinstance(b, dict)],
        key=lambda bomb: _tile_distance(me_tile, bomb.get("tile", {})),
    )[:8]
    flames = sorted(
        [f for f in (state.get("flames") or []) if isinstance(f, dict)],
        key=lambda flame: _tile_distance(me_tile, flame.get("tile", {})),
    )[:10]
    powerups = sorted(
        [p for p in (state.get("powerUps") or []) if isinstance(p, dict)],
        key=lambda powerup: _tile_distance(me_tile, powerup.get("tile", {})),
    )[:8]

    payload = {
        "tick": state.get("tick", 0),
        "phase": state.get("phase", ""),
        "roundNumber": state.get("roundNumber", 0),
        "score": state.get("matchScore", {}),
        "suddenDeath": state.get("suddenDeath", {}),
        "self": compact_player(me),
        "enemies": [compact_player(enemy) for enemy in enemies],
        "bombs": [
            {key: bomb.get(key) for key in ("ownerId", "tile", "fuseMs", "flameRange") if key in bomb}
            for bomb in bombs
        ],
        "flames": [
            {key: flame.get(key) for key in ("tile", "remainingMs") if key in flame}
            for flame in flames
        ],
        "powerUps": [
            {key: powerup.get(key) for key in ("type", "tile") if key in powerup}
            for powerup in powerups
        ],
        "navigation": {
            "walkableDirections": navigation.get("walkableDirections", []),
            "blockedDirections": navigation.get("blockedDirections", []),
            "stalledForMs": navigation.get("stalledForMs", 0),
            "lastMovementDelta": navigation.get("lastMovementDelta", {}),
            "localTiles": [
                [tile.get("x"), tile.get("y"), tile.get("kind"), tile.get("dangerEtaMs")]
                for tile in (navigation.get("localTiles") or [])
                if isinstance(tile, dict)
            ],
        },
        "recentOutcomes": (outcome_context or "No evaluated actions yet.").splitlines()[-8:],
    }
    compact = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    return (
        f"ROLLING MICRO-ACTION PLAN for P{PLAYER_ID}. You alone choose every gameplay action; no local policy will correct it. "
        "React to this exact snapshot and previous outcomes. Return exactly 30 microActions covering 12-15 seconds. "
        "Each compact action is [direction,durationMs,placeBomb,detonate,skillAction], duration 400-500ms. "
        "Return only one JSON object with microActions and reason. "
        f"STATE={compact}"
    )


# ---------------------------------------------------------------------------
# Decision parsing
# ---------------------------------------------------------------------------

_OPPOSITE_DIRECTIONS = {
    ("left", "right"),
    ("right", "left"),
    ("up", "down"),
    ("down", "up"),
}
MAX_OSCILLATING_ACTION_RUN = 3


def _movement_plan_quality(micro_actions: list[dict[str, Any]]) -> dict[str, int]:
    """Measure immediate U-turns without treating normal corners as oscillation."""
    reversal_count = 0
    current_run = 0
    longest_run = 0
    previous_direction: str | None = None
    previous_was_reversal = False

    for action in micro_actions:
        direction = action.get("direction")
        if direction not in VALID_DIRECTIONS:
            previous_direction = None
            previous_was_reversal = False
            current_run = 0
            continue

        is_reversal = (previous_direction, direction) in _OPPOSITE_DIRECTIONS
        if is_reversal:
            reversal_count += 1
            current_run = current_run + 1 if previous_was_reversal else 2
            longest_run = max(longest_run, current_run)
        else:
            current_run = 1
        previous_direction = direction
        previous_was_reversal = is_reversal

    return {
        "planReversalCount": reversal_count,
        "planOscillationRun": longest_run,
    }


def parse_decision_with_diagnostics(
    raw: str,
    *,
    require_full_plan: bool = False,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    diagnostics: dict[str, Any] = {
        "errorCode": "invalid_json",
        "planActionCount": 0,
        "planValidActionCount": 0,
        "planRequiredActionCount": REQUIRED_MICRO_ACTIONS if require_full_plan else 1,
        "planDurationMs": 0,
        "planReversalCount": 0,
        "planOscillationRun": 0,
    }
    text = raw.strip()
    # strip markdown fences if present
    if "```" in text:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # try to extract first JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end])
            except json.JSONDecodeError:
                return None, diagnostics
        else:
            return None, diagnostics

    if not isinstance(data, dict):
        diagnostics["errorCode"] = "response_not_object"
        return None, diagnostics

    def normalize_micro_action(
        value: Any,
        *,
        min_duration_ms: int = 100,
        strict: bool = False,
    ) -> dict[str, Any] | None:
        if strict:
            if not isinstance(value, list) or len(value) != 5:
                return None
            direction, duration_ms, place_bomb, detonate, skill_action = value
            if direction is not None and (not isinstance(direction, str) or direction not in VALID_DIRECTIONS):
                return None
            if isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or not 400 <= duration_ms <= 500:
                return None
            if not isinstance(place_bomb, bool) or not isinstance(detonate, bool):
                return None
            if not isinstance(skill_action, str) or skill_action not in VALID_SKILL_ACTIONS:
                return None
            return {
                "direction": direction,
                "durationMs": duration_ms,
                "placeBomb": place_bomb,
                "detonate": detonate,
                "skillAction": skill_action,
            }
        if isinstance(value, list) and len(value) >= 5:
            direction, duration_ms, place_bomb, detonate, skill_action = value[:5]
        elif isinstance(value, dict):
            direction = value.get("direction", value.get("d"))
            duration_ms = value.get("durationMs", value.get("ms", 250))
            place_bomb = value.get("placeBomb", value.get("b", False))
            detonate = value.get("detonate", value.get("x", False))
            skill_action = value.get("skillAction", value.get("s", "none"))
        else:
            return None
        if direction is not None:
            direction = str(direction).lower()
            if direction not in VALID_DIRECTIONS:
                direction = None
        try:
            duration_ms = max(min_duration_ms, min(500, int(duration_ms)))
        except (TypeError, ValueError):
            duration_ms = min_duration_ms
        skill_action = str(skill_action or "none").lower()
        if skill_action not in VALID_SKILL_ACTIONS:
            skill_action = "none"
        return {
            "direction": direction,
            "durationMs": duration_ms,
            "placeBomb": bool(place_bomb),
            "detonate": bool(detonate),
            "skillAction": skill_action,
        }

    raw_micro_actions = data.get("microActions")
    if not isinstance(raw_micro_actions, list):
        if require_full_plan:
            diagnostics["errorCode"] = "micro_actions_missing"
            return None, diagnostics
        raw_micro_actions = []

    diagnostics["planActionCount"] = len(raw_micro_actions)
    if require_full_plan and len(raw_micro_actions) != REQUIRED_MICRO_ACTIONS:
        diagnostics["errorCode"] = f"action_count_{len(raw_micro_actions)}"
        valid_actions = [
            normalize_micro_action(value, min_duration_ms=400, strict=True)
            for value in raw_micro_actions[:REQUIRED_MICRO_ACTIONS]
        ]
        normalized_valid_actions = [action for action in valid_actions if action is not None]
        diagnostics["planValidActionCount"] = len(normalized_valid_actions)
        diagnostics["planDurationMs"] = sum(action["durationMs"] for action in normalized_valid_actions)
        return None, diagnostics

    micro_actions: list[dict[str, Any]] = []
    first_invalid_index: int | None = None
    for index, value in enumerate(raw_micro_actions[:REQUIRED_MICRO_ACTIONS]):
        normalized = normalize_micro_action(
            value,
            min_duration_ms=400,
            strict=require_full_plan,
        )
        if normalized is None:
            if first_invalid_index is None:
                first_invalid_index = index
            continue
        micro_actions.append(normalized)

    diagnostics["planValidActionCount"] = len(micro_actions)
    diagnostics["planDurationMs"] = sum(action["durationMs"] for action in micro_actions)
    if require_full_plan and len(micro_actions) != REQUIRED_MICRO_ACTIONS:
        diagnostics["errorCode"] = (
            f"action_{first_invalid_index + 1}_invalid"
            if first_invalid_index is not None
            else "no_valid_actions"
        )
        return None, diagnostics
    if not micro_actions:
        if require_full_plan:
            diagnostics["errorCode"] = "no_valid_actions"
            return None, diagnostics
        legacy = normalize_micro_action({
            "direction": data.get("direction"),
            "durationMs": data.get("expiresInMs", MODEL_DECISION_TTL_MS),
            "placeBomb": data.get("placeBomb", False),
            "detonate": data.get("detonate", False),
            "skillAction": data.get("skillAction", "start" if data.get("useSkill") else "none"),
        })
        if legacy:
            micro_actions = [legacy]
    if not micro_actions:
        diagnostics["errorCode"] = "no_valid_actions"
        return None, diagnostics

    quality = _movement_plan_quality(micro_actions)
    diagnostics.update(quality)
    if require_full_plan and quality["planOscillationRun"] > MAX_OSCILLATING_ACTION_RUN:
        diagnostics["errorCode"] = f"plan_oscillation_{quality['planReversalCount']}"
        return None, diagnostics

    first = micro_actions[0]
    plan_duration_ms = sum(action["durationMs"] for action in micro_actions)

    decision = {
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": first["direction"],
        "placeBomb": first["placeBomb"],
        "detonate": first["detonate"],
        "skillAction": first["skillAction"],
        "microActions": micro_actions,
        "expiresInMs": plan_duration_ms,
        "reason": str(data.get("reason", ""))[:120],
        **quality,
    }
    diagnostics.update({
        "errorCode": "",
        "planActionCount": len(micro_actions),
        "planValidActionCount": len(micro_actions),
        "planDurationMs": plan_duration_ms,
    })
    return decision, diagnostics


def parse_decision(raw: str, *, require_full_plan: bool = False) -> dict[str, Any] | None:
    decision, _diagnostics = parse_decision_with_diagnostics(
        raw,
        require_full_plan=require_full_plan,
    )
    return decision


def build_plan_repair_prompt(fresh_prompt: str, diagnostics: dict[str, Any]) -> str:
    valid_count = int(diagnostics.get("planValidActionCount", 0) or 0)
    required_count = int(diagnostics.get("planRequiredActionCount", REQUIRED_MICRO_ACTIONS) or REQUIRED_MICRO_ACTIONS)
    error_code = _public_error_code(str(diagnostics.get("errorCode", "plan_invalid") or "plan_invalid"))
    oscillation_instruction = (
        " Replace the alternating opposites with a committed route or a null hold; "
        "never alternate opposite directions across four consecutive actions."
        if error_code.startswith("plan_oscillation_")
        else ""
    )
    return (
        f"PLAN REPAIR REQUIRED: the previous response was rejected ({valid_count}/{required_count} valid; {error_code}). "
        f"Regenerate exactly one complete strict plan for the FRESH snapshot below.{oscillation_instruction} "
        "Return only one JSON object with exactly 30 compact microActions and reason; do not explain the correction.\n"
        f"{fresh_prompt}"
    )


# ---------------------------------------------------------------------------
# Codex call helpers (session-aware, mirrors The-Last-Arrow architecture)
# ---------------------------------------------------------------------------

def _codex_new(
    prompt: str,
    *,
    codex_home: str = "",
    timeout_seconds: float | None = None,
) -> tuple[str | None, str | None, str]:
    """Start a new Codex session. Returns (text, session_id, status)."""
    turn_timeout_seconds = (
        MODEL_TURN_TIMEOUT_SECONDS
        if timeout_seconds is None
        else max(0.5, float(timeout_seconds))
    )
    if PROVIDER != "openai_codex":
        text, status = call_model(
            prompt, SYSTEM_PROMPT,
            provider=PROVIDER, model=MODEL, reasoning_effort=REASONING_EFFORT,
            codex_home=codex_home or CODEX_HOME,
            openrouter_api_key_env=OPENROUTER_API_KEY_ENV,
            openrouter_base_url=OPENROUTER_BASE_URL,
            max_tokens=MODEL_MAX_TOKENS, timeout=turn_timeout_seconds,
            json_mode=True,
        )
        return text, None, status

    # openai_codex: use the low-level new-session call that returns thread_id
    try:
        from model_manager import _call_codex_new
    except ImportError:
        from auto_improvements.model_manager import _call_codex_new  # type: ignore

    return _call_codex_new(
        prompt, SYSTEM_PROMPT,
        model=MODEL, reasoning_effort=REASONING_EFFORT,
        codex_home=codex_home or CODEX_HOME, timeout=turn_timeout_seconds,
    )


def _codex_resume(session_id: str, prompt: str, *, codex_home: str = "") -> tuple[str | None, str]:
    """Resume an existing Codex session. Returns (text, status)."""
    try:
        from model_manager import _call_codex_resume
    except ImportError:
        from auto_improvements.model_manager import _call_codex_resume  # type: ignore

    return _call_codex_resume(
        session_id, prompt,
        model=MODEL, reasoning_effort=REASONING_EFFORT,
        codex_home=codex_home or CODEX_HOME, timeout=MODEL_TURN_TIMEOUT_SECONDS,
    )


# ---------------------------------------------------------------------------
# Warmup — establishes Codex session before the first match tick
# ---------------------------------------------------------------------------

WARMUP_PROMPT = (
    "This is a warm-up turn before a live Bomberman match.\n"
    "Return a default aggressive opening move: move right, do not place bomb.\n"
    f"You will be controlling player {PLAYER_ID}.\n"
)


def run_warmup(*, codex_home: str = "") -> tuple[str | None, str | None]:
    """Run a warmup Codex call. Returns (session_id, warmup_decision_raw)."""
    log("warmup: starting Codex session...")
    raw, session_id, status = _codex_new(WARMUP_PROMPT, codex_home=codex_home)
    if status == "ok" and raw:
        log(f"warmup OK  session={str(session_id or '')[:12]}  raw={raw[:60]}")
        return session_id, raw
    log(f"warmup FAILED: {status}")
    return None, None


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------



class LiveAgent:
    """Model-first controller: transport, freshness and feedback only; no gameplay policy."""

    def __init__(self) -> None:
        self.last_tick = -1
        self.last_phase = ""
        self.decisions_this_match = 0
        self.running = True
        self._codex_session_id: str | None = None
        self._ai_retry_at_ms = 0
        self._last_model_error = ""
        self._codex_homes = _load_codex_home_chain()
        self._codex_home_index = 0
        self._account_consecutive_failures = 0
        self._round_epoch = 0
        self._last_round_number = 0
        self._life_epoch = 0
        self._latest_state: dict[str, Any] = {}
        self._latest_state_lock = threading.Lock()
        self._was_alive_in_match = False
        self._action_memory = ActionOutcomeMemory()
        concurrency = 1 if PROVIDER == "openai_codex" else MAX_IN_FLIGHT_MODEL_CALLS
        self._turns = ConcurrentTurnCoordinator(concurrency)
        self._last_model_turn_started_at_ms = 0
        self._heartbeat_lock = threading.RLock()
        self._heartbeat_order = (0, 0, 0, 0)
        self._heartbeat_status = "online"
        self._heartbeat_error = ""
        self._heartbeat_metrics: dict[str, Any] = {
            "plan_action_count": 0,
            "plan_valid_action_count": 0,
            "plan_required_action_count": REQUIRED_MICRO_ACTIONS,
            "plan_duration_ms": 0,
            "plan_reversal_count": 0,
            "plan_oscillation_run": 0,
            "plan_valid_until_ms": 0,
            "latency_ms": 0,
            "repair_latency_ms": 0,
            "plan_repaired": False,
            "last_action_outcome": "",
            "last_action_code": "",
            "last_action_request_id": 0,
            "last_action_step": 0,
            "last_action_direction": "",
            "last_action_delta_x": 0.0,
            "last_action_delta_y": 0.0,
            "last_action_observed_at": 0,
            "blocked_action_streak": 0,
            "replan_request_id": 0,
            "replan_reason": "",
            "replan_triggered_at": 0,
            "model_requests_in_flight": 0,
            "stale_model_requests": 0,
        }

    def _remember_outcome_for_heartbeat(self, outcome: dict[str, Any] | None) -> None:
        outcome = outcome or {}
        delta = outcome.get("movementDelta") if isinstance(outcome.get("movementDelta"), dict) else {}
        blocked_streak = int(outcome.get("consecutiveBlockedActions", 0) or 0)
        with self._heartbeat_lock:
            self._heartbeat_metrics.update({
                "last_action_outcome": str(outcome.get("executionState", "") or ""),
                "last_action_code": str(outcome.get("code", "") or ""),
                "last_action_request_id": int(outcome.get("requestId", 0) or 0),
                "last_action_step": int(outcome.get("microActionIndex", 0) or 0),
                "last_action_direction": str(outcome.get("direction", "") or ""),
                "last_action_delta_x": float(delta.get("x", 0) or 0),
                "last_action_delta_y": float(delta.get("y", 0) or 0),
                "last_action_observed_at": int(outcome.get("observedAtMs", 0) or 0),
                "blocked_action_streak": blocked_streak,
            })
            if blocked_streak == 0:
                self._heartbeat_metrics.update({
                    "replan_request_id": 0,
                    "replan_reason": "",
                    "replan_triggered_at": 0,
                })

    def _handle_blocked_plan_replan(self, signal: dict[str, Any]) -> bool:
        request_id = int(signal.get("requestId", 0) or 0)
        streak = int(signal.get("consecutiveBlockedActions", 0) or 0)
        reason = str(signal.get("code", "") or "")
        triggered_at = int(signal.get("observedAtMs", 0) or now_ms())
        # Take the context watermark before touching the broker. A response that
        # was already publishing finishes under the coordinator lock first and
        # is therefore included in this cutoff; a later-context plan is not.
        max_stale_request_id = int(signal.get("maxStaleRequestId", 0) or 0)
        if max_stale_request_id <= 0:
            max_stale_request_id = max(request_id, self._turns.invalidate_context())
            signal["maxStaleRequestId"] = max_stale_request_id
        try:
            status, body = _http_post("/decision/revoke", {
                "playerId": PLAYER_ID,
                "requestId": request_id,
                "maxRequestId": max_stale_request_id,
                "reason": reason,
            })
        except Exception as exc:
            log(f"replan revoke transport error={type(exc).__name__}")
            return False
        if status != 200 or not isinstance(body, dict):
            return False
        result = str(body.get("result", "revoked" if body.get("revoked") else "") or "")
        if result == "superseded":
            return True
        if result not in {"revoked", "missing"}:
            return False

        # Any in-flight response started before this feedback lacks the repeated
        # block context. Discard it logically and let the current loop reserve a
        # fresh turn from the latest snapshot.
        self._last_model_turn_started_at_ms = 0
        self._send_heartbeat(
            "replanning_blocked",
            "",
            plan_valid_action_count=0,
            plan_duration_ms=0,
            plan_valid_until_ms=0,
            blocked_action_streak=streak,
            replan_request_id=request_id,
            replan_reason=reason,
            replan_triggered_at=triggered_at,
        )
        log(f"replan blocked request={request_id} streak={streak} reason={reason}")
        return True

    def _send_heartbeat(
        self,
        status: str | None = None,
        error: str | None = None,
        *,
        heartbeat_order: tuple[int, int, int, int] | None = None,
        **metrics: Any,
    ) -> bool:
        with self._heartbeat_lock:
            if heartbeat_order is not None:
                normalized_order = tuple(int(value) for value in heartbeat_order)
                if normalized_order < self._heartbeat_order:
                    return False
                self._heartbeat_order = normalized_order
            if status is not None:
                self._heartbeat_status = status
            if error is not None:
                self._heartbeat_error = error
            for key, value in metrics.items():
                if key in self._heartbeat_metrics and value is not None:
                    self._heartbeat_metrics[key] = value
            self._heartbeat_metrics["model_requests_in_flight"] = self._turns.in_flight_count
            self._heartbeat_metrics["stale_model_requests"] = self._turns.stale_in_flight_count
            send_heartbeat(
                self._heartbeat_status,
                self._heartbeat_error,
                **self._heartbeat_metrics,
            )
            return True

    @staticmethod
    def _turn_heartbeat_order(token: dict[str, int], stage: int) -> tuple[int, int, int, int]:
        return (
            int(token.get("roundEpoch", 0) or 0),
            int(token.get("lifeEpoch", 0) or 0),
            int(token.get("requestId", 0) or 0),
            max(0, int(stage)),
        )

    def _current_codex_home(self) -> str:
        if self._codex_homes:
            return self._codex_homes[self._codex_home_index]
        return CODEX_HOME

    def _current_codex_home_label(self) -> str:
        home = self._current_codex_home()
        if not home:
            return "(default)"
        try:
            return Path(home).name or home
        except OSError:
            return home

    def _rotate_codex_home(self, reason: str = "") -> bool:
        if PROVIDER != "openai_codex" or len(self._codex_homes) < 2:
            return False
        old_home = self._current_codex_home_label()
        old_index = self._codex_home_index
        self._codex_home_index = (self._codex_home_index + 1) % len(self._codex_homes)
        if self._codex_home_index == old_index:
            return False
        self._codex_session_id = None
        self._account_consecutive_failures = 0
        self._ai_retry_at_ms = now_ms() + 1000
        suffix = f" | reason={reason}" if reason else ""
        log(f"[auth-fallback] rotating Codex account: {old_home} -> {self._current_codex_home_label()}{suffix}")
        return True

    def _set_latest_state(self, state: dict[str, Any]) -> None:
        with self._latest_state_lock:
            self._latest_state = state

    def _get_latest_state(self) -> dict[str, Any]:
        with self._latest_state_lock:
            return dict(self._latest_state)

    def run(self) -> None:
        log(
            f"starting model-first provider={PROVIDER} model={MODEL or '(default)'} "
            f"player={PLAYER_ID} concurrency={1 if PROVIDER == 'openai_codex' else MAX_IN_FLIGHT_MODEL_CALLS}"
        )
        self._send_heartbeat()
        heartbeat_at = now_ms()

        # Persistent Codex sessions need a connection warmup. Stateless 9router
        # calls start directly from the first real game snapshot.
        if PROVIDER == "openai_codex":
            session_id, _ = run_warmup(codex_home=self._current_codex_home())
            self._codex_session_id = session_id

        while self.running:
            try:
                current_ms = now_ms()
                if current_ms - heartbeat_at > 5000:
                    self._send_heartbeat()
                    heartbeat_at = current_ms

                status, body = _http_get("/state")
                if status != 200 or not isinstance(body, dict) or not body.get("ok"):
                    time.sleep(IDLE_INTERVAL)
                    continue

                tick = int(body.get("tick", -1) or -1)
                state = body.get("state") or {}
                phase = str(state.get("phase", "") or "")
                try:
                    round_number = max(0, int(state.get("roundNumber", 0) or 0))
                except (TypeError, ValueError):
                    round_number = 0
                self._set_latest_state(state)
                self._action_memory.observe(state)
                self._remember_outcome_for_heartbeat(self._action_memory.latest_outcome())
                me_alive = _current_life_active(state)

                round_changed = (
                    phase == "match"
                    and self.last_phase == "match"
                    and round_number > 0
                    and self._last_round_number > 0
                    and round_number != self._last_round_number
                )
                if phase == "match" and (self.last_phase != "match" or round_changed):
                    self._round_epoch += 1
                    self._life_epoch += 1 if me_alive else 0
                    self.decisions_this_match = 0
                    self._codex_session_id = None
                    self._action_memory.reset()
                    self._remember_outcome_for_heartbeat(None)
                    self._turns.reset()
                    self._last_model_turn_started_at_ms = 0
                    self._was_alive_in_match = me_alive
                    log("=" * 55)
                    log(f"ROUND STARTED player={PLAYER_ID} round={round_number or '?'}; waiting only for model decisions")
                    log("=" * 55)

                if phase == "match-result" and self.last_phase == "match":
                    self._round_epoch += 1
                    self._turns.reset()
                    self._was_alive_in_match = False
                    self._send_heartbeat(
                        "inactive",
                        "",
                        heartbeat_order=(self._round_epoch, self._life_epoch, 0, 4),
                        plan_valid_until_ms=0,
                    )
                    self._on_match_ended(state)

                self.last_phase = phase
                if round_number > 0:
                    self._last_round_number = round_number
                if phase != "match":
                    time.sleep(IDLE_INTERVAL)
                    continue

                was_alive_in_match = self._was_alive_in_match
                if me_alive and not was_alive_in_match:
                    self._life_epoch += 1
                    self._turns.reset()
                    self._last_model_turn_started_at_ms = 0
                self._was_alive_in_match = me_alive
                if not me_alive:
                    if was_alive_in_match:
                        self._life_epoch += 1
                        self._turns.reset()
                        self._send_heartbeat(
                            "inactive",
                            "",
                            heartbeat_order=(self._round_epoch, self._life_epoch, 0, 4),
                            plan_valid_until_ms=0,
                        )
                    time.sleep(POLL_INTERVAL)
                    continue

                replan_signal = self._action_memory.consume_replan_signal()
                if replan_signal is not None:
                    if not self._handle_blocked_plan_replan(replan_signal):
                        self._action_memory.requeue_replan_signal(replan_signal)

                if tick == self.last_tick:
                    time.sleep(POLL_INTERVAL)
                    continue
                self.last_tick = tick

                current_ms = now_ms()
                if (
                    current_ms >= self._ai_retry_at_ms
                    and current_ms - self._last_model_turn_started_at_ms >= MODEL_TURN_MIN_INTERVAL_MS
                ):
                    self._fire_ai_call(state, tick)

            except KeyboardInterrupt:
                self.running = False
            except Exception as exc:
                log(f"error in loop: {exc}")
                time.sleep(1.0)

        log("stopped")

    def _fire_ai_call(self, state: dict[str, Any], tick: int) -> None:
        token = self._turns.reserve(
            tick=tick,
            round_epoch=self._round_epoch,
            life_epoch=self._life_epoch,
        )
        if token is None:
            stale_requests = self._turns.stale_in_flight_count
            if stale_requests > 0:
                with self._heartbeat_lock:
                    already_reported = (
                        self._heartbeat_status == "draining_stale"
                        and self._heartbeat_metrics["stale_model_requests"] == stale_requests
                    )
                if not already_reported:
                    self._send_heartbeat(
                        "draining_stale",
                        "",
                        heartbeat_order=(self._round_epoch, self._life_epoch, 0, 1),
                    )
            return
        self._last_model_turn_started_at_ms = now_ms()
        request_id = token["requestId"]
        prompt = build_prompt(state, outcome_context=self._action_memory.prompt_context(state))
        session_id = self._codex_session_id
        codex_home = self._current_codex_home()
        self._send_heartbeat(
            "thinking",
            heartbeat_order=self._turn_heartbeat_order(token, 1),
        )

        def _worker() -> None:
            new_session_id: str | None = None
            decision_state = state
            repair_latency_ms = 0
            if session_id and PROVIDER == "openai_codex":
                raw, status = _codex_resume(session_id, prompt, codex_home=codex_home)
            else:
                raw, new_session_id, status = _codex_new(prompt, codex_home=codex_home)

            if status != "ok" or raw is None:
                self._turns.release_failure(
                    token,
                    lambda: self._handle_model_error(
                        status,
                        tick,
                        heartbeat_order=self._turn_heartbeat_order(token, 3),
                    ),
                )
                return

            strict_plan = PROVIDER in {"9router", "openrouter", "openai_compatible"}
            decision, plan_diagnostics = parse_decision_with_diagnostics(
                raw,
                require_full_plan=strict_plan,
            )
            plan_repaired = False
            if decision is None and strict_plan:
                first_latency_ms = now_ms() - token["startedAtMs"]
                progress_reported = self._turns.report_progress(
                    token,
                    lambda: self._send_heartbeat(
                        "repairing_plan",
                        str(plan_diagnostics.get("errorCode", "plan_invalid")),
                        heartbeat_order=self._turn_heartbeat_order(token, 2),
                        plan_action_count=int(plan_diagnostics.get("planActionCount", 0) or 0),
                        plan_valid_action_count=int(plan_diagnostics.get("planValidActionCount", 0) or 0),
                        plan_required_action_count=int(plan_diagnostics.get("planRequiredActionCount", REQUIRED_MICRO_ACTIONS) or REQUIRED_MICRO_ACTIONS),
                        plan_duration_ms=int(plan_diagnostics.get("planDurationMs", 0) or 0),
                        plan_reversal_count=int(plan_diagnostics.get("planReversalCount", 0) or 0),
                        plan_oscillation_run=int(plan_diagnostics.get("planOscillationRun", 0) or 0),
                        latency_ms=first_latency_ms,
                    ),
                )
                if not progress_reported:
                    self._turns.release(token)
                    log(f"discard superseded repair request={request_id} stateTick={tick}")
                    return
                repair_state = self._get_latest_state()
                if not _current_life_active(repair_state):
                    self._turns.release(token)
                    log(f"discard repair inactive-life request={request_id} stateTick={tick}")
                    return
                repair_prompt = build_plan_repair_prompt(
                    build_prompt(
                        repair_state,
                        outcome_context=self._action_memory.prompt_context(repair_state),
                    ),
                    plan_diagnostics,
                )
                repair_deadline_ms = token["startedAtMs"] + int(MODEL_TURN_TIMEOUT_SECONDS * 1000)
                repair_remaining_ms = repair_deadline_ms - now_ms()
                if repair_remaining_ms < 500:
                    budget_diagnostics = dict(plan_diagnostics)
                    budget_diagnostics["errorCode"] = "repair_budget_exhausted"
                    self._turns.release_failure(
                        token,
                        lambda: self._handle_invalid_plan(
                            budget_diagnostics,
                            tick=tick,
                            latency_ms=now_ms() - token["startedAtMs"],
                            heartbeat_order=self._turn_heartbeat_order(token, 3),
                        ),
                    )
                    return
                repair_started_at_ms = now_ms()
                repair_raw, _repair_session_id, repair_status = _codex_new(
                    repair_prompt,
                    codex_home=codex_home,
                    timeout_seconds=repair_remaining_ms / 1000,
                )
                repair_latency_ms = now_ms() - repair_started_at_ms
                if repair_status != "ok" or repair_raw is None:
                    self._turns.release_failure(
                        token,
                        lambda: self._handle_model_error(
                            repair_status or "repair_call_failed",
                            tick,
                            heartbeat_order=self._turn_heartbeat_order(token, 3),
                            plan_action_count=int(plan_diagnostics.get("planActionCount", 0) or 0),
                            plan_valid_action_count=int(plan_diagnostics.get("planValidActionCount", 0) or 0),
                            plan_required_action_count=int(plan_diagnostics.get("planRequiredActionCount", REQUIRED_MICRO_ACTIONS) or REQUIRED_MICRO_ACTIONS),
                            plan_duration_ms=int(plan_diagnostics.get("planDurationMs", 0) or 0),
                            plan_reversal_count=int(plan_diagnostics.get("planReversalCount", 0) or 0),
                            plan_oscillation_run=int(plan_diagnostics.get("planOscillationRun", 0) or 0),
                            latency_ms=now_ms() - token["startedAtMs"],
                            repair_latency_ms=repair_latency_ms,
                        ),
                    )
                    return
                decision, plan_diagnostics = parse_decision_with_diagnostics(
                    repair_raw,
                    require_full_plan=True,
                )
                plan_repaired = decision is not None
                if plan_repaired:
                    decision_state = repair_state

            if decision is None:
                latency_ms = now_ms() - token["startedAtMs"]
                self._turns.release_failure(
                    token,
                    lambda: self._handle_invalid_plan(
                        plan_diagnostics,
                        tick=tick,
                        latency_ms=latency_ms,
                        heartbeat_order=self._turn_heartbeat_order(token, 3),
                    ),
                )
                return

            latest_state = self._get_latest_state()
            if not _current_life_active(latest_state):
                self._turns.release(token)
                log(f"discard inactive-life request={request_id} stateTick={tick}")
                return

            if new_session_id and PROVIDER == "openai_codex":
                self._codex_session_id = new_session_id
            latency_ms = now_ms() - token["startedAtMs"]
            decision["planRepaired"] = plan_repaired
            decision["repairLatencyMs"] = repair_latency_ms
            relayed = relay_model_decision(
                decision,
                decision_state,
                request_id=request_id,
                latency_ms=latency_ms,
            )
            post_result: tuple[int, Any] = (0, None)
            def _publish() -> int:
                nonlocal post_result
                publication_state = self._get_latest_state()
                post_result = _http_post("/decision", relayed)
                if post_result[0] == 200:
                    self._action_memory.record(relayed, publication_state)
                return post_result[0]

            published, post_status = self._turns.publish(
                token,
                round_epoch=self._round_epoch,
                life_epoch=self._life_epoch,
                state_tick=int(relayed.get("stateTick", tick) or tick),
                publisher=_publish,
                failure_reporter=lambda status: self._handle_model_error(
                    f"decision_post_{status}",
                    tick,
                    heartbeat_order=self._turn_heartbeat_order(token, 3),
                ),
            )
            if post_status is not None and post_status != 200:
                return
            if not published:
                log(f"discard superseded request={request_id} stateTick={tick}")
                return

            self._last_model_error = ""
            self._account_consecutive_failures = 0
            self._ai_retry_at_ms = 0
            self.decisions_this_match += 1
            self._send_heartbeat(
                "active",
                "",
                heartbeat_order=self._turn_heartbeat_order(token, 3),
                plan_action_count=int(plan_diagnostics.get("planActionCount", 0) or 0),
                plan_valid_action_count=int(plan_diagnostics.get("planValidActionCount", 0) or 0),
                plan_required_action_count=int(plan_diagnostics.get("planRequiredActionCount", REQUIRED_MICRO_ACTIONS) or REQUIRED_MICRO_ACTIONS),
                plan_duration_ms=int(plan_diagnostics.get("planDurationMs", 0) or 0),
                plan_reversal_count=int(plan_diagnostics.get("planReversalCount", 0) or 0),
                plan_oscillation_run=int(plan_diagnostics.get("planOscillationRun", 0) or 0),
                plan_valid_until_ms=now_ms() + int(plan_diagnostics.get("planDurationMs", 0) or 0),
                latency_ms=latency_ms,
                repair_latency_ms=repair_latency_ms,
                plan_repaired=plan_repaired,
            )
            arrow = {"up": "^", "down": "v", "left": "<", "right": ">"}.get(
                str(relayed["direction"] or ""), "."
            )
            flags = "".join(("B" if relayed["placeBomb"] else "-", "D" if relayed["detonate"] else "-", relayed["skillAction"][:1].upper()))
            decision_state_tick = int(relayed.get("stateTick", tick) or tick)
            log(
                f"request={request_id:>4} stateTick={decision_state_tick:>5} latency={latency_ms:>4}ms "
                f"repair={repair_latency_ms:>4}ms "
                f"inFlight={self._turns.in_flight_count} action={arrow}/{flags} | {relayed['reason'][:60]}"
            )

        threading.Thread(
            target=_worker,
            daemon=True,
            name=f"model-p{PLAYER_ID}-r{request_id}-t{tick}",
        ).start()

    def _handle_model_error(
        self,
        status: str,
        tick: int,
        *,
        heartbeat_order: tuple[int, int, int, int] | None = None,
        **heartbeat_metrics: Any,
    ) -> None:
        status_l = status.lower()
        self._account_consecutive_failures += 1
        should_rotate = (
            _is_quota_or_auth_error(status)
            or self._account_consecutive_failures >= ACCOUNT_FAILURE_THRESHOLD
        )
        if should_rotate and self._rotate_codex_home(status):
            retry_ms = 1000
        elif _is_quota_or_auth_error(status):
            retry_ms = 30_000
        elif "timeout" in status_l:
            retry_ms = 3000
        else:
            retry_ms = 1500
        self._ai_retry_at_ms = max(self._ai_retry_at_ms, now_ms() + retry_ms)
        if status != self._last_model_error or retry_ms:
            log(f"model error tick={tick:>5} status={status} retry_in={retry_ms}ms")
        self._last_model_error = status
        self._send_heartbeat(
            "error",
            status,
            heartbeat_order=heartbeat_order,
            **heartbeat_metrics,
        )

    def _handle_invalid_plan(
        self,
        diagnostics: dict[str, Any],
        *,
        tick: int,
        latency_ms: int,
        heartbeat_order: tuple[int, int, int, int] | None = None,
    ) -> None:
        error_code = _public_error_code(str(diagnostics.get("errorCode", "plan_invalid") or "plan_invalid"))
        self._ai_retry_at_ms = max(self._ai_retry_at_ms, now_ms() + PLAN_INVALID_RETRY_MS)
        self._last_model_error = error_code
        action_count = int(diagnostics.get("planActionCount", 0) or 0)
        valid_count = int(diagnostics.get("planValidActionCount", 0) or 0)
        required_count = int(diagnostics.get("planRequiredActionCount", REQUIRED_MICRO_ACTIONS) or REQUIRED_MICRO_ACTIONS)
        reversal_count = int(diagnostics.get("planReversalCount", 0) or 0)
        oscillation_run = int(diagnostics.get("planOscillationRun", 0) or 0)
        log(
            f"plan invalid tick={tick:>5} valid={valid_count}/{required_count} "
            f"received={action_count} reversals={reversal_count} run={oscillation_run} "
            f"error={error_code} retry_in={PLAN_INVALID_RETRY_MS}ms"
        )
        self._send_heartbeat(
            "plan_invalid",
            error_code,
            heartbeat_order=heartbeat_order,
            plan_action_count=action_count,
            plan_valid_action_count=valid_count,
            plan_required_action_count=required_count,
            plan_duration_ms=int(diagnostics.get("planDurationMs", 0) or 0),
            plan_reversal_count=reversal_count,
            plan_oscillation_run=oscillation_run,
            latency_ms=latency_ms,
        )

    def _on_match_ended(self, state: dict[str, Any]) -> None:
        players = state.get("players", [])
        me = next((p for p in (players or []) if str(p.get("id")) == PLAYER_ID), None)
        survivors = [p for p in (players or []) if p.get("alive")]
        won = me is not None and bool(me.get("alive"))
        append_event({
            "type": "match_ended",
            "playerId": PLAYER_ID,
            "botId": AGENT_ID,
            "won": won,
            "decisionsCount": self.decisions_this_match,
            "survivorCount": len(survivors),
            "tick": state.get("tick", 0),
        })
        log(f"{'-' * 55}")
        log(f"{'WON' if won else 'LOST'} decisions={self.decisions_this_match} survivors={len(survivors)}")
        log(f"{'-' * 55}")


def main() -> int:
    agent = LiveAgent()
    try:
        agent.run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
