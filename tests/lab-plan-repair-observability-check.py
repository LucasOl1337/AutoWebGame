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


live_agent = load_module("lab_repair_live_agent", AUTO_DIR / "live_agent.py")
game_broker = load_module("lab_repair_game_broker", AUTO_DIR / "game_broker.py")
report_console = load_module("lab_repair_report_console", AUTO_DIR / "report_console.py")


def plan(action_count: int, *, invalid_index: int | None = None) -> str:
    actions: list[list[Any]] = []
    for index in range(action_count):
        duration = 399 if index == invalid_index else 450
        actions.append(["right", duration, False, False, "none"])
    return json.dumps({"microActions": actions, "reason": "collect speed safely"})


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


class PlanRepairObservabilityTest(unittest.TestCase):
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

    def run_controller(
        self,
        responses: list[str],
        *,
        repair_state_tick: int | None = None,
        response_delays: list[float] | None = None,
    ) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]], Any]:
        calls: list[str] = []
        decisions: list[dict[str, Any]] = []
        heartbeats: list[dict[str, Any]] = []
        agent: Any = None

        call_timeouts: list[float | None] = []

        def fake_model(prompt: str, *, codex_home: str = "", timeout_seconds: float | None = None):
            del codex_home
            calls.append(prompt)
            call_timeouts.append(timeout_seconds)
            if response_delays:
                time.sleep(response_delays[len(calls) - 1])
            if len(calls) == 1 and repair_state_tick is not None:
                refreshed_state = match_state()
                refreshed_state["tick"] = repair_state_tick
                agent._set_latest_state(refreshed_state)
            return responses[len(calls) - 1], None, "ok"

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
        agent._turns = live_agent.ConcurrentTurnCoordinator(1)
        state = match_state()
        agent._set_latest_state(state)
        agent._fire_ai_call(state, state["tick"])
        deadline = time.time() + 2
        while agent._turns.in_flight_count and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(agent._turns.in_flight_count, 0, "controller thread did not finish")
        self.call_timeouts = call_timeouts
        return calls, decisions, heartbeats, agent

    def test_repair_once_turns_29_actions_into_strict_30_action_plan(self) -> None:
        calls, decisions, heartbeats, _agent = self.run_controller(
            [plan(29), plan(30)],
            repair_state_tick=121,
            response_delays=[0.04, 0.03],
        )

        self.assertEqual(len(calls), 2)
        self.assertIn("29/30", calls[1])
        self.assertIn('"tick":121', calls[1])
        self.assertEqual(len(decisions), 1)
        self.assertEqual(len(decisions[0]["microActions"]), 30)
        self.assertEqual(decisions[0]["expiresInMs"], 13_500)
        self.assertTrue(decisions[0]["planRepaired"])
        self.assertEqual(decisions[0]["stateTick"], 121)
        self.assertGreaterEqual(decisions[0]["latencyMs"], 60)
        self.assertGreaterEqual(decisions[0]["repairLatencyMs"], 20)
        self.assertIsNotNone(self.call_timeouts[1])
        self.assertLessEqual(self.call_timeouts[1], live_agent.MODEL_TURN_TIMEOUT_SECONDS)
        repairing = next(item for item in heartbeats if item["status"] == "repairing_plan")
        self.assertEqual(repairing["planActionCount"], 29)
        active = next(item for item in heartbeats if item["status"] == "active")
        self.assertEqual(active["planActionCount"], 30)
        self.assertEqual(active["planDurationMs"], 13_500)
        self.assertTrue(active["planRepaired"])
        self.assertGreaterEqual(active["latencyMs"], 60)
        self.assertGreaterEqual(active["repairLatencyMs"], 20)

    def test_failed_repair_stops_after_two_calls_and_enters_visible_backoff(self) -> None:
        calls, decisions, heartbeats, agent = self.run_controller([plan(29), plan(30, invalid_index=7)])

        self.assertEqual(len(calls), 2)
        self.assertEqual(decisions, [])
        invalid = next(item for item in heartbeats if item["status"] == "plan_invalid")
        self.assertEqual(invalid["planActionCount"], 30)
        self.assertEqual(invalid["planValidActionCount"], 29)
        self.assertEqual(invalid["error"], "action_8_invalid")
        self.assertGreater(agent._ai_retry_at_ms, live_agent.now_ms())

    def test_repair_respects_one_shared_model_turn_deadline(self) -> None:
        original_timeout = live_agent.MODEL_TURN_TIMEOUT_SECONDS
        live_agent.MODEL_TURN_TIMEOUT_SECONDS = 0.1
        try:
            calls, decisions, heartbeats, _agent = self.run_controller([plan(29), plan(30)])
        finally:
            live_agent.MODEL_TURN_TIMEOUT_SECONDS = original_timeout

        self.assertEqual(len(calls), 1)
        self.assertEqual(decisions, [])
        invalid = next(item for item in heartbeats if item["status"] == "plan_invalid")
        self.assertEqual(invalid["error"], "repair_budget_exhausted")

    def test_periodic_heartbeat_preserves_last_semantic_plan_status(self) -> None:
        heartbeats: list[dict[str, Any]] = []

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                heartbeats.append(body)
            return 200, {"ok": True}

        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        agent._send_heartbeat(
            "active",
            "",
            plan_action_count=30,
            plan_valid_action_count=30,
            plan_required_action_count=30,
            plan_duration_ms=13_500,
            latency_ms=800,
            repair_latency_ms=500,
            plan_repaired=True,
        )
        agent._send_heartbeat()

        self.assertEqual(heartbeats[-1]["status"], "active")
        self.assertEqual(heartbeats[-1]["planActionCount"], 30)
        self.assertEqual(heartbeats[-1]["planDurationMs"], 13_500)
        self.assertEqual(heartbeats[-1]["latencyMs"], 800)
        self.assertEqual(heartbeats[-1]["repairLatencyMs"], 500)
        self.assertTrue(heartbeats[-1]["planRepaired"])

    def test_newer_request_cannot_publish_an_older_state_tick(self) -> None:
        coordinator = live_agent.ConcurrentTurnCoordinator(2)
        repaired = coordinator.reserve(tick=120, round_epoch=1, life_epoch=1)
        later_request = coordinator.reserve(tick=121, round_epoch=1, life_epoch=1)
        assert repaired and later_request

        first = coordinator.publish(
            repaired,
            round_epoch=1,
            life_epoch=1,
            state_tick=500,
            publisher=lambda: 200,
        )
        second = coordinator.publish(
            later_request,
            round_epoch=1,
            life_epoch=1,
            state_tick=121,
            publisher=lambda: 200,
        )

        self.assertEqual(first, (True, 200))
        self.assertEqual(second, (False, None))

        reverse = live_agent.ConcurrentTurnCoordinator(2)
        repairing_request = reverse.reserve(tick=120, round_epoch=1, life_epoch=1)
        newer_request = reverse.reserve(tick=121, round_epoch=1, life_epoch=1)
        assert repairing_request and newer_request
        older_first = reverse.publish(
            newer_request,
            round_epoch=1,
            life_epoch=1,
            state_tick=121,
            publisher=lambda: 200,
        )
        fresher_repair_second = reverse.publish(
            repairing_request,
            round_epoch=1,
            life_epoch=1,
            state_tick=500,
            publisher=lambda: 200,
        )

        self.assertEqual(older_first, (True, 200))
        self.assertEqual(fresher_repair_second, (True, 200))

    def test_failed_old_repair_cannot_override_new_active_plan(self) -> None:
        repair_started = threading.Event()
        finish_repair = threading.Event()
        initial_call_lock = threading.Lock()
        initial_call_count = 0
        heartbeats: list[dict[str, Any]] = []
        decisions: list[dict[str, Any]] = []

        def fake_model(prompt: str, *, codex_home: str = "", timeout_seconds: float | None = None):
            del codex_home, timeout_seconds
            nonlocal initial_call_count
            if prompt.startswith("PLAN REPAIR REQUIRED"):
                repair_started.set()
                finish_repair.wait(timeout=2)
                return plan(30, invalid_index=7), None, "ok"
            with initial_call_lock:
                initial_call_count += 1
                call_number = initial_call_count
            return (plan(29) if call_number == 1 else plan(30)), None, "ok"

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                heartbeats.append(body)
            elif path == "/decision":
                decisions.append(body)
            return 200, {"ok": True}

        live_agent._codex_new = fake_model
        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        agent._round_epoch = 1
        agent._life_epoch = 1
        agent._turns = live_agent.ConcurrentTurnCoordinator(2)
        first_state = match_state()
        agent._set_latest_state(first_state)
        agent._fire_ai_call(first_state, 120)
        self.assertTrue(repair_started.wait(timeout=1))

        second_state = match_state()
        second_state["tick"] = 121
        agent._set_latest_state(second_state)
        agent._fire_ai_call(second_state, 121)
        deadline = time.time() + 1
        while not decisions and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(len(decisions), 1)
        self.assertEqual(decisions[0]["requestId"], 2)

        finish_repair.set()
        deadline = time.time() + 1
        while agent._turns.in_flight_count and time.time() < deadline:
            time.sleep(0.01)

        self.assertEqual(agent._turns.in_flight_count, 0)
        self.assertEqual(heartbeats[-1]["status"], "active")
        self.assertEqual(agent._ai_retry_at_ms, 0)
        active_index = max(index for index, item in enumerate(heartbeats) if item["status"] == "active")
        self.assertNotIn("plan_invalid", [item["status"] for item in heartbeats[active_index + 1:]])

    def test_old_incomplete_response_cannot_enter_repair_after_new_active_plan(self) -> None:
        old_call_started = threading.Event()
        finish_old_call = threading.Event()
        initial_call_lock = threading.Lock()
        initial_call_count = 0
        repair_call_count = 0
        heartbeats: list[dict[str, Any]] = []
        decisions: list[dict[str, Any]] = []

        def fake_model(prompt: str, *, codex_home: str = "", timeout_seconds: float | None = None):
            del codex_home, timeout_seconds
            nonlocal initial_call_count, repair_call_count
            if prompt.startswith("PLAN REPAIR REQUIRED"):
                repair_call_count += 1
                return plan(30), None, "ok"
            with initial_call_lock:
                initial_call_count += 1
                call_number = initial_call_count
            if call_number == 1:
                old_call_started.set()
                finish_old_call.wait(timeout=2)
                return plan(29), None, "ok"
            return plan(30), None, "ok"

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                heartbeats.append(body)
            elif path == "/decision":
                decisions.append(body)
            return 200, {"ok": True}

        live_agent._codex_new = fake_model
        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        agent._round_epoch = 1
        agent._life_epoch = 1
        agent._turns = live_agent.ConcurrentTurnCoordinator(2)
        first_state = match_state()
        agent._set_latest_state(first_state)
        agent._fire_ai_call(first_state, 120)
        self.assertTrue(old_call_started.wait(timeout=1))

        second_state = match_state()
        second_state["tick"] = 121
        agent._set_latest_state(second_state)
        agent._fire_ai_call(second_state, 121)
        deadline = time.time() + 1
        while not decisions and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(len(decisions), 1)
        self.assertEqual(heartbeats[-1]["status"], "active")

        finish_old_call.set()
        deadline = time.time() + 1
        while agent._turns.in_flight_count and time.time() < deadline:
            time.sleep(0.01)

        self.assertEqual(agent._turns.in_flight_count, 0)
        self.assertEqual(repair_call_count, 0)
        self.assertEqual(heartbeats[-1]["status"], "active")
        active_index = max(index for index, item in enumerate(heartbeats) if item["status"] == "active")
        self.assertNotIn("repairing_plan", [item["status"] for item in heartbeats[active_index + 1:]])

    def test_reset_and_newer_failure_invalidate_old_failure_reports(self) -> None:
        after_reset = live_agent.ConcurrentTurnCoordinator(1)
        old_token = after_reset.reserve(tick=120, round_epoch=1, life_epoch=1)
        assert old_token
        after_reset.reset()
        reset_events: list[str] = []
        reported_after_reset = after_reset.release_failure(
            old_token,
            lambda: reset_events.append("old-round"),
        )
        self.assertFalse(reported_after_reset)
        self.assertEqual(reset_events, [])

        ordered = live_agent.ConcurrentTurnCoordinator(2)
        older = ordered.reserve(tick=120, round_epoch=1, life_epoch=1)
        newer = ordered.reserve(tick=121, round_epoch=1, life_epoch=1)
        assert older and newer
        failure_events: list[str] = []
        newer_reported = ordered.release_failure(newer, lambda: failure_events.append("new-failure"))
        older_reported = ordered.release_failure(older, lambda: failure_events.append("old-failure"))
        self.assertTrue(newer_reported)
        self.assertFalse(older_reported)
        self.assertEqual(failure_events, ["new-failure"])

    def test_old_decision_post_failure_cannot_override_new_active_plan(self) -> None:
        first_post_started = threading.Event()
        finish_first_post = threading.Event()
        heartbeats: list[dict[str, Any]] = []
        decision_posts: list[int] = []

        def fake_model(prompt: str, *, codex_home: str = "", timeout_seconds: float | None = None):
            del prompt, codex_home, timeout_seconds
            return plan(30), None, "ok"

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                heartbeats.append(body)
                return 200, {"ok": True}
            if path == "/decision":
                request_id = int(body["requestId"])
                decision_posts.append(request_id)
                if request_id == 1:
                    first_post_started.set()
                    finish_first_post.wait(timeout=2)
                    return 500, {"ok": False}
                return 200, {"ok": True}
            return 200, {"ok": True}

        live_agent._codex_new = fake_model
        live_agent._http_post = fake_post
        agent = live_agent.LiveAgent()
        agent._round_epoch = 1
        agent._life_epoch = 1
        agent._turns = live_agent.ConcurrentTurnCoordinator(2)
        first_state = match_state()
        agent._set_latest_state(first_state)
        agent._fire_ai_call(first_state, 120)
        self.assertTrue(first_post_started.wait(timeout=1))

        second_state = match_state()
        second_state["tick"] = 121
        agent._set_latest_state(second_state)
        agent._fire_ai_call(second_state, 121)
        finish_first_post.set()
        deadline = time.time() + 1
        while agent._turns.in_flight_count and time.time() < deadline:
            time.sleep(0.01)

        self.assertEqual(agent._turns.in_flight_count, 0)
        self.assertEqual(decision_posts, [1, 2])
        self.assertEqual(heartbeats[-1]["status"], "active")
        self.assertEqual(agent._ai_retry_at_ms, 0)
        active_index = max(index for index, item in enumerate(heartbeats) if item["status"] == "active")
        self.assertNotIn("error", [item["status"] for item in heartbeats[active_index + 1:]])

    def test_broker_keeps_only_safe_structured_plan_status(self) -> None:
        status = game_broker.normalize_agent_heartbeat({
            "status": "plan_invalid",
            "error": "action_8_invalid; raw provider text must not pass",
            "provider": "9router",
            "model": "cx/gpt-5.6-luna",
            "planActionCount": 30,
            "planValidActionCount": 29,
            "planRequiredActionCount": 30,
            "planDurationMs": 13_050,
            "latencyMs": 812,
            "repairLatencyMs": 420,
            "planRepaired": True,
        }, updated_at_ms=1_700_000_000_000)

        self.assertEqual(status["error"], "action_8_invalid")
        self.assertNotIn("raw provider", json.dumps(status))
        self.assertEqual(status["planValidActionCount"], 29)
        self.assertEqual(status["latencyMs"], 812)
        self.assertEqual(status["repairLatencyMs"], 420)

    def test_dashboard_distinguishes_repair_invalid_and_active_plan(self) -> None:
        now = 1_700_000_001_000
        report_console.now_ms = lambda: now
        report_console.clear_screen = lambda: None
        report_console.count_matches = lambda: 0
        report_console.pending_tasks = lambda: []
        report_console.load_insights = lambda limit=1: []
        report = {
            "phase": "match",
            "tick": 120,
            "activePlayers": 2,
            "decisions": {},
            "recentEvents": [],
            "agentHeartbeats": {"live-1": now - 300, "live-2": now - 400, "live-3": now - 500, "live-4": now - 600, "live-5": now - 700},
            "agentStatuses": {
                "live-1": {"status": "repairing_plan", "provider": "9router", "model": "cx/gpt-5.6-luna", "planActionCount": 29, "planValidActionCount": 29, "planRequiredActionCount": 30, "latencyMs": 700},
                "live-2": {"status": "plan_invalid", "error": "action_8_invalid", "provider": "9router", "model": "cc/claude-sonnet-5", "planActionCount": 30, "planValidActionCount": 29, "planRequiredActionCount": 30, "latencyMs": 900},
                "live-3": {"status": "active", "provider": "9router", "model": "cx/gpt-5.6-luna", "planActionCount": 30, "planValidActionCount": 30, "planRequiredActionCount": 30, "planDurationMs": 13_500, "latencyMs": 1_100, "repairLatencyMs": 600, "planRepaired": True},
                "live-4": {"status": "thinking", "error": "action_count_29", "provider": "9router", "model": "cx/gpt-5.6-terra", "planActionCount": 29, "planValidActionCount": 29, "planRequiredActionCount": 30},
                "live-5": {"status": "thinking", "provider": "9router", "model": "cx/gpt-5.6-luna", "planActionCount": 30, "planValidActionCount": 30, "planRequiredActionCount": 30, "planDurationMs": 13_500, "latencyMs": 1_100, "repairLatencyMs": 600, "planRepaired": True},
            },
        }
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            report_console.render(report, now - 100, True)
        text = output.getvalue()

        self.assertIn("REPARANDO PLANO 29/30", text)
        self.assertIn("PLANO INVÁLIDO 29/30", text)
        self.assertIn("ação 8 inválida", text)
        self.assertIn("PLANO ATIVO 30/30", text)
        self.assertIn("13.5s", text)
        self.assertIn("1100ms", text)
        self.assertIn("reparado", text)
        self.assertIn("reparado em 600ms", text)
        self.assertIn("última resposta 29/30 (29 ações recebidas)", text)
        self.assertIn("plano atual 30/30 · 13.5s · 1100ms · reparado em 600ms", text)
        self.assertIn("9router · cx/gpt-5.6-luna", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
