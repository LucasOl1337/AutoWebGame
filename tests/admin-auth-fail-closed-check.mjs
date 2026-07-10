import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
let resolveAdminAuthConfig = null;
try {
  ({ resolveAdminAuthConfig } = await import('../worker/admin-auth.js'));
} catch {
  // Expected during the pre-fix run.
}

const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  return from >= 0 && to > from ? source.slice(from, to) : '';
};
const login = section('async handleAdminLogin(request, env)', 'async handleAdminLogout(request)');
const authorize = section(
  'async function authorizeAdminRequest(request, env, storage)',
  'function readAdminToken(request)',
);
const config = (env) => resolveAdminAuthConfig?.(env) ?? null;
const missing = config({});
const blank = config({ ADMIN_USERNAME: '  ', ADMIN_PASSWORD: '  ', ADMIN_TOKEN: '  ' });
const password = config({ ADMIN_USERNAME: ' admin ', ADMIN_PASSWORD: ' password ' });
const tokenLogin = config({ ADMIN_USERNAME: 'admin', ADMIN_TOKEN: 'token' });
const tokenOnly = config({ ADMIN_TOKEN: 'token' });
const usernameOnly = config({ ADMIN_USERNAME: 'admin' });
const passwordOnly = config({ ADMIN_PASSWORD: 'password' });

const report = {
  noEmbeddedDefaults: !/ADMIN_DEFAULT_(?:USERNAME|PASSWORD)/.test(source),
  noFallbackCredentialHelpers: !source.includes('getAdminUsername')
    && !source.includes('getAdminPassword'),
  adminPageUsesExplicitConfig: source.includes(
    `escapeHtml(resolveAdminAuthConfig(env).login?.username ?? '')`,
  ),
  missingDisabled: missing?.enabled === false && missing.login === null && missing.legacyToken === null,
  blanksDisabled: blank?.enabled === false && blank.login === null && blank.legacyToken === null,
  passwordLoginWorks: password?.login?.username === 'admin'
    && password.login.password === 'password',
  tokenLoginWorks: tokenLogin?.login?.password === 'token'
    && tokenLogin.legacyToken === 'token',
  tokenOnlyStaysLegacy: tokenOnly?.enabled === true
    && tokenOnly.login === null
    && tokenOnly.legacyToken === 'token',
  incompleteLoginDisabled: usernameOnly?.enabled === false
    && usernameOnly.login === null
    && passwordOnly?.enabled === false
    && passwordOnly.login === null,
  loginFailsBeforeParsing: login.indexOf('resolveAdminAuthConfig(env)') >= 0
    && login.indexOf('resolveAdminAuthConfig(env)') < login.indexOf('request.json()')
    && login.includes('if (!authConfig.login)')
    && login.includes('createAdminUnavailableResponse()'),
  staleSessionsFailClosed: authorize.includes('if (!authConfig.enabled)')
    && authorize.indexOf('if (!authConfig.enabled)') < authorize.indexOf('readStoredAdminSession')
    && authorize.includes('authConfig.login')
    && authorize.includes('authConfig.legacyToken')
    && !authorize.includes('env.ADMIN_TOKEN'),
  preFixSessionsRevoked: source.includes('const ADMIN_SESSION_STORAGE_VERSION = 2;')
    && source.includes('admin-session:v${ADMIN_SESSION_STORAGE_VERSION}:${sessionId}'),
};
const failedChecks = Object.entries(report)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);
console.log(JSON.stringify({
  ...report,
  failedChecks,
  pass: failedChecks.length === 0,
}, null, 2));
if (failedChecks.length > 0) process.exit(1);
