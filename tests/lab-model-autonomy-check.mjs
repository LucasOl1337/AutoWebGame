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
assert.match(bridge, /useSkill: isNewAction && d\.useSkill/);
assert.match(gameApp, /Boolean\(botDecision\?\.useSkill\)/);

const python = String.raw`
import copy
import json
import os
import sys
import time
sys.path.insert(0, r"${path.join(root, "auto-improvements")}")
import live_agent
import model_manager

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
    "useSkill": True,
    "reason": "model owns this micro decision",
}

relayed = live_agent.relay_model_decision(
    copy.deepcopy(model_decision),
    state,
    request_id=7,
    latency_ms=240,
)
for field in ("direction", "placeBomb", "detonate", "useSkill", "reason"):
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
assert turns.complete(turn_2, round_epoch=1, life_epoch=1) is True
assert turns.complete(turn_1, round_epoch=1, life_epoch=1) is False, "older response replaced a newer model action"
turn_4 = turns.reserve(tick=103, round_epoch=1, life_epoch=1)
assert turn_4 is not None, "completed capacity was not reused"
assert turns.complete(turn_3, round_epoch=1, life_epoch=1) is True
assert turns.complete(turn_4, round_epoch=2, life_epoch=1) is False, "old-round response was accepted"

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
    return ('{"direction":"right","placeBomb":false,"detonate":false,"useSkill":false,"expiresInMs":400,"reason":"tick %s"}' % prompt_tick, None, "ok")

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
assert [item["stateTick"] for item in decisions] == [102], decisions
assert decisions[0]["source"] == "model", decisions

assert live_agent.REASONING_EFFORT == "none", live_agent.REASONING_EFFORT

print("lab-model-autonomy-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1", AGENT_PROVIDER: "9router" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
