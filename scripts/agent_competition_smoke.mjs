import assert from "node:assert/strict";

const baseUrl = String(process.env.AGENT_API_BASE_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
const operatorToken = String(process.env.AGENT_OPERATOR_TOKEN || "");
const allowRemote = process.env.AGENT_SMOKE_ALLOW_REMOTE === "true";
const parsedBaseUrl = new URL(baseUrl);

if (!operatorToken) {
  throw new Error("Set AGENT_OPERATOR_TOKEN for the local smoke run.");
}
if (!allowRemote && !["127.0.0.1", "localhost"].includes(parsedBaseUrl.hostname)) {
  throw new Error("Remote smoke is disabled. Set AGENT_SMOKE_ALLOW_REMOTE=true only for an authorized test environment.");
}

async function request(path, { method = "GET", token = null, body = null } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

async function requestError(path, expectedStatus, expectedCode, { method = "GET", token = null, body = null } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  assert.equal(payload.error?.code, expectedCode, JSON.stringify(payload));
  return payload;
}

const suffix = Date.now().toString(36);
const competitionId = `smoke-${suffix}`;
const catalog = await request("/api/agent/actions");
assert.ok(catalog.actions.some((entry) => entry.name === "competition.act"));
assert.equal(catalog.simulation.mode, "lockstep");
await requestError("/api/agent/register", 413, "payload_too_large", {
  method: "POST",
  token: operatorToken,
  body: { displayName: "x".repeat(70_000) },
});
await requestError("/api/agent/register", 401, "unauthorized_operator", {
  method: "POST",
  token: "wrong-operator-token",
  body: { displayName: "Unauthorized" },
});
const alpha = await request("/api/agent/register", {
  method: "POST",
  token: operatorToken,
  body: { displayName: `Smoke Alpha ${suffix}`, provider: "local-smoke", model: "deterministic" },
});
const beta = await request("/api/agent/register", {
  method: "POST",
  token: operatorToken,
  body: { displayName: `Smoke Beta ${suffix}`, provider: "local-smoke", model: "deterministic" },
});

const alphaToken = alpha.sessionToken;
const betaToken = beta.sessionToken;
const alphaJoin = await request(`/api/agent/competitions/${competitionId}/join`, {
  method: "POST",
  token: alphaToken,
  body: { characterIndex: 0 },
});
const betaJoin = await request(`/api/agent/competitions/${competitionId}/join`, {
  method: "POST",
  token: betaToken,
  body: { characterIndex: 1 },
});
await requestError(`/api/agent/competitions/${competitionId}/start`, 409, "explicit_confirmation_required", {
  method: "POST",
  token: alphaToken,
  body: {},
});
const started = await request(`/api/agent/competitions/${competitionId}/start`, {
  method: "POST",
  token: alphaToken,
  body: { confirm: true },
});
const alphaAction = await request(`/api/agent/competitions/${competitionId}/act`, {
  method: "POST",
  token: alphaToken,
  body: { turn: 0, direction: "right", bombPressed: true },
});
await requestError(`/api/agent/competitions/${competitionId}/act`, 409, "action_already_submitted", {
  method: "POST",
  token: alphaToken,
  body: { turn: 0, direction: "up" },
});
await requestError(`/api/agent/competitions/${competitionId}/report`, 409, "report_requires_finished_competition", {
  method: "POST",
  token: alphaToken,
  body: { summary: "Too early" },
});
const betaAction = await request(`/api/agent/competitions/${competitionId}/act`, {
  method: "POST",
  token: betaToken,
  body: { turn: 0, direction: "left" },
});
const forfeited = await request(`/api/agent/competitions/${competitionId}/forfeit`, {
  method: "POST",
  token: betaToken,
  body: { confirm: true },
});
const report = await request(`/api/agent/competitions/${competitionId}/report`, {
  method: "POST",
  token: alphaToken,
  body: {
    summary: "Local Agent-First smoke completed.",
    strengths: ["Authoritative lockstep advanced"],
    issues: [],
    suggestions: ["Keep observations machine-readable"],
  },
});
const summary = await request(`/api/agent/competitions/${competitionId}/summary`, {
  token: alphaToken,
});

assert.equal(alphaJoin.self.playerId, 1);
assert.equal(betaJoin.self.playerId, 2);
assert.equal(started.status, "running");
assert.equal(alphaAction.turn, 0);
assert.equal(betaAction.turn, 1);
assert.ok(betaAction.snapshot.animationClockMs > started.snapshot.animationClockMs);
assert.ok(betaAction.snapshot.bombs.length >= 1, "authoritative simulation should contain Alpha's planted bomb");
assert.equal(forfeited.status, "finished");
assert.ok(summary.reports.some((entry) => entry.reportId === report.report.reportId));

console.log(JSON.stringify({
  pass: true,
  competitionId,
  players: [alphaJoin.self.playerId, betaJoin.self.playerId],
  turnAdvancedTo: betaAction.turn,
  status: summary.status,
  reportCount: summary.verification.reportCount,
}, null, 2));
