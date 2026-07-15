import importlib.util
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


live_agent = load_module("lab_stale_turn_live_agent", AUTO_DIR / "live_agent.py")
game_broker = load_module("lab_stale_turn_game_broker", AUTO_DIR / "game_broker.py")
report_console = load_module("lab_stale_turn_report_console", AUTO_DIR / "report_console.py")


class StaleTurnDrainTest(unittest.TestCase):
    def test_reset_invalidates_old_response_without_opening_a_second_slot(self) -> None:
        turns = live_agent.ConcurrentTurnCoordinator(max_in_flight=1)
        stale = turns.reserve(tick=100, round_epoch=1, life_epoch=1)
        self.assertIsNotNone(stale)

        turns.reset()

        self.assertEqual(turns.in_flight_count, 1)
        self.assertEqual(turns.stale_in_flight_count, 1)
        self.assertIsNone(turns.reserve(tick=101, round_epoch=2, life_epoch=2))

        published, status = turns.publish(
            stale,
            round_epoch=2,
            life_epoch=2,
            publisher=lambda: self.fail("resposta da rodada anterior não pode publicar"),
        )
        self.assertFalse(published)
        self.assertIsNone(status)
        self.assertEqual(turns.in_flight_count, 0)
        self.assertEqual(turns.stale_in_flight_count, 0)
        self.assertIsNotNone(turns.reserve(tick=102, round_epoch=2, life_epoch=2))

    def test_heartbeat_reports_physical_and_stale_request_counts(self) -> None:
        posts: list[tuple[str, dict[str, Any]]] = []
        original_post = live_agent._http_post
        live_agent._http_post = lambda path, body: (
            posts.append((path, dict(body))),
            (200, {"ok": True}),
        )[1]
        try:
            agent = live_agent.LiveAgent()
            self.assertIsNotNone(agent._turns.reserve(tick=100, round_epoch=1, life_epoch=1))
            agent._turns.reset()
            agent._send_heartbeat("draining_stale")
        finally:
            live_agent._http_post = original_post

        heartbeat = posts[-1][1]
        self.assertEqual(heartbeat["status"], "draining_stale")
        self.assertEqual(heartbeat["modelRequestsInFlight"], 1)
        self.assertEqual(heartbeat["staleModelRequests"], 1)

    def test_operator_sees_why_no_new_model_plan_started(self) -> None:
        normalized = game_broker.normalize_agent_heartbeat({
            "status": "draining_stale",
            "provider": "9router",
            "model": "cx/gpt-5.6-luna",
            "modelRequestsInFlight": 1,
            "staleModelRequests": 1,
        }, updated_at_ms=1_700_000_000_000)

        status, controller = report_console._format_agent_plan_status(normalized, 0.2)

        self.assertIn("AGUARDANDO RESPOSTA ANTIGA", status)
        self.assertIn("1 chamada em descarte", status)
        self.assertIn("limite de concorrência protegido", status)
        self.assertEqual(controller, "9router · cx/gpt-5.6-luna")


if __name__ == "__main__":
    unittest.main(verbosity=2)
