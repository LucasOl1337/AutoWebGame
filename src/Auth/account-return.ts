export type AccountReturnPath = "/" | "/laboratorio";

const ACCOUNT_RETURN_PATHS = new Set<AccountReturnPath>(["/", "/laboratorio"]);

export function resolveAccountReturnPath(search: string): AccountReturnPath | null {
  const requested = new URLSearchParams(search).get("return");
  return requested && ACCOUNT_RETURN_PATHS.has(requested as AccountReturnPath)
    ? requested as AccountReturnPath
    : null;
}
