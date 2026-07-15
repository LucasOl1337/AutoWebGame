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


live_agent = load_module("lab_blocked_replan_live_agent", AUTO_DIR / "live_agent.py")
game_broker = load_module("lab_blocked_replan_game_broker", AUTO_DIR / "game_broker.py")
report_console = load_module("lab_blocked_replan_report_console", AUTO_DIR / "report_console.py")


def state_with_blocked_acks(request_id: int, steps: int) -> dict[str, Any]:
    return {
        "tick": 120,
        "phase": "match",
        "players": [{"id": "1", "active": True, "alive": True, "tile": {"x": 1, "y": 1}}],
        "actionAcks": [
            {
                "requestId": request_id,
                "microActionIndex": index,
                "playerId": "1",
                "tileBefore": {"x": 1, "y": 1},
                "tileAfter": {"x": 1, "y": 1},
                "movementDelta": {"x": 0, "y": 0},
                "positionChanged": False,
                "tileChanged": False,
                "bombPlaced": False,
                "detonated": False,
                "skillPhaseBefore": "idle",
                "skillPhaseAfter": "idle",
                "alive": True,
            }
            for index in range(steps)
        ],
    }


class BlockedPlanReplanTest(unittest.TestCase):
    def setUp(self) -> None:
        game_broker._latest_decisions.clear()

    def tearDown(self) -> None:
        game_broker._latest_decisions.clear()

    def test_two_consecutive_blocked_steps_emit_one_replan_signal(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        decision = {
            "playerId": "1",
            "requestId": 77,
            "microActions": [
                {"direction": "right", "durationMs": 250},
                {"direction": "right", "durationMs": 250},
            ],
        }
        initial = state_with_blocked_acks(77, 0)
        memory.record(decision, initial)
        for pending in memory._pending.values():
            pending["recordedAtMs"] -= 1_000

        memory.observe(state_with_blocked_acks(77, 2))

        signal = memory.consume_replan_signal()
        self.assertEqual(signal["requestId"], 77)
        self.assertEqual(signal["consecutiveBlockedActions"], 2)
        self.assertEqual(signal["code"], "MOVE_NO_PROGRESS")
        self.assertIsNone(memory.consume_replan_signal())

    def test_success_breaks_the_blocked_streak(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        initial = state_with_blocked_acks(80, 0)
        memory.record({
            "playerId": "1",
            "requestId": 80,
            "microActions": [
                {"direction": "right", "durationMs": 250},
                {"direction": "right", "durationMs": 250},
                {"direction": "right", "durationMs": 250},
            ],
        }, initial)
        for pending in memory._pending.values():
            pending["recordedAtMs"] -= 1_000
        observed = state_with_blocked_acks(80, 3)
        observed["actionAcks"][1].update({
            "tileAfter": {"x": 2, "y": 1},
            "movementDelta": {"x": 48, "y": 0},
            "positionChanged": True,
            "tileChanged": True,
        })

        memory.observe(observed)

        self.assertIsNone(memory.consume_replan_signal())
        self.assertEqual(memory.latest_outcome()["consecutiveBlockedActions"], 1)

    def test_replaced_commands_and_skill_failures_do_not_trigger_navigation_replan(self) -> None:
        memory = live_agent.ActionOutcomeMemory()
        initial = state_with_blocked_acks(77, 0)
        memory.record({
            "playerId": "1", "requestId": 77, "direction": "right", "durationMs": 250,
        }, initial)
        memory.record({
            "playerId": "1", "requestId": 78, "direction": None, "durationMs": 250,
            "skillAction": "start",
        }, initial)
        memory._pending[77]["recordedAtMs"] -= 1_000
        replaced_ack = state_with_blocked_acks(77, 1)
        memory.observe(replaced_ack)
        self.assertEqual(memory.latest_outcome()["consecutiveBlockedActions"], 0)
        self.assertIsNone(memory.consume_replan_signal())

        memory._pending[78]["recordedAtMs"] -= 1_000
        skill_ack = state_with_blocked_acks(78, 1)
        skill_ack["actionAcks"][0].update({
            "skillPressed": False,
            "skillPhaseBefore": "idle",
            "skillPhaseAfter": "idle",
        })
        memory.observe(skill_ack)
        self.assertEqual(memory.latest_outcome()["code"], "SKILL_NO_EFFECT")
        self.assertEqual(memory.latest_outcome()["consecutiveBlockedActions"], 0)
        self.assertIsNone(memory.consume_replan_signal())

    def test_broker_revocation_is_request_scoped_and_latest_wins(self) -> None:
        game_broker._latest_decisions["1"] = {"playerId": "1", "requestId": 77}

        stale = game_broker.revoke_model_decision("1", 76)
        self.assertEqual(stale, "superseded")
        self.assertEqual(game_broker._latest_decisions["1"]["requestId"], 77)

        revoked = game_broker.revoke_model_decision("1", 77)
        self.assertEqual(revoked, "revoked")
        self.assertNotIn("1", game_broker._latest_decisions)

    def test_agent_revokes_old_plan_and_exposes_replan_reason(self) -> None:
        posts: list[tuple[str, dict[str, Any]]] = []
        original_post = live_agent._http_post
        live_agent._http_post = lambda path, body: (
            posts.append((path, body)),
            (200, {"ok": True, "revoked": True}),
        )[1]
        try:
            agent = live_agent.LiveAgent()
            stale_token = agent._turns.reserve(tick=120, round_epoch=1, life_epoch=1)
            self.assertIsNotNone(stale_token)
            agent._last_model_turn_started_at_ms = 99_000
            handled = agent._handle_blocked_plan_replan({
                "requestId": 77,
                "consecutiveBlockedActions": 2,
                "code": "MOVE_NO_PROGRESS",
                "observedAtMs": 100_000,
            })
        finally:
            live_agent._http_post = original_post

        self.assertTrue(handled)
        self.assertEqual(posts[0][0], "/decision/revoke")
        self.assertEqual(posts[0][1]["requestId"], 77)
        self.assertEqual(posts[0][1]["maxRequestId"], 77)
        self.assertEqual(agent._turns.in_flight_count, 1)
        self.assertEqual(agent._last_model_turn_started_at_ms, 0)
        self.assertEqual(agent._heartbeat_status, "replanning_blocked")
        self.assertEqual(agent._heartbeat_metrics["blocked_action_streak"], 2)
        self.assertEqual(agent._heartbeat_metrics["replan_request_id"], 77)
        self.assertIsNone(agent._turns.reserve(tick=121, round_epoch=1, life_epoch=1))

        published, status = agent._turns.publish(
            stale_token,
            round_epoch=1,
            life_epoch=1,
            state_tick=120,
            publisher=lambda: self.fail("pre-block response must not publish"),
        )
        self.assertFalse(published)
        self.assertIsNone(status)
        self.assertEqual(agent._turns.in_flight_count, 0)

        fresh_token = agent._turns.reserve(tick=121, round_epoch=1, life_epoch=1)
        self.assertIsNotNone(fresh_token)
        fresh_published, fresh_status = agent._turns.publish(
            fresh_token,
            round_epoch=1,
            life_epoch=1,
            state_tick=121,
            publisher=lambda: 200,
        )
        self.assertTrue(fresh_published)
        self.assertEqual(fresh_status, 200)

    def test_revoke_retries_reuse_context_cutoff_and_preserve_fresh_turn(self) -> None:
        posts: list[dict[str, Any]] = []
        attempts = iter([
            (500, {"ok": False}),
            json.JSONDecodeError("empty", "", 0),
            (200, {"ok": True, "revoked": True, "result": "revoked"}),
        ])
        original_post = live_agent._http_post

        def fake_post(path: str, body: dict[str, Any]):
            if path == "/agent/heartbeat":
                return 200, {"ok": True}
            self.assertEqual(path, "/decision/revoke")
            posts.append(dict(body))
            result = next(attempts)
            if isinstance(result, Exception):
                raise result
            return result

        live_agent._http_post = fake_post
        try:
            agent = live_agent.LiveAgent()
            stale_token = agent._turns.reserve(tick=120, round_epoch=1, life_epoch=1)
            self.assertIsNotNone(stale_token)
            signal = {
                "requestId": 77,
                "consecutiveBlockedActions": 2,
                "code": "MOVE_NO_PROGRESS",
                "observedAtMs": 100_000,
            }
            self.assertFalse(agent._handle_blocked_plan_replan(signal))
            stale_published, _ = agent._turns.publish(
                stale_token,
                round_epoch=1,
                life_epoch=1,
                state_tick=120,
                publisher=lambda: self.fail("stale response must not publish"),
            )
            self.assertFalse(stale_published)

            fresh_token = agent._turns.reserve(tick=121, round_epoch=1, life_epoch=1)
            self.assertIsNotNone(fresh_token)
            self.assertFalse(agent._handle_blocked_plan_replan(signal))
            self.assertTrue(agent._handle_blocked_plan_replan(signal))
            fresh_published, fresh_status = agent._turns.publish(
                fresh_token,
                round_epoch=1,
                life_epoch=1,
                state_tick=121,
                publisher=lambda: 200,
            )
        finally:
            live_agent._http_post = original_post

        self.assertTrue(fresh_published)
        self.assertEqual(fresh_status, 200)
        self.assertEqual([post["maxRequestId"] for post in posts], [77, 77, 77])

    def test_operator_sees_controller_streak_reason_and_discarded_plan(self) -> None:
        report_console.now_ms = lambda: 1_700_000_000_300
        normalized = game_broker.normalize_agent_heartbeat({
            "status": "replanning_blocked",
            "provider": "9router",
            "model": "cx/gpt-5.6-luna",
            "blockedActionStreak": 2,
            "replanRequestId": 77,
            "replanReason": "MOVE_NO_PROGRESS",
            "replanTriggeredAt": 1_700_000_000_000,
        }, updated_at_ms=1_700_000_000_100)
        status, controller = report_console._format_agent_plan_status(normalized, 0.1)

        self.assertIn("REPLANEJANDO", status)
        self.assertIn("2 bloqueios seguidos", status)
        self.assertIn("#77 descartado", status)
        self.assertIn("sem progresso", status)
        self.assertIn("há 0.3s", status)
        self.assertEqual(controller, "9router · cx/gpt-5.6-luna")

        thinking = dict(normalized, status="thinking")
        thinking_status, _ = report_console._format_agent_plan_status(thinking, 0.1)
        self.assertIn("REPLANEJANDO", thinking_status)

        active = dict(
            normalized,
            status="active",
            planActionCount=30,
            planValidActionCount=30,
            planRequiredActionCount=30,
            planDurationMs=12_000,
            planValidUntilMs=1_700_000_012_000,
        )
        active_status, _ = report_console._format_agent_plan_status(active, 0.1)
        self.assertIn("REPLANO APLICADO após #77", active_status)

        report_console.clear_screen = lambda: None
        report_console.count_matches = lambda: 0
        report_console.pending_tasks = lambda: []
        report_console.load_insights = lambda limit=1: []
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            report_console.render({
                "phase": "match",
                "tick": 120,
                "activePlayers": 2,
                "decisions": {},
                "recentEvents": [],
                "agentHeartbeats": {"live-1": 1_700_000_000_200},
                "agentStatuses": {"live-1": normalized},
            }, 1_700_000_000_200, True)
        rendered = output.getvalue()
        self.assertIn("9router · cx/gpt-5.6-luna", rendered)
        self.assertIn("REPLANEJANDO", rendered)
        self.assertIn("2 bloqueios seguidos", rendered)
        self.assertIn("sem progresso", rendered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
