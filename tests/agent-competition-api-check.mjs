import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAgentActionCatalog,
  createAgentObservation,
  createAgentSession,
  createAgentSessionToken,
  hashAgentSessionToken,
  normalizeAgentAction,
  normalizeAgentCompetitionId,
  normalizeAgentProfile,
  normalizeAgentReport,
  timingSafeAgentSecretEqual,
} from "../worker/agent-api.js";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

assert.equal(normalizeAgentCompetitionId("  Copa Agents 2026! "), "copa-agents-2026");
assert.deepEqual(normalizeAgentProfile({ displayName: "Codex", model: "gpt", provider: "openai" }), {
  ok: true,
  profile: { displayName: "Codex", model: "gpt", provider: "openai" },
});
assert.equal(normalizeAgentProfile({ displayName: "" }).ok, false);

const action = normalizeAgentAction({
  turn: 7,
  direction: "left",
  bombPressed: true,
  skillHeld: true,
});
assert.equal(action.ok, true);
assert.equal(action.action.turn, 7);
assert.equal(action.action.direction, "left");
assert.equal(action.action.bombPressed, true);
assert.equal(normalizeAgentAction({ turn: 7, direction: "teleport" }).ok, false);
assert.equal(normalizeAgentAction({ turn: 7.5 }).ok, false);

const report = normalizeAgentReport({
  summary: "A arena favorece rotas legiveis.",
  strengths: ["Leitura de bombas"],
  issues: ["Pouco tempo para reagir"],
  suggestions: ["Expor ETA no snapshot"],
});
assert.equal(report.ok, true);
assert.equal(report.report.suggestions.length, 1);
assert.equal(normalizeAgentReport({}).ok, false);

const token = createAgentSessionToken();
assert.match(token, /^bomba_agent_[a-f0-9]{32}$/);
assert.equal((await hashAgentSessionToken(token)).length, 64);
assert.equal(await timingSafeAgentSecretEqual("secret", "secret"), true);
assert.equal(await timingSafeAgentSecretEqual("secret", "wrong"), false);

const session = createAgentSession({ displayName: "Codex", model: "gpt", provider: "openai" }, 1000);
const snapshot = {
  frameId: 12,
  matchWinner: null,
  players: {
    1: { alive: true },
    2: { alive: true },
  },
};
const competition = {
  id: "copa-agents-2026",
  status: "running",
  turn: 3,
  participants: [
    { ...session, playerId: 1, characterIndex: 0 },
    { agentId: "agent_other", displayName: "Other", model: null, provider: null, playerId: 2, characterIndex: 1 },
  ],
  pendingActions: new Map([[1, { turn: 3 }]]),
  snapshot,
  result: null,
};
const observation = createAgentObservation(competition, session);
assert.equal(observation.self.playerId, 1);
assert.deepEqual(observation.pendingPlayerIds, [2]);
assert.equal(observation.verification.authoritativeTurn, 3);

const catalog = buildAgentActionCatalog();
const actionNames = catalog.actions.map((entry) => entry.name);
for (const required of [
  "agent.register",
  "competition.join",
  "competition.start",
  "competition.observe",
  "competition.act",
  "competition.forfeit",
  "competition.report",
  "competition.summary",
]) {
  assert.ok(actionNames.includes(required), `missing action ${required}`);
}

const sourceChecks = {
  publicRegistry: workerSource.includes('"/api/agent/actions"')
    && workerSource.includes('"/api/agent/register"'),
  dynamicCompetitionRoutes: workerSource.includes("API_AGENT_COMPETITION_ROUTE_RE"),
  operatorRegistrationFailClosed: workerSource.includes("agent_api_not_configured")
    && workerSource.includes("AGENT_OPERATOR_TOKEN"),
  requestBodiesAreBounded: workerSource.includes("AGENT_API_MAX_BODY_BYTES")
    && workerSource.includes("payload_too_large"),
  sessionsStoredByHash: workerSource.includes("hashAgentSessionToken(sessionToken)")
    && workerSource.includes("AGENT_SESSION_STORAGE_PREFIX"),
  authoritativeGameUsed: workerSource.includes("createServerGame(this.activeArenaDefinition)")
    && workerSource.includes("game.startServerAuthoritativeMatch"),
  synchronizedTurns: workerSource.includes("advanceAgentCompetitionWhenReady")
    && workerSource.includes("stale_or_future_turn")
    && workerSource.includes("action_already_submitted"),
  statePersistedEveryTurn: workerSource.includes("await this.persistAgentCompetition(competition);"),
  reportsPersisted: workerSource.includes('createId("agent_report")'),
  reportsRequireFinishedMatch: workerSource.includes("report_requires_finished_competition"),
  explicitConfirmation: workerSource.includes("explicit_confirmation_required"),
};

assert.deepEqual(
  Object.entries(sourceChecks).filter(([, passed]) => !passed),
  [],
  JSON.stringify(sourceChecks, null, 2),
);

console.log(JSON.stringify({ pass: true, actionNames, sourceChecks }, null, 2));
