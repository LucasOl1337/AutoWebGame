/**
 * @param {Record<string, string | undefined> | null | undefined} env
 * @param {string} key
 * @returns {string}
 */
function readAdminEnvironmentValue(env, key) {
  const value = env?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve only credentials that were explicitly configured for this deployment.
 * ADMIN_TOKEN remains a supported login password when ADMIN_USERNAME is present,
 * and remains available by itself for legacy token-authorized requests.
 *
 * @param {Record<string, string | undefined> | null | undefined} env
 */
export function resolveAdminAuthConfig(env) {
  const username = readAdminEnvironmentValue(env, 'ADMIN_USERNAME');
  const password = readAdminEnvironmentValue(env, 'ADMIN_PASSWORD');
  const legacyToken = readAdminEnvironmentValue(env, 'ADMIN_TOKEN') || null;
  const loginPassword = password || legacyToken;
  const login = username && loginPassword
    ? { username, password: loginPassword }
    : null;

  return {
    enabled: Boolean(login || legacyToken),
    login,
    legacyToken,
  };
}
