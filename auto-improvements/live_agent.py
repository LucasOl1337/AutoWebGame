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
    from model_manager import call_model, compact_line
    from memory import append_event, append_match
except ModuleNotFoundError:
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
MAX_IN_FLIGHT_MODEL_CALLS = max(1, int(os.environ.get("AGENT_MAX_IN_FLIGHT", "3")))
MODEL_TURN_MIN_INTERVAL_MS = max(50, int(os.environ.get("AGENT_TURN_INTERVAL_MS", "100")))
MODEL_DECISION_TTL_MS = max(200, int(os.environ.get("AGENT_DECISION_TTL_MS", "1200")))
MODEL_MAX_TOKENS = max(48, int(os.environ.get("AGENT_MAX_TOKENS", "96")))
MODEL_TURN_TIMEOUT_SECONDS = max(3.0, float(os.environ.get("AGENT_TURN_TIMEOUT_SEC", "20")))
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


def send_heartbeat(status: str = "online", error: str = "") -> None:
    _http_post("/agent/heartbeat", {
        "agentId": f"live-{PLAYER_ID}",
        "botId": AGENT_ID,
        "provider": PROVIDER,
        "model": MODEL,
        "status": status,
        "error": error[:240],
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

    @property
    def in_flight_count(self) -> int:
        with self._lock:
            return len(self._in_flight)

    def reset(self) -> None:
        with self._lock:
            self._in_flight.clear()
            self._latest_applied_request_id = 0

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
                "startedAtMs": now_ms(),
            }
            self._in_flight[request_id] = token
            return dict(token)

    def release(self, token: dict[str, int]) -> None:
        """Free capacity after a failed call without advancing response ordering."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            self._in_flight.pop(request_id, None)

    def publish(
        self,
        token: dict[str, int],
        *,
        round_epoch: int,
        life_epoch: int,
        publisher: Callable[[], int],
    ) -> tuple[bool, int | None]:
        """Serialize publication so an older HTTP POST cannot finish after a newer one."""
        request_id = int(token.get("requestId", 0) or 0)
        with self._lock:
            self._in_flight.pop(request_id, None)
            if int(token.get("roundEpoch", -1)) != int(round_epoch):
                return False, None
            if int(token.get("lifeEpoch", -1)) != int(life_epoch):
                return False, None
            if request_id <= self._latest_applied_request_id:
                return False, None
            status = publisher()
            if status != 200:
                return False, status
            self._latest_applied_request_id = request_id
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
        "expiresInMs": max(200, min(1500, requested_ttl)),
    })
    return relayed


class ActionOutcomeMemory:
    """Per-request observations returned to the model; never changes an action locally."""

    def __init__(self, max_outcomes: int = 8) -> None:
        self._lock = threading.RLock()
        self._pending: dict[int, dict[str, Any]] = {}
        self._outcomes: deque[dict[str, Any]] = deque(maxlen=max_outcomes)

    def reset(self) -> None:
        with self._lock:
            self._pending.clear()
            self._outcomes.clear()

    def record(self, decision: dict[str, Any], state: dict[str, Any]) -> None:
        with self._lock:
            me = _player_state(state, PLAYER_ID)
            if not me:
                return
            replaced_at_ms = now_ms()
            for pending in self._pending.values():
                if not pending["commandReplaced"]:
                    pending["commandReplaced"] = True
                    pending["replacedAtMs"] = replaced_at_ms
            direction = str(decision.get("direction") or "")
            if direction not in VALID_DIRECTIONS:
                direction = ""
            try:
                request_id = int(decision.get("requestId", 0) or 0)
            except (TypeError, ValueError):
                request_id = 0
            if request_id <= 0:
                request_id = now_ms()
            try:
                expires_in_ms = int(decision.get("expiresInMs", MODEL_DECISION_TTL_MS) or MODEL_DECISION_TTL_MS)
            except (TypeError, ValueError):
                expires_in_ms = MODEL_DECISION_TTL_MS
            self._pending[request_id] = {
                "requestId": request_id,
                "direction": direction,
                "origin": _tile_key(me.get("tile", {})),
                "placeBomb": bool(decision.get("placeBomb")),
                "detonate": bool(decision.get("detonate")),
                "skillAction": str(decision.get("skillAction", "none") or "none"),
                "recordedAtMs": now_ms(),
                "evaluateAfterMs": max(250, min(1500, expires_in_ms)),
                "commandReplaced": False,
                "replacedAtMs": 0,
            }

    def observe(self, state: dict[str, Any]) -> None:
        with self._lock:
            if not self._pending:
                return
            me = _player_state(state, PLAYER_ID)
            if not me:
                return
            observed_at_ms = now_ms()
            action_acks = {
                int(ack.get("requestId", 0) or 0): ack
                for ack in (state.get("actionAcks") or [])
                if isinstance(ack, dict) and str(ack.get("playerId")) == PLAYER_ID
            }

            for request_id, pending in list(self._pending.items()):
                age_ms = max(0, observed_at_ms - int(pending["recordedAtMs"]))
                origin = pending["origin"]
                direction = pending["direction"]
                details: list[str] = []
                ack = action_acks.get(request_id)
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
                            f"request={request_id} UNACKNOWLEDGED direction={direction or 'null'} "
                            f"origin={origin} age={age_ms}ms"
                        )
                    })
                    self._pending.pop(request_id, None)
                    continue
                if (
                    bool(ack.get("alive", True))
                    and not pending["commandReplaced"]
                    and age_ms < int(pending["evaluateAfterMs"])
                ):
                    continue
                ack_delta = ack.get("movementDelta", {}) if isinstance(ack, dict) else {}
                try:
                    ack_movement = (
                        abs(float(ack_delta.get("x", 0) or 0)) > 0.01
                        or abs(float(ack_delta.get("y", 0) or 0)) > 0.01
                    ) if isinstance(ack_delta, dict) else False
                except (TypeError, ValueError):
                    ack_movement = False

                if direction:
                    if ack and bool(ack.get("tileChanged")):
                        details.append("MOVE_SUCCEEDED")
                    elif ack and (bool(ack.get("positionChanged")) or ack_movement):
                        details.append("MOVE_IN_PROGRESS")
                    else:
                        details.append("MOVE_NO_PROGRESS")

                if pending["placeBomb"]:
                    placed = bool(ack.get("bombPlaced"))
                    details.append("BOMB_PLACED" if placed else "BOMB_NO_EFFECT")

                if pending["detonate"]:
                    detonated = bool(ack.get("detonated"))
                    details.append("DETONATED" if detonated else "DETONATE_NO_EFFECT")

                skill_action = pending["skillAction"]
                skill_phase_before = str(ack.get("skillPhaseBefore", "idle") or "idle")
                skill_phase = str(ack.get("skillPhaseAfter", "idle") or "idle")
                if skill_action == "start":
                    started = bool(ack.get("skillPressed")) and skill_phase_before == "idle" and skill_phase != "idle"
                    details.append("SKILL_STARTED" if started else "SKILL_NO_EFFECT")
                elif skill_action == "hold":
                    held = bool(ack.get("skillHeld")) and skill_phase_before in {"channeling", "releasing"}
                    details.append("SKILL_HELD" if held else "SKILL_HOLD_NO_EFFECT")
                elif skill_action == "release":
                    released = (
                        bool(ack.get("skillPressed"))
                        and skill_phase_before in {"channeling", "releasing"}
                        and skill_phase != skill_phase_before
                    )
                    details.append("SKILL_RELEASED" if released else "SKILL_RELEASE_NO_EFFECT")

                if not details:
                    details.append("WAITED")
                if not bool(ack.get("alive", True)):
                    details.append("DIED_AFTER")
                if pending["commandReplaced"]:
                    details.append("COMMAND_REPLACED")
                self._outcomes.append({
                    "summary": (
                        f"request={request_id} {'+'.join(details)} direction={direction or 'null'} "
                        f"origin={origin} delta=({ack_delta.get('x', 0)},{ack_delta.get('y', 0)}) "
                        f"ack=true age={age_ms}ms"
                    )
                })
                self._pending.pop(request_id, None)

    def prompt_context(self, state: dict[str, Any]) -> str:
        with self._lock:
            lines = [str(item["summary"]) for item in self._outcomes]
            return "\n".join(lines) if lines else "No evaluated actions yet."




def build_prompt(state: dict[str, Any], *, outcome_context: str = "") -> str:
    players = [p for p in (state.get("players") or []) if isinstance(p, dict)]
    me = next((p for p in players if str(p.get("id")) == PLAYER_ID), None)
    if me is None:
        return '{"direction":null,"placeBomb":false,"detonate":false,"skillAction":"none","expiresInMs":250,"reason":"no self state"}'

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
        f"MICRO DECISION for P{PLAYER_ID}. You alone choose every gameplay action; no local policy will correct it. "
        "React to this exact snapshot and the previous outcomes. Choose a 200-1500ms horizon in expiresInMs. "
        "Return only one JSON object with direction, placeBomb, detonate, skillAction, expiresInMs, reason. "
        f"STATE={compact}"
    )


# ---------------------------------------------------------------------------
# Decision parsing
# ---------------------------------------------------------------------------

def parse_decision(raw: str) -> dict[str, Any] | None:
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
                return None
        else:
            return None

    if not isinstance(data, dict):
        return None

    direction = data.get("direction")
    if direction is not None and str(direction).lower() not in VALID_DIRECTIONS:
        direction = None

    skill_action = str(data.get("skillAction", "") or "").lower()
    if skill_action not in VALID_SKILL_ACTIONS:
        skill_action = "start" if bool(data.get("useSkill", False)) else "none"

    return {
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": direction,
        "placeBomb": bool(data.get("placeBomb", False)),
        "detonate": bool(data.get("detonate", False)),
        "skillAction": skill_action,
        "expiresInMs": data.get("expiresInMs", MODEL_DECISION_TTL_MS),
        "reason": str(data.get("reason", ""))[:120],
    }


# ---------------------------------------------------------------------------
# Codex call helpers (session-aware, mirrors The-Last-Arrow architecture)
# ---------------------------------------------------------------------------

def _codex_new(prompt: str, *, codex_home: str = "") -> tuple[str | None, str | None, str]:
    """Start a new Codex session. Returns (text, session_id, status)."""
    if PROVIDER != "openai_codex":
        text, status = call_model(
            prompt, SYSTEM_PROMPT,
            provider=PROVIDER, model=MODEL, reasoning_effort=REASONING_EFFORT,
            codex_home=codex_home or CODEX_HOME,
            openrouter_api_key_env=OPENROUTER_API_KEY_ENV,
            openrouter_base_url=OPENROUTER_BASE_URL,
            max_tokens=MODEL_MAX_TOKENS, timeout=MODEL_TURN_TIMEOUT_SECONDS,
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
        codex_home=codex_home or CODEX_HOME, timeout=MODEL_TURN_TIMEOUT_SECONDS,
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
        self._life_epoch = 0
        self._latest_state: dict[str, Any] = {}
        self._latest_state_lock = threading.Lock()
        self._was_alive_in_match = False
        self._action_memory = ActionOutcomeMemory()
        concurrency = 1 if PROVIDER == "openai_codex" else MAX_IN_FLIGHT_MODEL_CALLS
        self._turns = ConcurrentTurnCoordinator(concurrency)
        self._last_model_turn_started_at_ms = 0

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
        send_heartbeat()
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
                    send_heartbeat()
                    heartbeat_at = current_ms

                status, body = _http_get("/state")
                if status != 200 or not isinstance(body, dict) or not body.get("ok"):
                    time.sleep(IDLE_INTERVAL)
                    continue

                tick = int(body.get("tick", -1) or -1)
                state = body.get("state") or {}
                phase = str(state.get("phase", "") or "")
                self._set_latest_state(state)
                self._action_memory.observe(state)
                me_alive = _current_life_active(state)

                if phase == "match" and self.last_phase != "match":
                    self._round_epoch += 1
                    self._life_epoch += 1 if me_alive else 0
                    self.decisions_this_match = 0
                    self._codex_session_id = None
                    self._action_memory.reset()
                    self._turns.reset()
                    self._last_model_turn_started_at_ms = 0
                    self._was_alive_in_match = me_alive
                    log("=" * 55)
                    log(f"MATCH STARTED player={PLAYER_ID}; waiting only for model decisions")
                    log("=" * 55)

                if phase == "match-result" and self.last_phase == "match":
                    self._round_epoch += 1
                    self._turns.reset()
                    self._was_alive_in_match = False
                    self._on_match_ended(state)

                self.last_phase = phase
                if phase != "match":
                    time.sleep(IDLE_INTERVAL)
                    continue

                if me_alive and not self._was_alive_in_match:
                    self._life_epoch += 1
                    self._turns.reset()
                    self._last_model_turn_started_at_ms = 0
                self._was_alive_in_match = me_alive
                if not me_alive:
                    time.sleep(POLL_INTERVAL)
                    continue

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
            return
        self._last_model_turn_started_at_ms = now_ms()
        request_id = token["requestId"]
        prompt = build_prompt(state, outcome_context=self._action_memory.prompt_context(state))
        session_id = self._codex_session_id
        codex_home = self._current_codex_home()
        send_heartbeat("thinking")

        def _worker() -> None:
            new_session_id: str | None = None
            if session_id and PROVIDER == "openai_codex":
                raw, status = _codex_resume(session_id, prompt, codex_home=codex_home)
            else:
                raw, new_session_id, status = _codex_new(prompt, codex_home=codex_home)

            if status != "ok" or raw is None:
                self._turns.release(token)
                self._handle_model_error(status, tick)
                return

            decision = parse_decision(raw)
            if decision is None:
                self._turns.release(token)
                log(f"parse failed request={request_id} tick={tick:>5} raw={raw[:80]}")
                return

            latest_state = self._get_latest_state()
            if not _current_life_active(latest_state):
                self._turns.release(token)
                log(f"discard inactive-life request={request_id} stateTick={tick}")
                return

            if new_session_id and PROVIDER == "openai_codex":
                self._codex_session_id = new_session_id
            latency_ms = now_ms() - token["startedAtMs"]
            relayed = relay_model_decision(
                decision,
                state,
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
                publisher=_publish,
            )
            if post_status is not None and post_status != 200:
                self._handle_model_error(f"decision_post_{post_status}", tick)
                return
            if not published:
                log(f"discard superseded request={request_id} stateTick={tick}")
                return

            self._last_model_error = ""
            self._account_consecutive_failures = 0
            self._ai_retry_at_ms = 0
            self.decisions_this_match += 1
            send_heartbeat("active")
            arrow = {"up": "^", "down": "v", "left": "<", "right": ">"}.get(
                str(relayed["direction"] or ""), "."
            )
            flags = "".join(("B" if relayed["placeBomb"] else "-", "D" if relayed["detonate"] else "-", relayed["skillAction"][:1].upper()))
            log(
                f"request={request_id:>4} stateTick={tick:>5} latency={latency_ms:>4}ms "
                f"inFlight={self._turns.in_flight_count} action={arrow}/{flags} | {relayed['reason'][:60]}"
            )

        threading.Thread(
            target=_worker,
            daemon=True,
            name=f"model-p{PLAYER_ID}-r{request_id}-t{tick}",
        ).start()

    def _handle_model_error(self, status: str, tick: int) -> None:
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
        send_heartbeat("error", status)

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
