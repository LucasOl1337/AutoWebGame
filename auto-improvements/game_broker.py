"""
game_broker.py — HTTP broker for BombaPVP auto-improvements.

The browser game POSTs telemetry here; Python agents read state and
POST back decisions; the game polls for the latest bot decision.

Endpoints
---------
POST /telemetry           game  → broker   game state snapshot
GET  /state               agent → broker   latest game state
POST /decision            agent → broker   bot decision
GET  /decision/<playerId> game  → broker   latest decision for playerId
GET  /report              console → broker live dashboard report
GET  /health              anyone          liveness check
POST /event               agent → broker   notable event append
POST /lab/session         lab UI → broker  prepare AI duel session
GET  /lab/session         lab UI → broker  current lab session status
GET  /lab/models          lab UI → broker  available 9Router models
"""

import json
import hmac
import os
import subprocess
import sys
import threading
import time
import traceback
import uuid
import secrets
from collections import deque
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from memory import append_event, append_match
except ModuleNotFoundError:
    from auto_improvements.memory import append_event, append_match


BROKER_HOST = os.environ.get("BROKER_HOST", "127.0.0.1")
BROKER_PORT = int(os.environ.get("BROKER_PORT", "8766"))
REPORT_INTERVAL_SECONDS = float(os.environ.get("BROKER_REPORT_INTERVAL_SEC", "1.0"))
CORS_ORIGINS = os.environ.get("BROKER_CORS_ORIGINS", "http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173")
NINE_ROUTER_BASE_URL = os.environ.get("NINE_ROUTER_BASE_URL", "http://127.0.0.1:20128/v1").rstrip("/")
NINE_ROUTER_API_KEY = os.environ.get("NINE_ROUTER_API_KEY", "").strip()
NINE_ROUTER_DEFAULT_MODEL = os.environ.get("NINE_ROUTER_MODEL", "").strip()
BROKER_INTERNAL_SECRET = os.environ.get("BROKER_INTERNAL_SECRET", "").strip()
MAX_REQUEST_BODY_BYTES = 64 * 1024
LAB_ALLOWED_PROVIDERS = {"9router"}
LAB_ALLOWED_SLOTS = {"1", "2", "3", "4"}
LAB_MODEL_CATALOG = (
    {"id": "cx/gpt-5.6-sol", "label": "GPT-5.6 SOL"},
    {"id": "cx/gpt-5.6-terra", "label": "GPT-5.6 Terra"},
    {"id": "cx/gpt-5.6-luna", "label": "GPT-5.6 Luna"},
    {"id": "cc/claude-opus-4-8", "label": "Claude Opus 4.8"},
    {"id": "cc/claude-sonnet-5", "label": "Claude Sonnet 5"},
)
LAB_ALLOWED_MODEL_IDS = {item["id"] for item in LAB_MODEL_CATALOG}
TOOLS_DIR = Path(__file__).resolve().parent


def now_ms() -> int:
    return int(time.time() * 1000)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def log(msg: str) -> None:
    print(f"[broker] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Shared state (guarded by _lock)
# ---------------------------------------------------------------------------
_lock = threading.Lock()

_latest_telemetry: dict[str, Any] = {}
_latest_telemetry_at_ms: int = 0
_telemetry_tick: int = -1

# decisions keyed by playerId (str)
_latest_decisions: dict[str, dict[str, Any]] = {}

# rolling event log
_events: deque[dict[str, Any]] = deque(maxlen=500)

# match history (last 100 completed matches)
_match_history: deque[dict[str, Any]] = deque(maxlen=100)

# heartbeats per agent slot
_agent_heartbeats: dict[str, int] = {}
_agent_statuses: dict[str, dict[str, Any]] = {}

# for detecting match completion
_last_phase: str = ""

# lab session orchestration
_lab_session: dict[str, Any] | None = None
_lab_agent_procs: dict[str, subprocess.Popen[str]] = {}
_lab_agent_logs: dict[str, Any] = {}
_lab_lock = threading.Lock()


def _sanitize_model_name(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) > 120:
        return ""
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-/:@+")
    return text if all(ch in allowed for ch in text) else ""


def _normalize_lab_agent(raw: Any, fallback_slot: str) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    slot = str(raw.get("slot", fallback_slot) or fallback_slot).strip()
    if slot not in LAB_ALLOWED_SLOTS:
        return None
    provider = str(raw.get("provider", "9router") or "9router").strip().lower()
    if provider not in LAB_ALLOWED_PROVIDERS:
        return None
    model = _sanitize_model_name(raw.get("model", NINE_ROUTER_DEFAULT_MODEL))
    if not model or model not in LAB_ALLOWED_MODEL_IDS:
        return None
    return {
        "slot": slot,
        "provider": provider,
        "model": model or NINE_ROUTER_DEFAULT_MODEL,
        "label": str(raw.get("label", f"Agente {slot}") or f"Agente {slot}")[:40],
    }


def _stop_lab_agents() -> None:
    with _lab_lock:
        procs = list(_lab_agent_procs.items())
        logs = list(_lab_agent_logs.values())
        _lab_agent_procs.clear()
        _lab_agent_logs.clear()
    for slot, proc in procs:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        log(f"lab agent stopped slot={slot}")
    for handle in logs:
        handle.close()
    with _lock:
        _agent_heartbeats.clear()
        _agent_statuses.clear()


def _start_lab_agent(agent: dict[str, str]) -> None:
    slot = agent["slot"]
    player_id = slot
    bot_id = f"lab-p{player_id}"
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["AGENT_PLAYER_ID"] = player_id
    env["AGENT_BOT_ID"] = bot_id
    env["AGENT_PROVIDER"] = agent["provider"]
    env["AGENT_MODEL"] = agent["model"]
    env["AGENT_POLL_INTERVAL_SEC"] = "0.05"
    env["AGENT_IDLE_INTERVAL_SEC"] = "0.10"
    env["BROKER_BASE"] = f"http://{BROKER_HOST}:{BROKER_PORT}"
    if BROKER_INTERNAL_SECRET:
        env["BROKER_INTERNAL_SECRET"] = BROKER_INTERNAL_SECRET

    if agent["provider"] in {"9router", "openrouter", "openai_compatible"}:
        env["AGENT_PROVIDER"] = "9router" if agent["provider"] == "openai_compatible" else agent["provider"]
        env["OPENROUTER_BASE_URL"] = NINE_ROUTER_BASE_URL
        env["OPENROUTER_API_KEY_ENV_VAR"] = "NINE_ROUTER_API_KEY"
        if NINE_ROUTER_API_KEY:
            env["NINE_ROUTER_API_KEY"] = NINE_ROUTER_API_KEY

    logs = TOOLS_DIR / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    log_path = logs / f"lab_agent_p{player_id}.log"
    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n--- lab agent start slot={slot} provider={agent['provider']} model={agent['model']} ---\n")

    log_handle = log_path.open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, str(TOOLS_DIR / "live_agent.py")],
        cwd=str(TOOLS_DIR),
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creationflags,
        startupinfo=startupinfo,
    )
    with _lab_lock:
        old = _lab_agent_procs.pop(slot, None)
        old_log = _lab_agent_logs.pop(slot, None)
        _lab_agent_procs[slot] = proc
        _lab_agent_logs[slot] = log_handle
    if old is not None and old.poll() is None:
        old.terminate()
    if old_log is not None:
        old_log.close()
    log(f"lab agent started slot={slot} pid={proc.pid}")


def _nine_router_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if NINE_ROUTER_API_KEY:
        headers["Authorization"] = f"Bearer {NINE_ROUTER_API_KEY}"
    return headers


def _fetch_nine_router_models() -> tuple[list[dict[str, str]] | None, str | None]:
    if not NINE_ROUTER_BASE_URL:
        return None, "missing_base_url"
    url = f"{NINE_ROUTER_BASE_URL}/models"
    request = Request(url, headers=_nine_router_headers(), method="GET")
    try:
        with urlopen(request, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return None, f"http_{exc.code}:{body[:120]}"
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return None, f"network:{exc}"

    models: list[dict[str, str]] = []
    for item in data.get("data", []) if isinstance(data, dict) else []:
        if not isinstance(item, dict):
            continue
        model_id = _sanitize_model_name(item.get("id") or item.get("name"))
        if not model_id:
            continue
        models.append({"id": model_id, "label": str(item.get("name") or model_id)[:80]})
    if not models and NINE_ROUTER_DEFAULT_MODEL:
        models.append({"id": NINE_ROUTER_DEFAULT_MODEL, "label": NINE_ROUTER_DEFAULT_MODEL})
    return models, None


def _public_lab_session() -> dict[str, Any] | None:
    with _lab_lock:
        if _lab_session is None:
            return None
        session = deepcopy(_lab_session)
        running = {
            slot: (proc.poll() is None)
            for slot, proc in _lab_agent_procs.items()
        }
    session["agents"] = [
        {
            "slot": agent["slot"],
            "provider": agent["provider"],
            "model": agent["model"],
            "label": agent["label"],
            "running": bool(running.get(agent["slot"])),
        }
        for agent in session.get("agents", [])
    ]
    # never expose secrets
    session.pop("apiKey", None)
    session.pop("api_key", None)
    return session


def _expire_lab_session(session_id: str, duration_sec: int) -> None:
    global _lab_session
    time.sleep(duration_sec)
    with _lab_lock:
        current_id = str((_lab_session or {}).get("sessionId", ""))
        if current_id != session_id:
            return
        _lab_session = None
    if current_id == session_id:
        _stop_lab_agents()
        log(f"lab session expired session={session_id}")


# ---------------------------------------------------------------------------
# CORS helpers
# ---------------------------------------------------------------------------
_allowed_origins = set(o.strip() for o in CORS_ORIGINS.split(",") if o.strip())


def _cors_origin(request_origin: str) -> str:
    if request_origin in _allowed_origins:
        return request_origin
    if "*" in _allowed_origins:
        return "*"
    return list(_allowed_origins)[0] if _allowed_origins else "*"


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------
_BENIGN_ERRORS = (ConnectionAbortedError, BrokenPipeError, ConnectionResetError)


class BrokerHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:  # silence default logs
        pass

    def handle_error(self, request: Any, client_address: Any) -> None:  # type: ignore[override]
        """Suppress noisy browser-disconnect errors (ConnectionAbortedError etc.)."""
        import sys as _sys
        exc = _sys.exc_info()[1]
        if exc is None or isinstance(exc, _BENIGN_ERRORS):
            return
        super().handle_error(request, client_address)  # type: ignore[misc]

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        origin = self.headers.get("Origin", "")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", _cors_origin(origin))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any] | None:
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            return None
        if length <= 0:
            return {}
        if length > MAX_REQUEST_BODY_BYTES:
            return None
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return None
        return payload if isinstance(payload, dict) else None

    def _is_authorized(self) -> bool:
        if not BROKER_INTERNAL_SECRET:
            return self.client_address[0] in {"127.0.0.1", "::1"}
        supplied = self.headers.get("x-bomba-lab-secret", "")
        return bool(supplied) and hmac.compare_digest(supplied, BROKER_INTERNAL_SECRET)

    def _require_authorization(self) -> bool:
        if self._is_authorized():
            return True
        self._send_json(401, {"ok": False, "error": "unauthorized"})
        return False

    def _require_lab_capability(self) -> bool:
        if self.headers.get("x-bomba-lab-proxy") != "1":
            return True
        supplied = self.headers.get("x-bomba-lab-session", "")
        with _lab_lock:
            expected = str((_lab_session or {}).get("capability", ""))
        if expected and supplied and hmac.compare_digest(supplied, expected):
            return True
        self._send_json(401, {"ok": False, "error": "invalid_lab_session"})
        return False

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", _cors_origin(origin))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        try:
            if path == "/health":
                self._handle_health()
            elif not self._require_authorization():
                return
            elif path == "/state":
                self._handle_get_state()
            elif path == "/report":
                if not self._require_lab_capability():
                    return
                self._handle_get_report()
            elif path == "/tasks":
                self._handle_get_tasks()
            elif path == "/insights/latest":
                self._handle_get_latest_insight()
            elif path == "/lab/session":
                if not self._require_lab_capability():
                    return
                self._handle_get_lab_session()
            elif path == "/lab/models":
                self._handle_get_lab_models()
            elif path.startswith("/decision/"):
                if not self._require_lab_capability():
                    return
                player_id = path[len("/decision/"):]
                self._handle_get_decision(player_id)
            else:
                self._send_json(404, {"ok": False, "error": "not_found"})
        except _BENIGN_ERRORS:
            pass  # browser closed connection early — normal, not an error
        except Exception:
            traceback.print_exc()
            try:
                self._send_json(500, {"ok": False, "error": "internal"})
            except Exception:
                pass

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        body = self._read_json_body()
        if body is None:
            self._send_json(400, {"ok": False, "error": "invalid_json"})
            return
        if not self._require_authorization():
            return
        try:
            if path == "/telemetry":
                if not self._require_lab_capability():
                    return
                self._handle_post_telemetry(body)
            elif path == "/decision":
                self._handle_post_decision(body)
            elif path == "/event":
                self._handle_post_event(body)
            elif path == "/agent/heartbeat":
                self._handle_agent_heartbeat(body)
            elif path == "/lab/session":
                self._handle_post_lab_session(body)
            elif path == "/trigger/insights":
                self._handle_trigger_insights()
            elif path == "/trigger/manager":
                self._handle_trigger_manager()
            elif path == "/trigger/worker-dry":
                self._handle_trigger_worker(dry_run=True)
            elif path == "/trigger/worker-real":
                self._handle_trigger_worker(dry_run=False)
            else:
                self._send_json(404, {"ok": False, "error": "not_found"})
        except _BENIGN_ERRORS:
            pass  # browser closed connection early — normal, not an error
        except Exception:
            traceback.print_exc()
            try:
                self._send_json(500, {"ok": False, "error": "internal"})
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    def _handle_health(self) -> None:
        with _lock:
            tick = _telemetry_tick
            age_ms = now_ms() - _latest_telemetry_at_ms if _latest_telemetry_at_ms else -1
        self._send_json(200, {"ok": True, "tick": tick, "telemetryAgeMs": age_ms})

    def _handle_get_state(self) -> None:
        with _lock:
            state = deepcopy(_latest_telemetry)
            tick = _telemetry_tick
            age_ms = now_ms() - _latest_telemetry_at_ms if _latest_telemetry_at_ms else -1
        self._send_json(200, {"ok": True, "tick": tick, "telemetryAgeMs": age_ms, "state": state})

    def _handle_get_decision(self, player_id: str) -> None:
        with _lock:
            decision = deepcopy(_latest_decisions.get(player_id))
        self._send_json(200, {"ok": True, "decision": decision})

    def _handle_get_lab_session(self) -> None:
        session = _public_lab_session()
        self._send_json(200, {
            "ok": True,
            "configured": bool(NINE_ROUTER_BASE_URL),
            "session": session,
        })

    def _handle_get_lab_models(self) -> None:
        if not NINE_ROUTER_API_KEY:
            # still allow listing defaults without remote call
            self._send_json(200, {
                "ok": True,
                "source": "local-default",
                "models": list(LAB_MODEL_CATALOG),
                "warning": "missing_api_key",
            })
            return
        models, error = _fetch_nine_router_models()
        if error:
            self._send_json(200, {
                "ok": True,
                "source": "fallback",
                "models": list(LAB_MODEL_CATALOG),
                "warning": error,
            })
            return
        available_ids = {item.get("id") for item in (models or [])}
        curated = [item for item in LAB_MODEL_CATALOG if item["id"] in available_ids]
        self._send_json(200, {"ok": True, "source": "9router", "models": curated})

    def _handle_post_lab_session(self, body: dict[str, Any]) -> None:
        # Reject any secret fields from the browser.
        for forbidden in ("apiKey", "api_key", "token", "secret", "authorization", "Authorization"):
            if forbidden in body:
                self._send_json(400, {"ok": False, "error": "secrets_not_allowed_from_browser"})
                return

        raw_agents = body.get("agents")
        if not isinstance(raw_agents, list) or not raw_agents:
            raw_agents = [
                {"slot": "1", "provider": "9router", "model": body.get("modelA") or NINE_ROUTER_DEFAULT_MODEL, "label": "Agente A"},
                {"slot": "2", "provider": "9router", "model": body.get("modelB") or NINE_ROUTER_DEFAULT_MODEL, "label": "Agente B"},
            ]

        agents: list[dict[str, str]] = []
        used_slots: set[str] = set()
        for index, raw in enumerate(raw_agents[:4]):
            agent = _normalize_lab_agent(raw, str(index + 1))
            if agent is None:
                self._send_json(400, {"ok": False, "error": "invalid_agent"})
                return
            if agent["slot"] in used_slots:
                self._send_json(400, {"ok": False, "error": "duplicate_slot"})
                return
            used_slots.add(agent["slot"])
            agents.append(agent)

        if len(agents) < 1:
            self._send_json(400, {"ok": False, "error": "agents_required"})
            return

        needs_nine = any(a["provider"] in {"9router", "openrouter", "openai_compatible"} for a in agents)
        if needs_nine and not NINE_ROUTER_BASE_URL:
            self._send_json(503, {"ok": False, "error": "nine_router_base_url_missing"})
            return
        if needs_nine and not NINE_ROUTER_API_KEY:
            self._send_json(503, {
                "ok": False,
                "error": "nine_router_api_key_missing",
                "hint": "Defina NINE_ROUTER_API_KEY no processo do broker (nunca no browser).",
            })
            return

        if needs_nine:
            available_models, models_error = _fetch_nine_router_models()
            if models_error:
                self._send_json(503, {"ok": False, "error": "nine_router_models_unavailable"})
                return
            allowed_model_ids = {item["id"] for item in available_models or []}
            if any(agent["model"] not in allowed_model_ids for agent in agents):
                self._send_json(400, {"ok": False, "error": "invalid_model"})
                return
        try:
            rounds = max(1, min(20, int(body.get("rounds", 5) or 5)))
        except (TypeError, ValueError):
            rounds = 5
        try:
            duration_sec = max(30, min(600, int(body.get("durationSec", body.get("duration", 180)) or 180)))
        except (TypeError, ValueError):
            duration_sec = 180

        map_name = str(body.get("map", "classic") or "classic")[:40]
        modifier = str(body.get("modifier", "none") or "none")[:40]
        session_id = f"lab-{uuid.uuid4().hex[:10]}"
        capability = secrets.token_urlsafe(32)
        slots = [agent["slot"] for agent in agents]
        codexbot = ",".join(slots)
        bot_fill = max(1, min(3, len(slots)))
        game_url = (
            f"/game/training?autobot={bot_fill}&codexbot={codexbot}&labSession={session_id}"
            f"&labCapability={capability}&rounds={rounds}&arenaTheme={map_name}&labModifier={modifier}"
        )

        _stop_lab_agents()
        for agent in agents:
            _start_lab_agent(agent)

        global _lab_session
        with _lab_lock:
            _lab_session = {
                "sessionId": session_id,
                "capability": capability,
                "createdAtMs": now_ms(),
                "expiresAtMs": now_ms() + duration_sec * 1000,
                "rounds": rounds,
                "durationSec": duration_sec,
                "map": map_name,
                "modifier": modifier,
                "agents": agents,
                "gameUrl": game_url,
                "codexbot": codexbot,
            }

        self._send_json(200, {
            "ok": True,
            "sessionId": session_id,
            "gameUrl": game_url,
            "codexbot": codexbot,
            "agents": [
                {
                    "slot": agent["slot"],
                    "provider": agent["provider"],
                    "model": agent["model"],
                    "label": agent["label"],
                }
                for agent in agents
            ],
            "config": {
                "rounds": rounds,
                "durationSec": duration_sec,
                "map": map_name,
                "modifier": modifier,
            },
        })

        threading.Thread(
            target=_expire_lab_session,
            args=(session_id, duration_sec),
            daemon=True,
            name=f"lab-expiry-{session_id}",
        ).start()

    def _handle_get_report(self) -> None:
        with _lock:
            state = deepcopy(_latest_telemetry)
            decisions = deepcopy(_latest_decisions)
            recent_events = list(_events)[-20:]
            match_count = len(_match_history)
            age_ms = now_ms() - _latest_telemetry_at_ms if _latest_telemetry_at_ms else -1
            heartbeats = dict(_agent_heartbeats)
            agent_statuses = deepcopy(_agent_statuses)
        self._send_json(200, {
            "ok": True,
            "report": {
                "telemetryAgeMs": age_ms,
                "tick": _telemetry_tick,
                "phase": state.get("phase", "-"),
                "activePlayers": _count_active_players(state),
                "decisions": decisions,
                "recentEvents": recent_events,
                "matchCount": match_count,
                "agentHeartbeats": heartbeats,
                "agentStatuses": agent_statuses,
            },
        })

    def _handle_post_telemetry(self, body: dict[str, Any]) -> None:
        global _last_phase, _telemetry_tick, _latest_telemetry_at_ms, _latest_telemetry
        with _lock:
            prev_phase = _last_phase
            new_phase = str(body.get("phase", "") or "")
            tick = int(body.get("tick", 0) or 0)
            _latest_telemetry = body
            _latest_telemetry_at_ms = now_ms()
            _telemetry_tick = tick
            _last_phase = new_phase
            match_started = prev_phase != "match" and new_phase == "match"
            match_ended = prev_phase == "match" and new_phase == "match-result"
            if match_started or match_ended:
                _latest_decisions.clear()

        if match_ended:
            _on_match_ended(body)

        self._send_json(200, {"ok": True})

    def _handle_post_decision(self, body: dict[str, Any]) -> None:
        player_id = str(body.get("playerId", "") or "")
        if not player_id:
            self._send_json(400, {"ok": False, "error": "missing_playerId"})
            return
        with _lock:
            _latest_decisions[player_id] = {**body, "receivedAt": now_ms()}
        log(f"decision player={player_id} dir={body.get('direction')} bomb={body.get('placeBomb')} reason={str(body.get('reason',''))[:60]}")
        self._send_json(200, {"ok": True})

    def _handle_post_event(self, body: dict[str, Any]) -> None:
        event = {**body, "timestamp": now_iso(), "timestampMs": now_ms()}
        with _lock:
            _events.append(event)
        append_event(event)
        self._send_json(200, {"ok": True})

    def _handle_agent_heartbeat(self, body: dict[str, Any]) -> None:
        agent_id = str(body.get("agentId", "") or "unknown")
        status = str(body.get("status", "online") or "online")[:24]
        error = "agent_error" if body.get("error") else ""
        with _lock:
            _agent_heartbeats[agent_id] = now_ms()
            _agent_statuses[agent_id] = {
                "status": status,
                "error": error,
                "provider": str(body.get("provider", "") or "")[:40],
                "model": _sanitize_model_name(body.get("model", "")),
                "updatedAt": now_ms(),
            }
        self._send_json(200, {"ok": True})

    # ------------------------------------------------------------------
    # Dev-panel endpoints (task/insight read + async triggers)
    # ------------------------------------------------------------------

    def _handle_get_tasks(self) -> None:
        try:
            from memory import pending_tasks
        except ModuleNotFoundError:
            from auto_improvements.memory import pending_tasks
        tasks = pending_tasks()
        self._send_json(200, {"ok": True, "tasks": tasks})

    def _handle_get_latest_insight(self) -> None:
        try:
            from memory import latest_insight_text
        except ModuleNotFoundError:
            from auto_improvements.memory import latest_insight_text
        text = latest_insight_text()
        self._send_json(200, {"ok": True, "text": text or None})

    def _handle_trigger_insights(self) -> None:
        def _run() -> None:
            try:
                from insights_module import run_insights
            except ModuleNotFoundError:
                from auto_improvements.insights_module import run_insights
            try:
                run_insights(force=True)
            except Exception as exc:
                log(f"trigger/insights error: {exc}")
        threading.Thread(target=_run, daemon=True).start()
        self._send_json(200, {"ok": True, "message": "Insights analysis started in background."})

    def _handle_trigger_manager(self) -> None:
        def _run() -> None:
            try:
                from manager_agent import run_manager
            except ModuleNotFoundError:
                from auto_improvements.manager_agent import run_manager
            try:
                added = run_manager(force=True)
                log(f"trigger/manager added {added} tasks")
            except Exception as exc:
                log(f"trigger/manager error: {exc}")
        threading.Thread(target=_run, daemon=True).start()
        self._send_json(200, {"ok": True, "message": "Manager started in background."})

    def _handle_trigger_worker(self, *, dry_run: bool) -> None:
        def _run() -> None:
            try:
                from worker_agent import run_all
            except ModuleNotFoundError:
                from auto_improvements.worker_agent import run_all
            try:
                applied = run_all(dry_run=dry_run)
                log(f"trigger/worker dry={dry_run} applied={applied}")
            except Exception as exc:
                log(f"trigger/worker error: {exc}")
        threading.Thread(target=_run, daemon=True).start()
        mode = "dry-run" if dry_run else "REAL"
        self._send_json(200, {"ok": True, "message": f"Worker ({mode}) started in background. Check broker logs."})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _count_active_players(state: dict[str, Any]) -> int:
    players = state.get("players", [])
    if not isinstance(players, list):
        return 0
    return sum(1 for p in players if isinstance(p, dict) and p.get("alive") and p.get("active"))


def _on_match_ended(final_state: dict[str, Any]) -> None:
    """Called when the broker detects a match-result phase transition."""
    players = final_state.get("players", [])
    survivors = [p for p in (players or []) if isinstance(p, dict) and p.get("alive")]
    winner_id = survivors[0].get("id") if survivors else None

    match_record = {
        "timestamp": now_iso(),
        "winner": winner_id,
        "players": [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "alive": p.get("alive"),
                "maxBombs": p.get("maxBombs"),
                "flameRange": p.get("flameRange"),
                "speedLevel": p.get("speedLevel"),
            }
            for p in (players or [])
            if isinstance(p, dict)
        ],
        "tick": final_state.get("tick", 0),
    }
    with _lock:
        _match_history.append(match_record)
    append_match(match_record)
    log(f"match ended winner={winner_id} tick={match_record['tick']}")


# ---------------------------------------------------------------------------
# Server entry point
# ---------------------------------------------------------------------------

def run_server() -> None:
    server = ThreadingHTTPServer((BROKER_HOST, BROKER_PORT), BrokerHandler)
    log(f"broker listening at http://{BROKER_HOST}:{BROKER_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _stop_lab_agents()
        server.server_close()
        log("broker stopped")


if __name__ == "__main__":
    run_server()
