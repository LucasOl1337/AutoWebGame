import contextlib
import importlib.util
import io
import json
import sys
import threading
import time
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


live_agent = load_module("lab_oscillation_live_agent", AUTO_DIR / "live_agent.py")
game_broker = load_module("lab_oscillation_game_broker", AUTO_DIR / "game_broker.py")
report_console = load_module("lab_oscillation_report_console", AUTO_DIR / "report_console.py")


def plan(directions: list[str | None]) -> str:
    actions = [[direction, 450, False, False, "none"] for direction in directions]
    return json.dumps({"microActions": actions, "reason": "CHASE: pressure target"})


def stable_directions() -> list[str | None]:
    return (["right"] * 8) + (["down"] * 7) + (["left"] * 8) + (["up"] * 7)


def match_state() -> dict[str, Any]:
    return {
        "tick": 120,
        "phase": "match",
        "roundNumber": 1,
        "players": [
            {"id": "1", "alive": True, "active": True, "tile": {"x": 1, "y": 1}},
            {"id": "2", "alive": True, "active": True, "tile": {"x": 5, "y": 1}},
        ],
        "navigation": {"1": {"walkableDirections": ["right", "down"], "localTiles": []}},
    }


class PlanOscillationGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_provider = live_agent.PROVIDER
        self.original_model = live_agent.MODEL
        self.original_new = live_agent._codex_new
        self.original_post = live_agent._http_post
        live_agent.PROVIDER = "9router"
        live_agent.MODEL = "cx/gpt-5.6-luna"

    def tearDown(self) -> None:
        live_agent.PROVIDER = self.original_provider
        live_agent.MODEL = self.original_model
        live_agent._codex_new = self.original_new
        live_agent._http_post = self.original_post

    def test_strict_parser_rejects_repeated_immediate_opposites(self) -> None:
        directions = ["left" if index % 2 == 0 else "right" for index in range(30)]
        decision, diagnostics = live_agent.parse_decision_with_diagnostics(
            plan(directions),
            require_full_plan=True,
        )

        self.assertIsNone(decision)
        self.assertEqual(diagnostics["errorCode"], "plan_oscillation_29")
        self.assertEqual(diagnostics["planValidActionCount"], 30)
        self.assertEqual(diagnostics["planReversalCount"], 29)
        self.assertEqual(diagnostics["planOscillationRun"], 30)

    def test_route_turns_and_isolated_reversal_remain_valid(self) -> None:
        directions = stable_directions()
        directions[11:15] = ["down", "up", "up", "left"]
        decision, diagnostics = live_agent.parse_decision_with_diagnostics(
            plan(directions),
            require_full_plan=True,
        )

        self.assertIsNotNone(decision)
        self.assertEqual(diagnostics["errorCode"], "")
        self.assertEqual(diagnostics["planReversalCount"], 1)
        self.assertLess(diagnostics["planOscillationRun"], 4)

    def test_four_action_alternating_run_is_rejected_even_inside_a_plan(self) -> None:
        directions = stable_directions()
        directions[9] = "right"
        directions[10:14] = ["up", "down", "up", "down"]
        decision, diagnostics = live_agent.parse_decision_with_diagnostics(
            plan(directions),
            require_full_plan=True,
        )

        self.assertIsNone(decision)
        self.assertGreaterEqual(diagnostics["planReversalCount"], 3)
        self.assertEqual(diagnostics["planOscillationRun"], 4)

    def test_controller_repairs_oscillation_once_before_publish(self) -> None:
        oscillating = ["left" if index % 2 == 0 else "right" for index in range(30)]
        responses = [plan(oscillating), plan(stable_directions())]
        prompts: list[str] = []
        decisions: list[dict[str, Any]] = []
        heartbeats: list[dict[str, Any]] = []

        def fake_model(prompt_text: str, *, codex_home: str = "", timeout_seconds: float | None = None):
            del codex_home, timeout_seconds
            prompts.append(prompt_text)
            return responses[len(prompts) - 1], None, "ok"

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/decision":
                decisions.append(body)
            elif path == "/agent/heartbeat":
                heartbeats.append(body)
            return 200, {"ok": True}

        live_agent._codex_new = fake_model
        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        agent._round_epoch = 1
        agent._life_epoch = 1
        state = match_state()
        agent._set_latest_state(state)
        agent._fire_ai_call(state, state["tick"])
        deadline = time.time() + 2
        while agent._turns.in_flight_count and time.time() < deadline:
            time.sleep(0.01)

        self.assertEqual(len(prompts), 2)
        self.assertIn("plan_oscillation_29", prompts[1])
        self.assertIn("replace the alternating opposites", prompts[1].lower())
        self.assertEqual(len(decisions), 1)
        self.assertEqual(decisions[0]["planReversalCount"], 0)
        repairing = next(item for item in heartbeats if item["status"] == "repairing_plan")
        self.assertEqual(repairing["planReversalCount"], 29)
        self.assertEqual(repairing["planOscillationRun"], 30)
        active = next(item for item in heartbeats if item["status"] == "active")
        self.assertEqual(active["planReversalCount"], 0)
        self.assertGreater(active["planValidUntilMs"], live_agent.now_ms())
        self.assertTrue(active["planRepaired"])

    def test_heartbeat_state_and_delivery_are_serialized(self) -> None:
        active_started = threading.Event()
        release_active = threading.Event()
        completions: list[str] = []
        delivered: list[str] = []

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                delivered.append(body["status"])
                if body["status"] == "active":
                    active_started.set()
                    release_active.wait(timeout=1)
                completions.append(body["status"])
            return 200, {"ok": True}

        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        active_thread = threading.Thread(target=lambda: agent._send_heartbeat("active"))
        thinking_thread = threading.Thread(target=lambda: agent._send_heartbeat("thinking"))
        active_thread.start()
        self.assertTrue(active_started.wait(timeout=1))
        thinking_thread.start()
        time.sleep(0.02)
        self.assertTrue(thinking_thread.is_alive(), "new heartbeat should wait for the prior POST")
        release_active.set()
        active_thread.join(timeout=1)
        thinking_thread.join(timeout=1)

        self.assertEqual(delivered, ["active", "thinking"])
        self.assertEqual(completions, ["active", "thinking"])
        self.assertEqual(agent._heartbeat_status, "thinking")

        delivered.clear()
        completions.clear()
        newer = live_agent.LiveAgent()
        self.assertTrue(newer._send_heartbeat(
            "thinking",
            heartbeat_order=(1, 1, 2, 1),
        ))
        self.assertFalse(newer._send_heartbeat(
            "active",
            heartbeat_order=(1, 1, 1, 3),
        ))
        self.assertEqual(delivered, ["thinking"])
        self.assertEqual(newer._heartbeat_status, "thinking")

        self.assertTrue(newer._send_heartbeat(
            "inactive",
            heartbeat_order=(1, 2, 0, 4),
            plan_valid_until_ms=0,
        ))
        self.assertFalse(newer._send_heartbeat(
            "active",
            heartbeat_order=(1, 1, 2, 3),
        ))
        self.assertEqual(delivered, ["thinking", "inactive"])
        self.assertEqual(newer._heartbeat_status, "inactive")

    def test_broker_and_dashboard_preserve_safe_human_signal(self) -> None:
        current_ms = 1_700_000_001_000
        original_now_ms = report_console.now_ms
        report_console.now_ms = lambda: current_ms
        self.addCleanup(setattr, report_console, "now_ms", original_now_ms)
        status = game_broker.normalize_agent_heartbeat({
            "status": "repairing_plan",
            "error": "plan_oscillation_29; raw provider text",
            "provider": "9router",
            "model": "cx/gpt-5.6-luna",
            "planActionCount": 30,
            "planValidActionCount": 30,
            "planRequiredActionCount": 30,
            "planReversalCount": 29,
            "planOscillationRun": 30,
        }, updated_at_ms=1_700_000_000_000)

        self.assertEqual(status["error"], "plan_oscillation_29")
        self.assertEqual(status["planReversalCount"], 29)
        self.assertEqual(status["planOscillationRun"], 30)
        self.assertNotIn("raw provider", json.dumps(status))

        unstable, _controller = report_console._format_agent_plan_status(status, 0.4)
        active, _controller = report_console._format_agent_plan_status({
            **status,
            "status": "active",
            "error": "",
            "planReversalCount": 0,
            "planOscillationRun": 1,
        }, 0.4)
        thinking, _controller = report_console._format_agent_plan_status({
            **status,
            "status": "thinking",
        }, 0.4)
        self.assertIn("PLANO INSTÁVEL", unstable)
        self.assertIn("29 reversões", unstable)
        self.assertIn("rota estável", active)
        self.assertIn("0 reversões", active)
        self.assertIn("último plano recusado", thinking)
        self.assertIn("29 reversões", thinking)
        self.assertNotIn("plano atual", thinking)

        expired, _controller = report_console._format_agent_plan_status({
            **status,
            "status": "active",
            "error": "",
            "planReversalCount": 0,
            "planOscillationRun": 1,
            "planValidUntilMs": current_ms - 500,
        }, 0.4)
        inactive, _controller = report_console._format_agent_plan_status({
            **status,
            "status": "inactive",
            "planValidUntilMs": 0,
        }, 0.4)
        self.assertIn("PLANO EXPIRADO", expired)
        self.assertNotIn("PLANO ATIVO", expired)
        self.assertIn("BOT INATIVO", inactive)
        self.assertIn("sem plano válido", inactive)


if __name__ == "__main__":
    unittest.main(verbosity=2)
