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
BROKER_BASE             http://127.0.0.1:8765  (default)
AGENT_BOT_ID            bot-default
AGENT_PLAYER_ID         1
AGENT_PROVIDER          claude | openai_codex | openrouter | ollama
AGENT_MODEL             model name (empty = provider default)
AGENT_POLL_INTERVAL_SEC 0.25
AGENT_IDLE_INTERVAL_SEC 1.0
CODEX_HOME              path to .codex home
ANTHROPIC_API_KEY       for Claude provider
OPENROUTER_API_KEY      for OpenRouter provider
"""

import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from model_manager import call_model, compact_line
    from memory import append_event, append_match
except ModuleNotFoundError:
    from auto_improvements.model_manager import call_model, compact_line
    from auto_improvements.memory import append_event, append_match


BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8765").rstrip("/")
AGENT_ID = os.environ.get("AGENT_BOT_ID", "bot-default")
PLAYER_ID = str(os.environ.get("AGENT_PLAYER_ID", "1"))
POLL_INTERVAL = float(os.environ.get("AGENT_POLL_INTERVAL_SEC", "0.25"))
IDLE_INTERVAL = float(os.environ.get("AGENT_IDLE_INTERVAL_SEC", "1.0"))
PROVIDER = compact_line(os.environ.get("AGENT_PROVIDER", "claude"))
MODEL = compact_line(os.environ.get("AGENT_MODEL", ""))
REASONING_EFFORT = compact_line(os.environ.get("CODEX_REASONING_EFFORT", ""))
CODEX_HOME = os.environ.get("CODEX_HOME", "").strip()
OPENROUTER_API_KEY_ENV = os.environ.get("OPENROUTER_API_KEY_ENV_VAR", "OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")

TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "live_agent_system_prompt.txt").read_text(encoding="utf-8").strip()

VALID_DIRECTIONS = {"up", "down", "left", "right"}


def log(msg: str) -> None:
    print(f"[live-agent pid={player_id_label()}] {msg}", flush=True)


def player_id_label() -> str:
    return f"P{PLAYER_ID}"


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Broker HTTP helpers
# ---------------------------------------------------------------------------

def _http_get(path: str) -> tuple[int, Any]:
    try:
        with urlopen(f"{BROKER_BASE}{path}", timeout=3) as resp:
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
        headers={"Content-Type": "application/json"},
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


def send_heartbeat() -> None:
    _http_post("/agent/heartbeat", {"agentId": f"live-{PLAYER_ID}", "botId": AGENT_ID})


# ---------------------------------------------------------------------------
# Game state → compact prompt
# ---------------------------------------------------------------------------

def _fmt_player(p: dict[str, Any]) -> str:
    if not isinstance(p, dict):
        return ""
    return (
        f"P{p.get('id')} {p.get('name','')} tile=({p.get('tile',{}).get('x')},{p.get('tile',{}).get('y')}) "
        f"alive={p.get('alive')} bombs={p.get('activeBombs')}/{p.get('maxBombs')} "
        f"flame={p.get('flameRange')} speed={p.get('speedLevel')} "
        f"remote={p.get('remoteLevel',0)} shield={p.get('shieldCharges',0)}"
    )


def _fmt_bomb(b: dict[str, Any]) -> str:
    if not isinstance(b, dict):
        return ""
    tile = b.get("tile", {})
    return f"bomb owner=P{b.get('ownerId')} tile=({tile.get('x')},{tile.get('y')}) fuse={b.get('fuseMs')}ms range={b.get('flameRange')}"


def _fmt_flame(f: dict[str, Any]) -> str:
    if not isinstance(f, dict):
        return ""
    tile = f.get("tile", {})
    return f"flame tile=({tile.get('x')},{tile.get('y')}) rem={f.get('remainingMs')}ms"


def build_prompt(state: dict[str, Any]) -> str:
    players = state.get("players", [])
    bombs = state.get("bombs", [])
    flames = state.get("flames", [])
    sudden_death = state.get("suddenDeath", {})
    score = state.get("matchScore", {})

    me = next((p for p in (players or []) if str(p.get("id")) == PLAYER_ID), None)
    if me is None:
        return f"No data for player {PLAYER_ID}. Return idle: {{\"direction\":null,\"placeBomb\":false,\"detonate\":false,\"useSkill\":false,\"reason\":\"no_self_state\"}}"

    lines = [
        f"Tick: {state.get('tick', 0)} | Phase: {state.get('phase')} | Score: {json.dumps(score)}",
        f"Sudden death: {sudden_death.get('active', False)}",
        "",
        "Players:",
    ]
    for p in (players or []):
        lines.append("  " + _fmt_player(p))

    if bombs:
        lines.append("\nBombs:")
        for b in bombs[:12]:
            lines.append("  " + _fmt_bomb(b))

    if flames:
        lines.append("\nActive flames:")
        for f in flames[:20]:
            lines.append("  " + _fmt_flame(f))

    lines.append(f"\nYou are: {_fmt_player(me)}")
    lines.append(f"\nDecide the next action for P{PLAYER_ID}. Return JSON only.")
    return "\n".join(lines)


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

    return {
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": direction,
        "placeBomb": bool(data.get("placeBomb", False)),
        "detonate": bool(data.get("detonate", False)),
        "useSkill": bool(data.get("useSkill", False)),
        "reason": str(data.get("reason", ""))[:120],
    }


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

class LiveAgent:
    def __init__(self) -> None:
        self.last_tick = -1
        self.last_phase = ""
        self.match_start_tick = 0
        self.decisions_this_match = 0
        self.running = True

    def run(self) -> None:
        log(f"starting — provider={PROVIDER} model={MODEL or '(default)'} player={PLAYER_ID}")
        send_heartbeat()
        heartbeat_at = now_ms()

        while self.running:
            try:
                if now_ms() - heartbeat_at > 5000:
                    send_heartbeat()
                    heartbeat_at = now_ms()

                status, body = _http_get("/state")
                if status != 200 or not isinstance(body, dict) or not body.get("ok"):
                    time.sleep(IDLE_INTERVAL)
                    continue

                tick = int(body.get("tick", -1) or -1)
                state = body.get("state") or {}
                phase = str(state.get("phase", "") or "")

                # Detect match start
                if phase == "match" and self.last_phase != "match":
                    self.match_start_tick = tick
                    self.decisions_this_match = 0
                    log("match started")

                # Detect match end
                if phase == "match-result" and self.last_phase == "match":
                    self._on_match_ended(state)

                self.last_phase = phase

                if phase != "match":
                    time.sleep(IDLE_INTERVAL)
                    continue

                if tick == self.last_tick:
                    time.sleep(POLL_INTERVAL)
                    continue

                self.last_tick = tick
                self._process_tick(state, tick)

            except KeyboardInterrupt:
                self.running = False
            except Exception as exc:
                log(f"error in loop: {exc}")
                time.sleep(1.0)

        log("stopped")

    def _process_tick(self, state: dict[str, Any], tick: int) -> None:
        prompt = build_prompt(state)
        raw, status = call_model(
            prompt,
            SYSTEM_PROMPT,
            provider=PROVIDER,
            model=MODEL,
            reasoning_effort=REASONING_EFFORT,
            codex_home=CODEX_HOME,
            openrouter_api_key_env=OPENROUTER_API_KEY_ENV,
            openrouter_base_url=OPENROUTER_BASE_URL,
            max_tokens=120,
            timeout=8.0,
        )

        if status != "ok" or raw is None:
            log(f"model error tick={tick} status={status}")
            return

        decision = parse_decision(raw)
        if decision is None:
            log(f"parse failed tick={tick} raw={raw[:80]}")
            return

        _http_post("/decision", decision)
        self.decisions_this_match += 1
        log(f"tick={tick} dir={decision['direction']} bomb={decision['placeBomb']} reason={decision['reason'][:50]}")

    def _on_match_ended(self, state: dict[str, Any]) -> None:
        players = state.get("players", [])
        me = next((p for p in (players or []) if str(p.get("id")) == PLAYER_ID), None)
        survivors = [p for p in (players or []) if p.get("alive")]
        won = me is not None and bool(me.get("alive"))

        event = {
            "type": "match_ended",
            "playerId": PLAYER_ID,
            "botId": AGENT_ID,
            "won": won,
            "decisionsCount": self.decisions_this_match,
            "survivorCount": len(survivors),
            "tick": state.get("tick", 0),
        }
        append_event(event)
        log(f"match ended won={won} decisions={self.decisions_this_match}")


def main() -> int:
    agent = LiveAgent()
    try:
        agent.run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
