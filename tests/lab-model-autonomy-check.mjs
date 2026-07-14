import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = fs.readFileSync(path.join(root, "src", "Engine", "auto-improvement-bridge.ts"), "utf8");
const gameApp = fs.readFileSync(path.join(root, "src", "Engine", "game-app.ts"), "utf8");

assert.match(bridge, /TELEMETRY_THROTTLE_MS = 100/);
assert.match(bridge, /DECISION_POLL_INTERVAL_MS = 100/);
assert.match(bridge, /setInterval\(refresh, 250\)/);
assert.match(bridge, /decision\?\.latencyMs/);
assert.match(bridge, /_decisionTtlMs\(entry\.d\)/);
assert.doesNotMatch(bridge, /navigation\.blockedDirections\.includes\(entry\.d\.direction\)/);
assert.match(bridge, /_consumedDecisionActions/);
assert.match(bridge, /decision\.requestId \?\? "unversioned"/);
assert.match(bridge, /decision\.receivedAt \?\? "unreceived"/);
assert.match(bridge, /skillAction === "start" \|\| skillAction === "release"/);
assert.match(bridge, /skillAction === "start" \|\| skillAction === "hold"/);
assert.match(gameApp, /Boolean\(botDecision\?\.useSkill\)/);
assert.match(gameApp, /botDecision\?\.skillHeld \?\? this\.isSkillHeld\(id\)/);
assert.match(gameApp, /AutoImprovementBridge\.isEnabled && this\.isLiveBridgeControlled\(id\)/);
assert.match(gameApp, /liveBridgeControlled\s*\? desiredDirection/);
assert.match(gameApp, /actionAcks: \[\.\.\.this\.labActionAcks\.values\(\)\]/);
assert.match(gameApp, /requestId: actionRequestId/);
assert.match(gameApp, /botDecision\?\.skillAction === "release"/);
assert.match(gameApp, /player\.skill\.phase === "channeling" \|\| player\.skill\.phase === "releasing"/);

const python = String.raw`
import copy
import json
import os
import sys
import time
sys.path.insert(0, r"${path.join(root, "auto-improvements")}")
import live_agent
import model_manager

assert live_agent.POLL_INTERVAL == 0.05, live_agent.POLL_INTERVAL

state = {
    "tick": 400,
    "phase": "match",
    "players": [
        {"id": 1, "active": True, "alive": True, "tile": {"x": 2, "y": 1}, "activeBombs": 0, "maxBombs": 1, "flameRange": 2},
        {"id": 2, "active": True, "alive": True, "tile": {"x": 8, "y": 7}, "activeBombs": 0, "maxBombs": 1, "flameRange": 2},
    ],
    "bombs": [{"ownerId": 1, "tile": {"x": 2, "y": 1}, "fuseMs": 1600, "flameRange": 2}],
    "flames": [],
    "powerUps": [],
    "navigation": {
        "1": {
            "walkableDirections": ["down"],
            "blockedDirections": ["up", "left", "right"],
            "stalledForMs": 1900,
            "lastMovementDelta": {"x": 0, "y": 0},
            "localTiles": [
                {"x": 2, "y": 1, "kind": "bomb", "dangerEtaMs": 1600},
                {"x": 2, "y": 2, "kind": "open", "dangerEtaMs": 1600},
                {"x": 3, "y": 2, "kind": "open", "dangerEtaMs": None},
            ],
        }
    },
}

model_decision = {
    "playerId": "1",
    "botId": "lab-agent-1",
    "direction": "left",
    "placeBomb": True,
    "detonate": False,
    "skillAction": "start",
    "reason": "model owns this micro decision",
}

relayed = live_agent.relay_model_decision(
    copy.deepcopy(model_decision),
    state,
    request_id=7,
    latency_ms=240,
)
for field in ("direction", "placeBomb", "detonate", "skillAction", "reason"):
    assert relayed[field] == model_decision[field], f"model field {field} was rewritten: {relayed}"
assert relayed["source"] == "model", relayed
assert relayed["stateTick"] == 400, relayed
assert relayed["requestId"] == 7, relayed
assert relayed["latencyMs"] == 240, relayed
assert 200 <= relayed["expiresInMs"] <= 1500, relayed

captured_request = {}
class FakeRouterResponse:
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self):
        return b'{"choices":[{"message":{"content":"{}"}}]}'
def fake_urlopen(request, timeout):
    captured_request.update(json.loads(request.data.decode("utf-8")))
    return FakeRouterResponse()
model_manager.urlopen = fake_urlopen
os.environ["AUTOWEBGAME_TEST_ROUTER_KEY"] = "test-only"
_, router_status = model_manager._call_openrouter(
    "state", "system", model="cx/gpt-5.6-sol",
    api_key_env="AUTOWEBGAME_TEST_ROUTER_KEY",
    reasoning_effort="none", json_mode=True,
)
assert router_status == "ok", router_status
assert captured_request["reasoning_effort"] == "none", captured_request
assert captured_request["response_format"] == {"type": "json_object"}, captured_request

agent = live_agent.LiveAgent()
assert not hasattr(agent, "_maybe_post_survival_decision"), "local survival controller still owns gameplay"
assert not hasattr(agent, "_maybe_post_tactical_recovery"), "local recovery controller still owns gameplay"

turns = live_agent.ConcurrentTurnCoordinator(max_in_flight=3)
turn_1 = turns.reserve(tick=100, round_epoch=1, life_epoch=1)
turn_2 = turns.reserve(tick=101, round_epoch=1, life_epoch=1)
turn_3 = turns.reserve(tick=102, round_epoch=1, life_epoch=1)
assert turn_1 and turn_2 and turn_3
assert turns.reserve(tick=103, round_epoch=1, life_epoch=1) is None, "in-flight limit was ignored"
assert turns.publish(turn_2, round_epoch=1, life_epoch=1, publisher=lambda: 200) == (True, 200)
assert turns.publish(turn_1, round_epoch=1, life_epoch=1, publisher=lambda: 200) == (False, None), "older response replaced a newer model action"
turn_4 = turns.reserve(tick=103, round_epoch=1, life_epoch=1)
assert turn_4 is not None, "completed capacity was not reused"
assert turns.publish(turn_3, round_epoch=1, life_epoch=1, publisher=lambda: 200) == (True, 200)
assert turns.publish(turn_4, round_epoch=2, life_epoch=1, publisher=lambda: 200) == (False, None), "old-round response was accepted"

memory = live_agent.ActionOutcomeMemory()
memory_state = copy.deepcopy(state)
memory_state["navigation"]["1"]["stalledForMs"] = 1900
memory.record({**model_decision, "requestId": 41, "expiresInMs": 250}, memory_state)
memory._pending[41]["recordedAtMs"] -= 300
memory.observe(memory_state)
context = memory.prompt_context(memory_state)
assert context == "No evaluated actions yet.", context
memory._pending[41]["recordedAtMs"] -= 1600
memory.observe(memory_state)
context = memory.prompt_context(memory_state)
assert "request=41 UNACKNOWLEDGED" in context, context

effect_memory = live_agent.ActionOutcomeMemory()
effect_memory.record({**model_decision, "requestId": 43, "expiresInMs": 250}, memory_state)
effect_memory._pending[43]["recordedAtMs"] -= 300
effect_state = copy.deepcopy(memory_state)
effect_state["players"][0]["activeBombs"] = 1
effect_state["players"][0]["skill"] = {"phase": "channeling", "cooldownRemainingMs": 0}
effect_state["actionAcks"] = [{
    "requestId": 43, "playerId": "1", "positionChanged": True, "tileChanged": True,
    "movementDelta": {"x": 48, "y": 0}, "bombAttempted": True,
    "bombPlaced": True, "detonateAttempted": False, "detonated": False,
    "skillPressed": True, "skillHeld": True,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "channeling", "alive": True,
}]
effect_memory.observe(effect_state)
effect_context = effect_memory.prompt_context(effect_state)
assert "BOMB_PLACED" in effect_context and "SKILL_STARTED" in effect_context, effect_context

causal_memory = live_agent.ActionOutcomeMemory()
causal_memory.record({**model_decision, "requestId": 50, "expiresInMs": 1500}, memory_state)
moved_state = copy.deepcopy(memory_state)
moved_state["players"][0]["tile"] = {"x": 3, "y": 1}
causal_memory.record({**model_decision, "requestId": 51, "expiresInMs": 1500}, moved_state)
moved_state["actionAcks"] = [{
    "requestId": 50, "playerId": "1", "positionChanged": True, "tileChanged": True,
    "movementDelta": {"x": 48, "y": 0}, "bombAttempted": True,
    "bombPlaced": True, "detonateAttempted": False, "detonated": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "channeling", "alive": True,
}]
causal_memory.observe(moved_state)
causal_context = causal_memory.prompt_context(moved_state)
assert "request=50" in causal_context and "MOVE_SUCCEEDED" in causal_context, causal_context
assert "COMMAND_REPLACED" in causal_context, causal_context
assert list(causal_memory._pending) == [51], causal_memory._pending

progress_memory = live_agent.ActionOutcomeMemory()
progress_memory.record({**model_decision, "requestId": 60, "expiresInMs": 1500}, memory_state)
progress_state = copy.deepcopy(memory_state)
progress_state["navigation"]["1"]["lastMovementDelta"] = {"x": 4.5, "y": 0}
progress_memory.record({**model_decision, "requestId": 61, "expiresInMs": 1500}, progress_state)
progress_state["actionAcks"] = [{
    "requestId": 60, "playerId": "1", "positionChanged": True, "tileChanged": False,
    "movementDelta": {"x": 4.5, "y": 0}, "bombAttempted": True,
    "bombPlaced": False, "detonateAttempted": False, "detonated": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "idle", "alive": True,
}]
progress_memory.observe(progress_state)
progress_context = progress_memory.prompt_context(progress_state)
assert "request=60" in progress_context and "MOVE_IN_PROGRESS" in progress_context, progress_context

ack_memory = live_agent.ActionOutcomeMemory()
ack_decision = {**model_decision, "requestId": 70, "expiresInMs": 250}
ack_memory.record(ack_decision, memory_state)
ack_memory._pending[70]["recordedAtMs"] -= 300
ack_state = copy.deepcopy(memory_state)
ack_state["players"][0]["activeBombs"] = 1
ack_state["actionAcks"] = [{
    "requestId": 70, "playerId": "1", "positionChanged": False, "tileChanged": False,
    "movementDelta": {"x": 0, "y": 0}, "bombAttempted": True,
    "bombPlaced": False, "detonateAttempted": False, "detonated": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "idle", "alive": True,
}]
ack_memory.observe(ack_state)
ack_context = ack_memory.prompt_context(ack_state)
assert "BOMB_NO_EFFECT" in ack_context and "ack=true" in ack_context, ack_context

ack_progress_memory = live_agent.ActionOutcomeMemory()
ack_progress_memory.record({**model_decision, "requestId": 71, "expiresInMs": 250}, memory_state)
ack_progress_memory._pending[71]["recordedAtMs"] -= 300
ack_progress_state = copy.deepcopy(memory_state)
ack_progress_state["actionAcks"] = [{
    "requestId": 71, "playerId": "1", "positionChanged": True, "tileChanged": False,
    "movementDelta": {"x": 3.25, "y": 0}, "bombAttempted": False,
    "bombPlaced": False, "detonateAttempted": False, "detonated": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "idle", "alive": True,
}]
ack_progress_memory.observe(ack_progress_state)
assert "MOVE_IN_PROGRESS" in ack_progress_memory.prompt_context(ack_progress_state)

idle_release_memory = live_agent.ActionOutcomeMemory()
idle_release = {**model_decision, "requestId": 72, "skillAction": "release", "expiresInMs": 250}
idle_release_memory.record(idle_release, memory_state)
idle_release_memory._pending[72]["recordedAtMs"] -= 300
idle_release_state = copy.deepcopy(memory_state)
idle_release_state["actionAcks"] = [{
    "requestId": 72, "playerId": "1", "positionChanged": False, "tileChanged": False,
    "movementDelta": {"x": 0, "y": 0}, "bombAttempted": True,
    "bombPlaced": False, "detonateAttempted": False, "detonated": False,
    "skillPressed": False, "skillHeld": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "idle", "alive": True,
}]
idle_release_memory.observe(idle_release_state)
assert "SKILL_RELEASE_NO_EFFECT" in idle_release_memory.prompt_context(idle_release_state)

death_memory = live_agent.ActionOutcomeMemory()
death_memory.record({**model_decision, "requestId": 42, "expiresInMs": 250}, memory_state)
dead_state = copy.deepcopy(memory_state)
dead_state["players"][0]["alive"] = False
dead_state["actionAcks"] = [{
    "requestId": 42, "playerId": "1", "positionChanged": False, "tileChanged": False,
    "movementDelta": {"x": 0, "y": 0}, "bombAttempted": True,
    "bombPlaced": False, "detonateAttempted": False, "detonated": False,
    "skillPhaseBefore": "idle", "skillPhaseAfter": "idle", "alive": False,
}]
death_memory.observe(dead_state)
death_context = death_memory.prompt_context(dead_state)
assert "DIED_AFTER" in death_context and "BOMB_NO_EFFECT" in death_context, death_context

publication_order = []
ordered_turns = live_agent.ConcurrentTurnCoordinator(max_in_flight=2)
older = ordered_turns.reserve(tick=200, round_epoch=1, life_epoch=1)
newer = ordered_turns.reserve(tick=201, round_epoch=1, life_epoch=1)
def publish_older():
    ordered_turns.publish(
        older, round_epoch=1, life_epoch=1,
        publisher=lambda: (time.sleep(0.05), publication_order.append(older["requestId"]), 200)[2],
    )
def publish_newer():
    time.sleep(0.01)
    ordered_turns.publish(
        newer, round_epoch=1, life_epoch=1,
        publisher=lambda: (publication_order.append(newer["requestId"]), 200)[1],
    )
thread_a = live_agent.threading.Thread(target=publish_older)
thread_b = live_agent.threading.Thread(target=publish_newer)
thread_a.start(); thread_b.start(); thread_a.join(); thread_b.join()
assert publication_order == [older["requestId"], newer["requestId"]], publication_order

# Integration seam: three model calls may run concurrently, but only the newest
# completed snapshot can become the active command.
posted = []
def fake_model(prompt, **kwargs):
    prompt_tick = int(prompt.split('"tick":', 1)[1].split(',', 1)[0])
    time.sleep({100: 0.12, 101: 0.08, 102: 0.01}[prompt_tick])
    return ('{"direction":"right","placeBomb":false,"detonate":false,"skillAction":"none","expiresInMs":400,"reason":"tick %s"}' % prompt_tick, None, "ok")

live_agent._codex_new = fake_model
live_agent._http_post = lambda path, payload: (posted.append((path, payload)) or (200, {"ok": True}))
agent = live_agent.LiveAgent()
agent._set_latest_state(state)
for model_tick in (100, 101, 102):
    snapshot = copy.deepcopy(state)
    snapshot["tick"] = model_tick
    agent._fire_ai_call(snapshot, model_tick)
time.sleep(0.25)
decisions = [payload for path, payload in posted if path == "/decision"]
decision_ticks = [item["stateTick"] for item in decisions]
assert decision_ticks == sorted(decision_ticks), decisions
assert decision_ticks[-1] == 102, decisions
assert all(item["source"] == "model" for item in decisions), decisions
assert max(agent._action_memory._pending) == 3, agent._action_memory._pending

assert live_agent.REASONING_EFFORT == "none", live_agent.REASONING_EFFORT

print("lab-model-autonomy-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1", AGENT_PROVIDER: "9router" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
