import contextlib
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
AUTO_DIR = ROOT / "auto-improvements"
sys.path.insert(0, str(AUTO_DIR))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


action_outcomes = load_module("lab_action_outcomes", AUTO_DIR / "action_outcomes.py")
live_agent = load_module("lab_outcome_live_agent", AUTO_DIR / "live_agent.py")
game_broker = load_module("lab_outcome_game_broker", AUTO_DIR / "game_broker.py")
report_console = load_module("lab_outcome_report_console", AUTO_DIR / "report_console.py")


def state_with_ack(delta_x: float, delta_y: float, *, tile_changed: bool = True) -> dict[str, Any]:
    return {
        "tick": 120,
        "phase": "match",
        "players": [{"id": "1", "active": True, "alive": True, "tile": {"x": 1, "y": 1}}],
        "actionAcks": [{
            "requestId": 77,
            "microActionIndex": 0,
            "playerId": "1",
            "direction": "right",
            "tileBefore": {"x": 1, "y": 1},
            "tileAfter": {"x": 2 if delta_x > 0 else 1, "y": 2 if delta_y > 0 else 1},
            "movementDelta": {"x": delta_x, "y": delta_y},
            "positionChanged": bool(delta_x or delta_y),
            "tileChanged": tile_changed,
            "bombPlaced": False,
            "detonated": False,
            "skillPhaseBefore": "idle",
            "skillPhaseAfter": "idle",
            "alive": True,
        }],
    }


class ActionOutcomeFeedbackTest(unittest.TestCase):
    def test_directional_classifier_rejects_false_successes(self) -> None:
        cases = [
            (48, 0, True, "MOVE_SUCCEEDED", "executed"),
            (4.5, 0, False, "MOVE_IN_PROGRESS", "executed"),
            (-48, 0, True, "MOVE_OPPOSITE", "blocked"),
            (0, 48, True, "MOVE_DIVERTED", "blocked"),
            (0, 0, False, "MOVE_NO_PROGRESS", "blocked"),
        ]
        for delta_x, delta_y, tile_changed, code, state in cases:
            with self.subTest(delta=(delta_x, delta_y)):
                result = action_outcomes.classify_directional_movement(
                    "right",
                    {"x": delta_x, "y": delta_y},
                    tile_changed=tile_changed,
                )
                self.assertEqual(result.code, code)
                self.assertEqual(result.execution_state, state)

    def test_model_memory_and_operator_share_the_same_blocked_signal(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        decision = {
            "playerId": "1",
            "requestId": 77,
            "direction": "right",
            "durationMs": 250,
            "placeBomb": False,
            "detonate": False,
            "skillAction": "none",
        }
        initial = state_with_ack(0, 0, tile_changed=False)
        initial["actionAcks"] = []
        memory.record(decision, initial)
        memory._pending[77]["recordedAtMs"] -= 300
        observed = state_with_ack(-48, 0)
        memory.observe(observed)

        prompt = memory.prompt_context(observed)
        latest = memory.latest_outcome()
        self.assertIn("MOVE_OPPOSITE", prompt)
        self.assertNotIn("MOVE_SUCCEEDED", prompt)
        self.assertEqual(latest["executionState"], "blocked")
        self.assertEqual(latest["code"], "MOVE_OPPOSITE")
        self.assertEqual(latest["requestId"], 77)
        self.assertEqual(latest["microActionIndex"], 0)
        self.assertEqual(latest["direction"], "right")
        self.assertEqual(latest["movementDelta"], {"x": -48.0, "y": 0.0})

    def test_unacknowledged_action_is_distinct_from_blocked(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        initial = state_with_ack(0, 0, tile_changed=False)
        initial["actionAcks"] = []
        memory.record({
            "playerId": "1", "requestId": 77, "direction": "right",
            "durationMs": 250, "placeBomb": False, "detonate": False, "skillAction": "none",
        }, initial)
        memory._pending[77]["recordedAtMs"] -= 5000
        memory.observe(initial)
        latest = memory.latest_outcome()
        self.assertEqual(latest["executionState"], "unconfirmed")
        self.assertEqual(latest["code"], "UNACKNOWLEDGED")

    def test_failed_skill_only_action_is_not_reported_as_waited(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        initial = state_with_ack(0, 0, tile_changed=False)
        initial["actionAcks"] = []
        memory.record({
            "playerId": "1", "requestId": 77, "direction": None,
            "durationMs": 250, "placeBomb": False, "detonate": False, "skillAction": "start",
        }, initial)
        memory._pending[77]["recordedAtMs"] -= 300
        observed = state_with_ack(0, 0, tile_changed=False)
        observed["actionAcks"][0].update({
            "direction": None,
            "skillPressed": False,
            "skillPhaseBefore": "idle",
            "skillPhaseAfter": "idle",
        })
        memory.observe(observed)
        latest = memory.latest_outcome()
        self.assertEqual(latest["executionState"], "blocked")
        self.assertEqual(latest["code"], "SKILL_NO_EFFECT")
        self.assertIn("SKILL_NO_EFFECT", memory.prompt_context(observed))

    def test_heartbeat_transport_is_structured_bounded_and_secret_safe(self) -> None:
        normalized = game_broker.normalize_agent_heartbeat({
            "status": "active",
            "provider": "9router",
            "model": "cx/gpt-5.6-luna",
            "lastActionOutcome": "blocked",
            "lastActionCode": "MOVE_OPPOSITE; provider raw secret",
            "lastActionRequestId": 999_999_999,
            "lastActionStep": 999,
            "lastActionDirection": "right<script>",
            "lastActionDeltaX": -48.25,
            "lastActionDeltaY": 0,
            "lastActionObservedAt": 1_700_000_000_000,
        }, updated_at_ms=1_700_000_000_300)

        self.assertEqual(normalized["lastActionOutcome"], "blocked")
        self.assertEqual(normalized["lastActionCode"], "UNKNOWN")
        self.assertEqual(normalized["lastActionRequestId"], 99_999_999)
        self.assertEqual(normalized["lastActionStep"], 99)
        self.assertEqual(normalized["lastActionDirection"], "")
        self.assertEqual(normalized["lastActionDeltaX"], -48.25)
        self.assertNotIn("secret", json.dumps(normalized))

    def test_agent_heartbeat_carries_the_latest_memory_outcome(self) -> None:
        posts: list[dict[str, Any]] = []
        original_post = live_agent._http_post
        live_agent._http_post = lambda path, body: (posts.append(body), (200, {"ok": True}))[1]
        try:
            agent = live_agent.LiveAgent()
            agent._remember_outcome_for_heartbeat({
                "executionState": "blocked",
                "code": "MOVE_OPPOSITE",
                "requestId": 77,
                "microActionIndex": 0,
                "direction": "right",
                "movementDelta": {"x": -48, "y": 0},
                "observedAtMs": 1_700_000_000_000,
            })
            agent._send_heartbeat("active")
        finally:
            live_agent._http_post = original_post

        self.assertEqual(len(posts), 1)
        normalized = game_broker.normalize_agent_heartbeat(posts[0], updated_at_ms=1_700_000_000_300)
        self.assertEqual(normalized["lastActionOutcome"], "blocked")
        self.assertEqual(normalized["lastActionCode"], "MOVE_OPPOSITE")
        self.assertEqual(normalized["lastActionDeltaX"], -48.0)

    def test_terminal_ui_explains_command_result_and_age(self) -> None:
        line = report_console._format_agent_action_outcome({
            "lastActionOutcome": "blocked",
            "lastActionCode": "MOVE_OPPOSITE",
            "lastActionRequestId": 77,
            "lastActionStep": 0,
            "lastActionDirection": "right",
            "lastActionDeltaX": -48,
            "lastActionDeltaY": 0,
            "lastActionObservedAt": 1_700_000_000_000,
        }, now=1_700_000_000_300)

        self.assertIn("#77.1", line)
        self.assertIn("BLOQUEADA", line)
        self.assertIn("movimento oposto", line)
        self.assertIn("comando DIREITA", line)
        self.assertIn("andou ESQUERDA 48.0px", line)
        self.assertIn("há 0.3s", line)

        bomb_line = report_console._format_agent_action_outcome({
            "lastActionOutcome": "blocked",
            "lastActionCode": "BOMB_NO_EFFECT",
            "lastActionRequestId": 78,
            "lastActionStep": 2,
            "lastActionDirection": "",
            "lastActionObservedAt": 1_700_000_000_000,
        }, now=1_700_000_000_300)
        self.assertIn("#78.3", bomb_line)
        self.assertIn("bomba não colocada", bomb_line)
        self.assertIn("comando PARADO", bomb_line)

        report_console.clear_screen = lambda: None
        report_console.count_matches = lambda: 0
        report_console.pending_tasks = lambda: []
        report_console.load_insights = lambda limit=1: []
        report_console.now_ms = lambda: 1_700_000_000_300
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            report_console.render({
                "phase": "match",
                "tick": 120,
                "activePlayers": 2,
                "decisions": {},
                "recentEvents": [],
                "agentHeartbeats": {"live-1": 1_700_000_000_200},
                "agentStatuses": {"live-1": {
                    "status": "active",
                    "provider": "9router",
                    "model": "cx/gpt-5.6-luna",
                    "lastActionOutcome": "blocked",
                    "lastActionCode": "MOVE_OPPOSITE",
                    "lastActionRequestId": 77,
                    "lastActionStep": 0,
                    "lastActionDirection": "right",
                    "lastActionDeltaX": -48,
                    "lastActionDeltaY": 0,
                    "lastActionObservedAt": 1_700_000_000_000,
                }},
            }, 1_700_000_000_200, True)
        rendered = output.getvalue()
        self.assertIn("Controle dos Bots", rendered)
        self.assertIn("9router · cx/gpt-5.6-luna", rendered)
        self.assertIn("última microação #77.1", rendered)
        self.assertIn("movimento oposto", rendered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
