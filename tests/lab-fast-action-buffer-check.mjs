import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = fs.readFileSync(path.join(root, "src", "Engine", "auto-improvement-bridge.ts"), "utf8");
const gameApp = fs.readFileSync(path.join(root, "src", "Engine", "game-app.ts"), "utf8");
const prompt = fs.readFileSync(path.join(root, "auto-improvements", "live_agent_system_prompt.txt"), "utf8");

// Provider calls can spike past 10 seconds, so the model-authored plan must
// keep the fast simulation supplied while the next call is in flight.
assert.match(prompt, /microActions/);
assert.match(bridge, /microActions/);
assert.match(bridge, /resolveMicroAction/);
assert.match(bridge, /invalidateDecisions/);
assert.match(bridge, /_minimumDecisionStateTick/);
assert.match(bridge, /_isDecisionFromCurrentRound/);
assert.match(gameApp, /isAwaitingInitialModelPlan/);
assert.match(gameApp, /roundNumber: this\.roundNumber/);
assert.match(gameApp, /AutoImprovementBridge\.invalidateDecisions/);
assert.match(gameApp, /this\.aiBridgeTick \+ 1/);
assert.match(gameApp, /LAB_INITIAL_PLAN_TIMEOUT_MS = 25_000/);
assert.match(gameApp, /abortUnavailableLabSession/);
assert.match(gameApp, /window\.location\.assign\("\/lab"\)/);
assert.doesNotMatch(prompt, /Tactical guidance:/);
assert.ok(
  gameApp.indexOf("if (this.isAwaitingInitialModelPlan())") < gameApp.indexOf("this.roundTimeMs = Math.max(0, this.roundTimeMs - deltaMs)"),
  "match clock advances before both initial model plans are ready",
);

const { resolveMicroAction } = await import(pathToFileURL(
  path.join(root, "output", "esm", "Engine", "auto-improvement-bridge.js"),
));
const scheduled = {
  playerId: "1",
  direction: "right",
  placeBomb: false,
  detonate: false,
  requestId: 9,
  microActions: [
    { direction: "right", durationMs: 400, placeBomb: false, detonate: false, skillAction: "none" },
    { direction: "down", durationMs: 450, placeBomb: true, detonate: false, skillAction: "none" },
    { direction: "left", durationMs: 500, placeBomb: false, detonate: false, skillAction: "none" },
  ],
};
assert.equal(resolveMicroAction(scheduled, 1_000, 1_100).microActionIndex, 0);
assert.equal(resolveMicroAction(scheduled, 1_000, 1_450).microActionIndex, 1);
assert.equal(resolveMicroAction(scheduled, 1_000, 1_900).microActionIndex, 2);
assert.equal(resolveMicroAction(scheduled, 1_000, 1_900).direction, "left");

const python = String.raw`
import json
import sys
sys.path.insert(0, r"${path.join(root, "auto-improvements")}")
import live_agent

raw = json.dumps({
    "microActions": [
        {"direction": "right", "durationMs": 300, "placeBomb": False, "detonate": False, "skillAction": "none"},
        {"direction": "down", "durationMs": 450, "placeBomb": True, "detonate": False, "skillAction": "none"},
        {"direction": "left", "durationMs": 450, "placeBomb": False, "detonate": False, "skillAction": "none"},
        {"direction": "up", "durationMs": 450, "placeBomb": False, "detonate": False, "skillAction": "none"},
        {"direction": "right", "durationMs": 450, "placeBomb": False, "detonate": False, "skillAction": "none"},
    ] * 6,
    "reason": "model-authored rolling control horizon",
})
decision = live_agent.parse_decision(raw)
assert decision is not None, raw
assert live_agent.parse_decision('{"microActions":[["right",500,false,false,"none"]],"reason":"short"}', require_full_plan=True) is None
bad_types = json.dumps({
    "microActions": [["right", 450, "false", False, "none"]] * 30,
    "reason": "strings must not become bomb commands",
})
assert live_agent.parse_decision(bad_types, require_full_plan=True) is None
actions = decision["microActions"]
assert len(actions) == 30, actions
assert sum(action["durationMs"] for action in actions) >= 12000, actions
assert all(400 <= action["durationMs"] <= 500 for action in actions), actions

state = {"tick": 1, "phase": "match", "players": [{"id": 1, "alive": True, "tile": {"x": 1, "y": 1}}]}
memory = live_agent.ActionOutcomeMemory()
memory.record({**decision, "requestId": 1}, state)
memory.record({**decision, "requestId": 2}, state)
obsolete_future_steps = [
    key for key in memory._pending
    if isinstance(key, tuple) and key[0] == 1 and key[1] > 0
]
assert obsolete_future_steps == [], obsolete_future_steps
print("lab-fast-action-buffer-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1", AGENT_PROVIDER: "9router" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
