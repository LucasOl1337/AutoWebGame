const AGENT_NAME_MAX_LENGTH = 80;
const AGENT_MODEL_MAX_LENGTH = 120;
const AGENT_REPORT_SUMMARY_MAX_LENGTH = 2000;
const AGENT_REPORT_ITEM_MAX_LENGTH = 500;
const AGENT_REPORT_ITEM_LIMIT = 10;
const AGENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DIRECTIONS = new Set(["up", "down", "left", "right"]);

function normalizeBoundedText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeAgentCompetitionId(value) {
  const normalized = normalizeBoundedText(value, 64).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
}

export function normalizeAgentProfile(payload) {
  const displayName = normalizeBoundedText(payload?.displayName, AGENT_NAME_MAX_LENGTH);
  if (!displayName) {
    return { ok: false, error: "display_name_required" };
  }
  return {
    ok: true,
    profile: {
      displayName,
      model: normalizeBoundedText(payload?.model, AGENT_MODEL_MAX_LENGTH) || null,
      provider: normalizeBoundedText(payload?.provider, AGENT_MODEL_MAX_LENGTH) || null,
    },
  };
}

export function normalizeAgentAction(payload) {
  const turn = Number(payload?.turn);
  if (!Number.isInteger(turn) || turn < 0) {
    return { ok: false, error: "invalid_turn" };
  }
  const direction = payload?.direction == null ? null : String(payload.direction).toLowerCase();
  if (direction !== null && !DIRECTIONS.has(direction)) {
    return { ok: false, error: "invalid_direction" };
  }
  return {
    ok: true,
    action: {
      turn,
      direction,
      bombPressed: payload?.bombPressed === true,
      detonatePressed: payload?.detonatePressed === true,
      skillPressed: payload?.skillPressed === true,
      skillHeld: payload?.skillHeld === true,
    },
  };
}

function normalizeReportItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeBoundedText(item, AGENT_REPORT_ITEM_MAX_LENGTH))
    .filter(Boolean)
    .slice(0, AGENT_REPORT_ITEM_LIMIT);
}

export function normalizeAgentReport(payload) {
  const summary = normalizeBoundedText(payload?.summary, AGENT_REPORT_SUMMARY_MAX_LENGTH);
  const strengths = normalizeReportItems(payload?.strengths);
  const issues = normalizeReportItems(payload?.issues);
  const suggestions = normalizeReportItems(payload?.suggestions);
  if (!summary && strengths.length === 0 && issues.length === 0 && suggestions.length === 0) {
    return { ok: false, error: "empty_report" };
  }
  return {
    ok: true,
    report: {
      summary: summary || null,
      strengths,
      issues,
      suggestions,
    },
  };
}

export function createAgentSessionToken() {
  return `bomba_agent_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function hashAgentSessionToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : "";
}

export async function timingSafeAgentSecretEqual(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided || "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected || "")),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  }
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let mismatch = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    mismatch |= providedBytes[index] ^ expectedBytes[index];
  }
  return mismatch === 0;
}

export function createAgentSession(profile, now = Date.now()) {
  return {
    agentId: `agent_${crypto.randomUUID().replaceAll("-", "")}`,
    displayName: profile.displayName,
    model: profile.model,
    provider: profile.provider,
    createdAt: now,
    expiresAt: now + AGENT_SESSION_TTL_MS,
  };
}

export function buildAgentActionCatalog() {
  return {
    apiVersion: "2026-07-10",
    protocol: "bomba-agent-competition-v1",
    actions: [
      { name: "agent.register", method: "POST", path: "/api/agent/register", auth: "operator", input: { displayName: "string", model: "string?", provider: "string?" }, success: ["agent", "sessionToken"], confirmation: true },
      { name: "competition.join", method: "POST", path: "/api/agent/competitions/{competitionId}/join", auth: "agent", input: { characterIndex: "integer?" }, verify: "self.playerId" },
      { name: "competition.start", method: "POST", path: "/api/agent/competitions/{competitionId}/start", auth: "agent", input: { confirm: true }, verify: "status=running and turn=0", confirmation: true },
      { name: "competition.observe", method: "GET", path: "/api/agent/competitions/{competitionId}/observe", auth: "agent", input: null, verify: "verification.authoritativeTurn" },
      { name: "competition.act", method: "POST", path: "/api/agent/competitions/{competitionId}/act", auth: "agent", input: { turn: "integer", direction: "up|down|left|right|null", bombPressed: "boolean?", detonatePressed: "boolean?", skillPressed: "boolean?", skillHeld: "boolean?" }, verify: "turn advances after all living agents submit", idempotency: "turn" },
      { name: "competition.forfeit", method: "POST", path: "/api/agent/competitions/{competitionId}/forfeit", auth: "agent", input: { confirm: true }, verify: "status=finished", confirmation: true },
      { name: "competition.report", method: "POST", path: "/api/agent/competitions/{competitionId}/report", auth: "agent", input: { summary: "string?", strengths: "string[]?", issues: "string[]?", suggestions: "string[]?" }, verify: "report.reportId then competition.summary" },
      { name: "competition.summary", method: "GET", path: "/api/agent/competitions/{competitionId}/summary", auth: "agent", input: null, verify: "verification.reportCount" },
    ],
  };
}

export function createAgentObservation(competition, session) {
  const participant = competition.participants.find((entry) => entry.agentId === session.agentId) ?? null;
  const snapshot = competition.snapshot ?? null;
  const alivePlayerIds = snapshot
    ? competition.participants
      .filter((entry) => snapshot.players?.[entry.playerId]?.alive)
      .map((entry) => entry.playerId)
    : [];
  const pendingPlayerIds = competition.status === "running"
    ? alivePlayerIds.filter((playerId) => !competition.pendingActions.has(playerId))
    : [];
  return {
    ok: true,
    protocol: "bomba-agent-competition-v1",
    competitionId: competition.id,
    status: competition.status,
    turn: competition.turn,
    self: participant ? { agentId: participant.agentId, playerId: participant.playerId } : null,
    participants: competition.participants.map(({ agentId, displayName, model, provider, playerId, characterIndex }) => ({
      agentId,
      displayName,
      model,
      provider,
      playerId,
      characterIndex,
    })),
    pendingPlayerIds,
    snapshot,
    result: competition.result ?? null,
    verification: {
      authoritativeTurn: competition.turn,
      snapshotFrameId: snapshot?.frameId ?? null,
      matchWinner: snapshot?.matchWinner ?? null,
    },
  };
}
