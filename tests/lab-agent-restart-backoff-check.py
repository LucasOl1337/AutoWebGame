"""Controlled regression check for live-agent restart supervision and operator copy."""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "auto-improvements"))

import mainbot  # noqa: E402


class FakeProcess:
    def __init__(self, *, running: bool = False, start_error: str = "") -> None:
        self.running = running
        self.starts = 0
        self.start_error = start_error
        self.env_overrides = {
            "AGENT_PROVIDER": "openai_codex",
            "AGENT_MODEL": "gpt-5.4-mini",
        }

    def is_running(self) -> bool:
        return self.running

    def start(self) -> None:
        self.starts += 1
        if self.start_error:
            raise OSError(self.start_error)

    def stop(self) -> None:
        self.running = False

    def pid(self) -> int:
        return 731 if self.running else 0

    def recent(self, count: int) -> list[str]:
        return []

    def exit_code(self) -> int | None:
        return 17 if not self.running else None


class RestartBackoffCheck(unittest.TestCase):
    def make_bot(self, agent: FakeProcess) -> mainbot.MainBot:
        bot = mainbot.MainBot(
            with_live_agents=False,
            with_insights=False,
            with_manager=False,
        )
        bot.broker = FakeProcess(running=True)
        bot.live_agents = {"1": agent}
        return bot

    def test_repeated_failure_is_backed_off_and_visible(self) -> None:
        clock_ms = 100_000
        agent = FakeProcess()
        bot = self.make_bot(agent)

        with (
            patch.object(mainbot, "now_ms", side_effect=lambda: clock_ms),
            patch.object(mainbot, "_broker_report", return_value={"phase": "match", "tick": 10}),
        ):
            for _ in range(12):
                bot.poll()

            self.assertEqual(agent.starts, 1, "12 tight polls must not create 12 processes")

            output = io.StringIO()
            with (
                patch.object(mainbot, "clear_screen"),
                contextlib.redirect_stdout(output),
            ):
                bot.render()

            rendered = output.getvalue()
            self.assertIn("P1: RESTART WAIT", rendered)
            self.assertIn("controller=openai_codex/gpt-5.4-mini", rendered)
            self.assertIn("retry=2.0s", rendered)
            self.assertIn("failures=1", rendered)
            self.assertIn("exit=17", rendered)
            self.assertIn("model response health is not inferred here", rendered)

            clock_ms += 1_999
            bot.poll()
            self.assertEqual(agent.starts, 1)

            clock_ms += 1
            bot.poll()
            self.assertEqual(agent.starts, 2)

            clock_ms += 3_999
            bot.poll()
            self.assertEqual(agent.starts, 2, "second failure must double the quiet period")

            clock_ms += 1
            bot.poll()
            self.assertEqual(agent.starts, 3)

    def test_stable_process_resets_failure_streak(self) -> None:
        clock_ms = 200_000
        agent = FakeProcess()
        bot = self.make_bot(agent)

        with (
            patch.object(mainbot, "now_ms", side_effect=lambda: clock_ms),
            patch.object(mainbot, "_broker_report", return_value={"phase": "match", "tick": 20}),
        ):
            bot.poll()
            self.assertEqual(agent.starts, 1)
            agent.running = True

            clock_ms += int(mainbot.LIVE_AGENT_RESTART_STABLE_SECONDS * 1000)
            bot.poll()

            agent.running = False
            bot.poll()
            self.assertEqual(agent.starts, 2, "a stable run should reset the failure streak")

            state = bot.live_agent_restart_state["1"]
            self.assertEqual(state.failures, 1)
            self.assertEqual(
                state.next_restart_at_ms - clock_ms,
                int(mainbot.LIVE_AGENT_RESTART_BASE_SECONDS * 1000),
            )

    def test_real_poll_cadence_is_capped_without_numeric_overflow(self) -> None:
        clock_ms = 400_000
        agent = FakeProcess()
        bot = self.make_bot(agent)

        with (
            patch.object(mainbot, "now_ms", side_effect=lambda: clock_ms),
            patch.object(mainbot, "_broker_report", return_value={"phase": "match", "tick": 40}),
        ):
            for _ in range(12):
                bot.poll()
                clock_ms += 2_000
            self.assertEqual(
                agent.starts,
                4,
                "at the default 2s cadence, attempts should occur at 0s, 2s, 6s and 14s",
            )

            state = bot.live_agent_restart_state["1"]
            state.failures = 2_000
            state.next_restart_at_ms = 0
            bot.poll()
            self.assertEqual(
                state.next_restart_at_ms - clock_ms,
                int(mainbot.LIVE_AGENT_RESTART_MAX_SECONDS * 1000),
            )

    def test_spawn_error_does_not_crash_supervisor(self) -> None:
        clock_ms = 300_000
        agent = FakeProcess(start_error="provider executable unavailable")
        bot = self.make_bot(agent)

        with (
            patch.object(mainbot, "now_ms", side_effect=lambda: clock_ms),
            patch.object(mainbot, "_broker_report", return_value={"phase": "match", "tick": 30}),
        ):
            bot.poll()
            bot.poll()
            self.assertEqual(agent.starts, 1)

            output = io.StringIO()
            with (
                patch.object(mainbot, "clear_screen"),
                contextlib.redirect_stdout(output),
            ):
                bot.render()
            self.assertIn("error=provider executable unavailable", output.getvalue())

    def test_initial_spawn_error_is_registered_for_backoff_and_ui(self) -> None:
        class FakeBotManager:
            def ensure_bot(self, bot_id: str, *, display_name: str) -> dict[str, str]:
                return {
                    "provider": "openai_codex",
                    "model": "gpt-5.4-mini",
                    "reasoningEffort": "low",
                }

            def resolve_codex_homes_for_profile(self, profile: dict[str, str]) -> list[str]:
                return []

        clock_ms = 350_000
        bot = mainbot.MainBot(
            with_live_agents=False,
            with_insights=False,
            with_manager=False,
        )
        bot.bot_manager = FakeBotManager()

        with (
            patch.object(mainbot, "now_ms", return_value=clock_ms),
            patch.object(mainbot.ManagedProcess, "start", side_effect=OSError("initial spawn unavailable")),
        ):
            bot._start_live_agent("1", player_id="1")

        self.assertIn("1", bot.live_agents)
        state = bot.live_agent_restart_state["1"]
        self.assertEqual(state.failures, 1)
        self.assertEqual(
            state.next_restart_at_ms - clock_ms,
            int(mainbot.LIVE_AGENT_RESTART_BASE_SECONDS * 1000),
        )
        self.assertEqual(state.last_error, "initial spawn unavailable")

    def test_restart_keeps_previous_log_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            log_path = Path(temp_dir) / "agent.log"
            log_path.write_text("original crash evidence\n", encoding="utf-8")
            proc = mainbot.ManagedProcess(
                "test-agent",
                [sys.executable, "-c", "print('new process output')"],
                log_path,
            )

            proc.start()
            assert proc.proc is not None
            proc.proc.wait(timeout=5)
            assert proc._reader is not None
            proc._reader.join(timeout=5)

            saved_log = log_path.read_text(encoding="utf-8")
            self.assertIn("original crash evidence", saved_log)
            self.assertIn("[supervisor] starting test-agent", saved_log)
            self.assertIn("new process output", saved_log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
