import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "UiLayouts", "lab-session.ts");
const compiledPath = path.join(root, "output", "esm", "UiLayouts", "lab-session.js");
assert.ok(fs.existsSync(compiledPath), "run npm run compile:esm before this test");
assert.ok(
  fs.statSync(compiledPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs,
  "compiled lab-session.js is stale; run npm run compile:esm",
);

const moduleUrl = pathToFileURL(compiledPath);
moduleUrl.searchParams.set("run", String(Date.now()));

const {
  LAB_MODEL_VERIFICATION_TTL_MS,
  createLabSession,
  fetchLabModels,
} = await import(moduleUrl.href);

const request = (model = "cx/gpt-5.6-sol", provider = "9router") => ({
  agents: [{ slot: "1", provider, model, label: "P1" }],
  rounds: 1,
  durationSec: 60,
  map: "classic",
  modifier: "none",
});

const response = (payload, ok = true, status = ok ? 200 : 503) => ({
  ok,
  status,
  json: async () => payload,
});

const verifiedPayload = {
  ok: true,
  source: "9router",
  models: [
    { id: "cx/gpt-5.6-sol", label: "provider label is ignored" },
    { id: "cx/gpt-5.6-terra", label: "provider label is ignored" },
  ],
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const originalFetch = globalThis.fetch;
const originalNow = Date.now;

try {
  let nowMs = 10_000;
  Date.now = () => nowMs;

  let postCount = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") === "GET") throw new Error("broker offline");
    postCount += 1;
    throw new Error("POST must not run with an unverified catalog");
  };

  const offline = await fetchLabModels();
  assert.deepEqual(offline.models, [{ id: "", label: "Modelos não verificados — atualize a lista" }]);
  assert.equal(offline.warning, "broker_unreachable");
  assert.equal(offline.verified, false);
  assert.equal(offline.verifiedAtMs, null);

  for (const provider of ["9router", " 9ROUTER ", ""]) {
    const blocked = await createLabSession(request("cx/gpt-5.6-sol", provider));
    assert.equal(blocked.error, "models_not_verified", `provider variant ${JSON.stringify(provider)} must fail closed`);
  }
  assert.equal(postCount, 0, "unverified provider variants must be rejected before POST");
  const emptyAgents = await createLabSession({ ...request(), agents: [] });
  assert.equal(emptyAgents.error, "agents_required");
  assert.match(emptyAgents.hint ?? "", /ao menos um bot/i);
  assert.equal(postCount, 0, "an empty list must not trigger the broker's default 9Router agents");
  const offlineStart = await createLabSession(request());
  assert.match(offlineStart.hint ?? "", /Atualize a lista/i);
  assert.match(offlineStart.hint ?? "", /9Router/i);

  globalThis.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") === "GET") {
      return response({
        ok: true,
        source: "fallback",
        warning: "missing_api_key",
        models: [{ id: "cx/gpt-5.6-sol", label: "GPT-5.6 SOL" }],
      });
    }
    postCount += 1;
    throw new Error("fallback catalog must not authorize POST");
  };
  const fallback = await fetchLabModels();
  assert.equal(fallback.verified, false, "a broker fallback is not 9Router availability evidence");
  assert.equal(fallback.warning, "missing_api_key");
  assert.equal((await createLabSession(request())).error, "models_not_verified");
  assert.equal(postCount, 0);

  globalThis.fetch = async () => response({
    ok: true,
    source: "9router",
    models: [{ id: "cx/gpt-5.6-sol", label: "synthetic default" }],
  });
  const syntheticDefault = await fetchLabModels();
  assert.equal(syntheticDefault.verified, false, "one configured default cannot prove a remote catalog");
  assert.equal(syntheticDefault.warning, "catalog_provenance_insufficient");
  assert.equal((await createLabSession(request())).error, "models_not_verified");

  const oldGood = deferred();
  const newBad = deferred();
  let getIndex = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") !== "GET") {
      postCount += 1;
      return response({ ok: true, sessionId: "must-not-start", gameUrl: "/game?lab=1" });
    }
    getIndex += 1;
    return getIndex === 1 ? oldGood.promise : newBad.promise;
  };
  const oldGoodRequest = fetchLabModels();
  const newBadRequest = fetchLabModels();
  newBad.resolve(response({ ok: false, warning: "newer_failure" }, false));
  assert.equal((await newBadRequest).warning, "broker_unreachable");
  oldGood.resolve(response(verifiedPayload));
  const supersededGood = await oldGoodRequest;
  assert.equal(supersededGood.verified, false, "an older success must not reauthorize after a newer failure");
  assert.equal((await createLabSession(request())).error, "models_not_verified");
  assert.equal(postCount, 0);

  const oldBad = deferred();
  const newGood = deferred();
  getIndex = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") !== "GET") {
      postCount += 1;
      return response({ ok: true, sessionId: "verified-session", gameUrl: "/game?lab=1" });
    }
    getIndex += 1;
    return getIndex === 1 ? oldBad.promise : newGood.promise;
  };
  const oldBadRequest = fetchLabModels();
  const newGoodRequest = fetchLabModels();
  newGood.resolve(response(verifiedPayload));
  const verified = await newGoodRequest;
  assert.equal(verified.verified, true);
  assert.equal(verified.verifiedAtMs, nowMs);
  assert.deepEqual(verified.models, [
    { id: "cx/gpt-5.6-sol", label: "GPT-5.6 SOL · confirmado por 5 min" },
    { id: "cx/gpt-5.6-terra", label: "GPT-5.6 Terra · confirmado por 5 min" },
  ]);
  oldBad.resolve(response({ ok: false, warning: "older_failure" }, false));
  assert.equal((await oldBadRequest).verified, true, "an older failure must not clear a newer verified catalog");

  const invalidStart = await createLabSession(request("cc/claude-opus-4-8"));
  assert.equal(invalidStart.error, "model_not_available");
  assert.equal(postCount, 0);
  const validStart = await createLabSession(request());
  assert.equal(validStart.ok, true);
  assert.equal(postCount, 1);

  nowMs -= 1;
  const regressedClock = await createLabSession(request());
  assert.equal(regressedClock.error, "models_verification_expired");
  assert.equal(postCount, 1, "a regressed clock must fail closed");

  nowMs = 20_000;
  globalThis.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") === "GET") return response(verifiedPayload);
    postCount += 1;
    return response({ ok: true, sessionId: "fresh-again", gameUrl: "/game?lab=1" });
  };
  await fetchLabModels();
  nowMs += LAB_MODEL_VERIFICATION_TTL_MS + 1;
  const staleStart = await createLabSession(request());
  assert.equal(staleStart.error, "models_verification_expired");
  assert.match(staleStart.hint ?? "", /expirou/i);
  assert.equal(postCount, 1, "an expired verification must not start a session");

  const launcher = fs.readFileSync(path.join(root, "src", "UiLayouts", "launcher-shell.ts"), "utf8");
  assert.match(launcher, /result\.models/, "launcher must render the helper-provided verified/sentinel options");
  assert.match(launcher, /<select name="modelA" required>/, "empty sentinel option must engage native form validation");
  assert.match(launcher, /result\.hint[\s\S]*result\.error/, "launcher must render actionable helper errors");
  assert.match(launcher, /Atualizar modelos/, "launcher must expose the requested recovery action");

  console.log("lab-model-catalog-verification-check: ok");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
