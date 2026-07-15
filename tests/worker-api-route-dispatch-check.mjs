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

const contractCases = [
  ["/api/telemetry", "POST", true, "/internal/telemetry"],
  ["/api/telemetry", "GET", false, "/internal/telemetry"],
  ["/api/admin/summary", "GET", true, "/internal/admin/summary"],
  ["/api/admin/summary", "POST", false, "/internal/admin/summary"],
  ["/api/arena/active", "GET", true, "/internal/arena/active"],
  ["/api/admin/arenas", "GET", true, "/internal/admin/arenas"],
  ["/api/admin/arenas", "POST", true, "/internal/admin/arenas"],
  ["/api/admin/arenas", "DELETE", false, "/internal/admin/arenas"],
  ["/api/admin/arenas/live-arena", "GET", true, "/internal/admin/arenas/live-arena"],
  ["/api/admin/arenas/live-arena", "PUT", true, "/internal/admin/arenas/live-arena"],
  ["/api/admin/arenas/live-arena", "POST", false, "/internal/admin/arenas/live-arena"],
  ["/api/admin/arenas/live-arena/validate", "POST", true, "/internal/admin/arenas/live-arena/validate"],
  ["/api/admin/arenas/live-arena/validate", "PUT", false, "/internal/admin/arenas/live-arena/validate"],
  ["/api/admin/arenas/live-arena/activate", "POST", true, "/internal/admin/arenas/live-arena/activate"],
  ["/api/admin/arenas/live-arena/activate", "GET", false, "/internal/admin/arenas/live-arena/activate"],
  ["/api/admin/login", "POST", true, "/internal/admin/login"],
  ["/api/admin/logout", "POST", true, "/internal/admin/logout"],
  ["/api/auth/session", "GET", true, "/internal/auth/session"],
  ["/api/auth/session", "POST", false, "/internal/auth/session"],
  ["/api/auth/register", "POST", true, "/internal/auth/register"],
  ["/api/auth/login", "POST", true, "/internal/auth/login"],
  ["/api/auth/logout", "POST", true, "/internal/auth/logout"],
  ["/api/feedback", "POST", true, "/internal/feedback"],
  ["/api/me", "GET", true, "/internal/auth/session"],
  ["/api/account/quick-create", "POST", true, "/internal/account/quick-create"],
  ["/api/logout", "POST", true, "/internal/auth/logout"],
  ["/api/billing/status", "GET", true, "/internal/billing/status"],
  ["/api/billing/checkout", "POST", true, "/internal/billing/checkout"],
  ["/api/billing/webhook", "POST", true, "/internal/billing/webhook"],
];

const contractResults = contractCases.map(([pathname, method, methodAllowed, targetPath]) => {
  const actual = resolvePublicApiRoute(pathname, method);
  return {
    pathname,
    method,
    expected: { matched: true, methodAllowed, targetPath },
    actual,
  };
});
contractResults.push({
  pathname: "/api/unknown",
  method: "GET",
  expected: null,
  actual: resolvePublicApiRoute("/api/unknown", "GET"),
});

const failedContracts = contractResults.filter(
  (entry) => JSON.stringify(entry.actual) !== JSON.stringify(entry.expected),
);
const pass = failedContracts.length === 0;

console.log(JSON.stringify({
  pass,
  checkedContracts: contractResults.length,
  failedContracts,
}, null, 2));

if (!pass) {
  process.exit(1);
}
