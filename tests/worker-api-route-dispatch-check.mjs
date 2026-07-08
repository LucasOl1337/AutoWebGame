import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

const constantsMatch = workerSource.match(
  /const API_ADMIN_ARENA_ROUTE_RE[\s\S]*?const PUBLIC_API_ROUTES = new Map\(\[[\s\S]*?\n\]\);/,
);
const helperMatch = workerSource.match(/function resolvePublicApiRoute\(pathname, method\) \{[\s\S]*?\n\}/);

if (!constantsMatch || !helperMatch) {
  console.error("Could not find public API route helper in worker/index.js");
  process.exit(1);
}

const resolvePublicApiRoute = Function(`
  ${constantsMatch[0]}
  ${helperMatch[0]}
  return resolvePublicApiRoute;
`)();

function resolvePublicApiRouteBefore(pathname, method) {
  if (pathname === "/api/telemetry") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/telemetry" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/telemetry" };
  }
  if (pathname === "/api/admin/summary") {
    return { matched: true, methodAllowed: true, targetPath: "/internal/admin/summary" };
  }
  if (pathname === "/api/arena/active") {
    return method === "GET"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/arena/active" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/arena/active" };
  }
  if (pathname === "/api/admin/arenas") {
    return method === "GET" || method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/admin/arenas" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/admin/arenas" };
  }
  const arenaAdminMatch = pathname.match(/^\/api\/admin\/arenas\/([^/]+)(?:\/(activate|validate))?$/);
  if (arenaAdminMatch) {
    const arenaId = encodeURIComponent(arenaAdminMatch[1]);
    const suffix = arenaAdminMatch[2] ? `/${arenaAdminMatch[2]}` : "";
    return {
      matched: true,
      methodAllowed: method === "GET" || method === "PUT" || method === "POST",
      targetPath: `/internal/admin/arenas/${arenaId}${suffix}`,
    };
  }
  if (pathname === "/api/admin/login") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/admin/login" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/admin/login" };
  }
  if (pathname === "/api/admin/logout") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/admin/logout" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/admin/logout" };
  }
  if (pathname === "/api/feedback") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/feedback" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/feedback" };
  }
  if (pathname === "/api/me") {
    return method === "GET"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/account/me" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/account/me" };
  }
  if (pathname === "/api/account/quick-create") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/account/quick-create" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/account/quick-create" };
  }
  if (pathname === "/api/logout") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/account/logout" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/account/logout" };
  }
  if (pathname === "/api/billing/status") {
    return method === "GET"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/billing/status" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/billing/status" };
  }
  if (pathname === "/api/billing/checkout") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/billing/checkout" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/billing/checkout" };
  }
  if (pathname === "/api/billing/webhook") {
    return method === "POST"
      ? { matched: true, methodAllowed: true, targetPath: "/internal/billing/webhook" }
      : { matched: true, methodAllowed: false, targetPath: "/internal/billing/webhook" };
  }
  return null;
}

const contractCases = [
  ["/api/telemetry", "POST"],
  ["/api/telemetry", "GET"],
  ["/api/admin/summary", "GET"],
  ["/api/admin/summary", "POST"],
  ["/api/arena/active", "GET"],
  ["/api/admin/arenas", "GET"],
  ["/api/admin/arenas", "POST"],
  ["/api/admin/arenas", "DELETE"],
  ["/api/admin/arenas/live-arena", "GET"],
  ["/api/admin/arenas/live-arena", "PUT"],
  ["/api/admin/arenas/live-arena/validate", "POST"],
  ["/api/admin/arenas/live-arena/activate", "POST"],
  ["/api/admin/login", "POST"],
  ["/api/admin/logout", "POST"],
  ["/api/feedback", "POST"],
  ["/api/me", "GET"],
  ["/api/account/quick-create", "POST"],
  ["/api/logout", "POST"],
  ["/api/billing/status", "GET"],
  ["/api/billing/checkout", "POST"],
  ["/api/billing/webhook", "POST"],
  ["/api/unknown", "GET"],
];

const contractResults = contractCases.map(([pathname, method]) => ({
  pathname,
  method,
  before: resolvePublicApiRouteBefore(pathname, method),
  after: resolvePublicApiRoute(pathname, method),
}));

const contractPass = contractResults.every((entry) => JSON.stringify(entry.before) === JSON.stringify(entry.after));

function timeDispatch(fn, samples) {
  const startedAt = performance.now();
  let matched = 0;
  for (let index = 0; index < samples; index += 1) {
    const route = fn("/api/billing/webhook", "POST");
    if (route?.targetPath === "/internal/billing/webhook") {
      matched += 1;
    }
  }
  return {
    matched,
    elapsedMs: performance.now() - startedAt,
  };
}

const samples = 300_000;
const runs = Array.from({ length: 3 }, () => {
  const before = timeDispatch(resolvePublicApiRouteBefore, samples);
  const after = timeDispatch(resolvePublicApiRoute, samples);
  return {
    beforeMs: Number(before.elapsedMs.toFixed(3)),
    afterMs: Number(after.elapsedMs.toFixed(3)),
    matched: before.matched === samples && after.matched === samples,
  };
});

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const beforeMedianMs = median(runs.map((run) => run.beforeMs));
const afterMedianMs = median(runs.map((run) => run.afterMs));
const improvementPercent = Number((((beforeMedianMs - afterMedianMs) / beforeMedianMs) * 100).toFixed(1));
const benchmarkPass = runs.every((run) => run.matched) && afterMedianMs < beforeMedianMs;

console.log(JSON.stringify({
  pass: contractPass && benchmarkPass,
  contractPass,
  benchmarkPass,
  samplesPerRun: samples,
  beforeMedianMs,
  afterMedianMs,
  improvementPercent,
  runs,
  failedContracts: contractResults.filter((entry) => JSON.stringify(entry.before) !== JSON.stringify(entry.after)),
}, null, 2));

if (!contractPass || !benchmarkPass) {
  process.exit(1);
}
