const REMOTE_ASSET_BASE = "https://cdn.jsdelivr.net/gh/LucasOl1337/AutoWebGame@cloudflare-live/public";

export function assetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const hostname = window.location.hostname;
  const useLocalAssets = hostname === "127.0.0.1" || hostname === "localhost";
  return `${useLocalAssets ? "" : REMOTE_ASSET_BASE}${normalizedPath}`;
}
