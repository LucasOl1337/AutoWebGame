import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const constantsMatch = workerSource.match(
  /const LAB_PROXY_TIMEOUT_MS[\s\S]*?let activeLabSessionCapability = null;/,
);
const clientKeyMatch = workerSource.match(/function getLabClientKey\(request\) \{[\s\S]*?\n\}/);
const protectedRouteMatch = workerSource.match(/function isCapabilityProtectedLabRoute\(request, route\) \{[\s\S]*?\n\}/);
const capabilityMatch = workerSource.match(/function getLabSessionCapability\(request\) \{[\s\S]*?\n\}/);
const rememberMatch = workerSource.match(/function rememberLabSessionCapability\(request, now = Date\.now\(\)\) \{[\s\S]*?\n\}/);
const forgetMatch = workerSource.match(/function forgetLabSessionCapability\(request\) \{[\s\S]*?\n\}/);
const sessionTrafficMatch = workerSource.match(/function isLabSessionTraffic\(request, route, now = Date\.now\(\)\) \{[\s\S]*?\n\}/);
const limiterMatch = workerSource.match(/function consumeLabRateLimit\(request, route\) \{[\s\S]*?\n\}/);
const proxyMatch = workerSource.match(/async function proxyLabRequest\(request, env, route\) \{[\s\S]*?\n\}\r?\n\r?\n/);

assert.ok(constantsMatch, "worker rate-limit constants should remain extractable");
assert.ok(clientKeyMatch, "worker client-key helper should remain extractable");
assert.ok(protectedRouteMatch, "worker should identify routes protected by the broker capability");
assert.ok(capabilityMatch, "worker should normalize session capabilities in one helper");
assert.ok(rememberMatch, "worker should remember only capabilities authenticated upstream");
assert.ok(forgetMatch, "worker should forget capabilities rejected upstream");
assert.ok(sessionTrafficMatch, "worker should classify authenticated session traffic explicitly");
assert.ok(limiterMatch, "worker rate limiter should accept route context");
assert.ok(proxyMatch, "worker proxy should remain extractable for HTTP contract coverage");

const createLimiter = Function(`
  ${constantsMatch[0]}
  ${clientKeyMatch[0]}
  ${protectedRouteMatch[0]}
  ${capabilityMatch[0]}
  ${rememberMatch[0]}
  ${forgetMatch[0]}
  ${sessionTrafficMatch[0]}
  ${limiterMatch[0]}
  return { consumeLabRateLimit, rememberLabSessionCapability, labRateBuckets };
`);

function createProxy(fetchImpl) {
  return Function("fetch", `
    ${constantsMatch[0]}
    ${clientKeyMatch[0]}
    ${protectedRouteMatch[0]}
    ${capabilityMatch[0]}
    ${rememberMatch[0]}
    ${forgetMatch[0]}
    ${sessionTrafficMatch[0]}
    ${limiterMatch[0]}
    ${proxyMatch[0]}
    return proxyLabRequest;
  `)(fetchImpl);
}

const sessionCapability = "a".repeat(32);
const liveRoute = { targetPath: "/decision/1" };
const telemetryRoute = { targetPath: "/telemetry" };
const reportRoute = { targetPath: "/report" };
const healthRoute = { targetPath: "/health" };
const sessionRoute = { targetPath: "/lab/session" };
const controlRoute = { targetPath: "/lab/models" };

function request(ip, { capability = sessionCapability, method = "GET" } = {}) {
  const headers = { "CF-Connecting-IP": ip };
  if (capability !== null) {
    headers["x-bomba-lab-session"] = capability;
  }
  return new Request("https://game.test/api/lab/decision/1", { method, headers });
}

function consumeMany(limiter, count, ip, route, options) {
  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(limiter.consumeLabRateLimit(request(ip, options), route));
  }
  return results;
}

{
  const limiter = createLimiter();
  const verificationRequest = request("198.51.100.10");
  const verification = limiter.consumeLabRateLimit(verificationRequest, sessionRoute);
  assert.equal(verification.scope, "control", "a capability is untrusted before broker verification");
  limiter.rememberLabSessionCapability(verificationRequest);
  const telemetry = consumeMany(
    limiter,
    600,
    "198.51.100.10",
    telemetryRoute,
    { method: "POST" },
  );
  const decisions = consumeMany(limiter, 1_200, "198.51.100.10", liveRoute);
  const reports = consumeMany(limiter, 240, "198.51.100.10", reportRoute);
  const health = consumeMany(limiter, 12, "198.51.100.10", healthRoute);
  const session = consumeMany(limiter, 1, "198.51.100.10", sessionRoute);
  const minute = [...telemetry, ...decisions, ...reports, ...health, ...session];
  assert.equal(
    minute.filter((result) => result.allowed).length,
    2_053,
    "two bots plus the live HUD should keep the whole session alive for one minute",
  );
  assert.equal(minute.at(-1).scope, "session");
  assert.equal(minute.at(-1).remainingRequests, 1_429);
}

{
  const limiter = createLimiter();
  limiter.rememberLabSessionCapability(request("198.51.100.11"));
  const burst = consumeMany(limiter, 3_601, "198.51.100.11", liveRoute);
  assert.equal(burst.filter((result) => result.allowed).length, 3_600);
  assert.equal(burst.at(-1).allowed, false, "session traffic must still have a hard per-IP ceiling");
  assert.equal(burst.at(-1).retryAfterSeconds, 60);
}

for (const [label, route, options] of [
  ["control route", controlRoute, undefined],
  ["missing capability", liveRoute, { capability: null }],
  ["malformed capability", liveRoute, { capability: "not-a-capability" }],
  ["well-formed but unverified capability", liveRoute, { capability: "b".repeat(32) }],
]) {
  const limiter = createLimiter();
  const attempts = consumeMany(limiter, 361, `203.0.113.${label.length}`, route, options);
  assert.equal(attempts.filter((result) => result.allowed).length, 360, `${label} keeps the legacy ceiling`);
  assert.equal(attempts.at(-1).scope, "control");
  assert.equal(attempts.at(-1).allowed, false);
}

{
  const limiter = createLimiter();
  const oldRequest = request("203.0.113.70", { capability: "e".repeat(32) });
  const currentRequest = request("203.0.113.70", { capability: "f".repeat(32) });
  limiter.rememberLabSessionCapability(oldRequest);
  limiter.rememberLabSessionCapability(currentRequest);
  assert.equal(
    limiter.consumeLabRateLimit(oldRequest, liveRoute).scope,
    "control",
    "authenticating a new global Lab session must replace the previous capability",
  );
  assert.equal(limiter.consumeLabRateLimit(currentRequest, liveRoute).scope, "session");
}

{
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const limiter = createLimiter();
    limiter.rememberLabSessionCapability(request("192.0.2.44"), now);
    const firstWindow = consumeMany(limiter, 3_601, "192.0.2.44", liveRoute);
    assert.equal(firstWindow.at(-1).allowed, false);
    now += 60_000;
    const reset = limiter.consumeLabRateLimit(request("192.0.2.44"), liveRoute);
    assert.equal(reset.allowed, true, "budget should reset at the next window");
    assert.equal(reset.remainingRequests, 3_599);
  }
  finally {
    Date.now = originalNow;
  }
}

{
  const env = { LAB_BROKER_URL: "https://broker.test", LAB_BROKER_SECRET: "test-secret-not-real" };
  const verifiedCapability = "c".repeat(32);
  let upstreamStatus = 200;
  let upstreamCalls = 0;
  const proxy = createProxy(async () => {
    upstreamCalls += 1;
    return Response.json({ ok: upstreamStatus === 200 }, { status: upstreamStatus });
  });
  const first = await proxy(
    request("198.51.100.50", { capability: verifiedCapability }),
    env,
    sessionRoute,
  );
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("x-bomba-lab-rate-scope"), "control");
  assert.equal(first.headers.get("x-bomba-lab-rate-remaining"), "359");

  const authenticated = await proxy(
    request("198.51.100.50", { capability: verifiedCapability }),
    env,
    liveRoute,
  );
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.headers.get("x-bomba-lab-rate-scope"), "session");
  assert.equal(authenticated.headers.get("x-bomba-lab-rate-remaining"), "3589");

  upstreamStatus = 401;
  const rejected = await proxy(
    request("198.51.100.50", { capability: verifiedCapability }),
    env,
    liveRoute,
  );
  assert.equal(rejected.status, 401);
  upstreamStatus = 200;
  const demoted = await proxy(
    request("198.51.100.50", { capability: verifiedCapability }),
    env,
    liveRoute,
  );
  assert.equal(demoted.headers.get("x-bomba-lab-rate-scope"), "control");
  assert.equal(upstreamCalls, 4);
}

{
  const env = { LAB_BROKER_URL: "https://broker.test", LAB_BROKER_SECRET: "test-secret-not-real" };
  const proxy = createProxy(async () => Response.json({ ok: false }, { status: 401 }));
  const forgedCapability = "d".repeat(32);
  let lastResponse = null;
  for (let index = 0; index < 361; index += 1) {
    lastResponse = await proxy(
      request("198.51.100.51", { capability: forgedCapability }),
      env,
      liveRoute,
    );
  }
  assert.equal(lastResponse.status, 429);
  assert.deepEqual(await lastResponse.json(), {
    ok: false,
    error: "rate_limited",
    scope: "control",
    retryAfterSeconds: 60,
  });
  assert.equal(lastResponse.headers.get("retry-after"), "60");
  assert.equal(lastResponse.headers.get("x-bomba-lab-rate-scope"), "control");
  assert.equal(lastResponse.headers.get("x-bomba-lab-rate-remaining"), "0");
}

console.log("lab-proxy-rate-limit-check: ok");
