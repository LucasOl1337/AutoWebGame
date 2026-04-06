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
"""

import json
import os
import threading
import time
import traceback
from collections import deque
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

try:
    from memory import append_event, append_match
except ModuleNotFoundError:
    from auto_improvements.memory import append_event, append_match


BROKER_HOST = os.environ.get("BROKER_HOST", "127.0.0.1")
BROKER_PORT = int(os.environ.get("BROKER_PORT", "8765"))
REPORT_INTERVAL_SECONDS = float(os.environ.get("BROKER_REPORT_INTERVAL_SEC", "1.0"))
CORS_ORIGINS = os.environ.get("BROKER_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")


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

# for detecting match completion
_last_phase: str = ""


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
class BrokerHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:  # silence default logs
        pass

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
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return None
        return payload if isinstance(payload, dict) else None

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
            elif path == "/state":
                self._handle_get_state()
            elif path == "/report":
                self._handle_get_report()
            elif path == "/tasks":
                self._handle_get_tasks()
            elif path == "/insights/latest":
                self._handle_get_latest_insight()
            elif path.startswith("/decision/"):
                player_id = path[len("/decision/"):]
                self._handle_get_decision(player_id)
            else:
                self._send_json(404, {"ok": False, "error": "not_found"})
        except Exception:
            traceback.print_exc()
            self._send_json(500, {"ok": False, "error": "internal"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        body = self._read_json_body()
        if body is None:
            self._send_json(400, {"ok": False, "error": "invalid_json"})
            return
        try:
            if path == "/telemetry":
                self._handle_post_telemetry(body)
            elif path == "/decision":
                self._handle_post_decision(body)
            elif path == "/event":
                self._handle_post_event(body)
            elif path == "/agent/heartbeat":
                self._handle_agent_heartbeat(body)
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
        except Exception:
            traceback.print_exc()
            self._send_json(500, {"ok": False, "error": "internal"})

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

    def _handle_get_report(self) -> None:
        with _lock:
            state = deepcopy(_latest_telemetry)
            decisions = deepcopy(_latest_decisions)
            recent_events = list(_events)[-20:]
            match_count = len(_match_history)
            age_ms = now_ms() - _latest_telemetry_at_ms if _latest_telemetry_at_ms else -1
            heartbeats = dict(_agent_heartbeats)
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
            match_ended = prev_phase == "match" and new_phase == "match-result"

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
        with _lock:
            _agent_heartbeats[agent_id] = now_ms()
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
        server.server_close()
        log("broker stopped")


if __name__ == "__main__":
    run_server()
