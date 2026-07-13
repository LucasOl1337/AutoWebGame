import type { ArenaDefinition } from "../Gameplay/types";
import {
  ARENA_THEME_LIBRARY,
  ARENA_THEME_QUERY_PARAM,
  DEFAULT_ARENA_THEME_ID,
  getArenaThemeById,
  type ArenaThemeDefinition,
} from "./arena-theme-library";

const FALLBACK_THEME = ARENA_THEME_LIBRARY[0];
const FALLBACK_HREF = "http://localhost/";
const SURPRISE_THEME_ID = "surprise";

function resolveSurpriseTheme(url: URL): ArenaThemeDefinition {
  const seed = `${url.pathname}${url.searchParams.toString()}`;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ARENA_THEME_LIBRARY[(hash >>> 0) % ARENA_THEME_LIBRARY.length] ?? FALLBACK_THEME;
}

function parseUrl(value: string | null | undefined): URL {
  try {
    return new URL(value || FALLBACK_HREF, FALLBACK_HREF);
  } catch {
    return new URL(FALLBACK_HREF);
  }
}

function getDefaultArenaTheme(): ArenaThemeDefinition {
  return getArenaThemeById(DEFAULT_ARENA_THEME_ID) ?? FALLBACK_THEME;
}

export function resolveArenaThemeSelection(
  searchOrHref: string | null | undefined,
  fallbackThemeId: string | null | undefined = DEFAULT_ARENA_THEME_ID,
): ArenaThemeDefinition {
  const url = parseUrl(searchOrHref);
  const requestedThemeId = url.searchParams.get(ARENA_THEME_QUERY_PARAM);
  if (requestedThemeId === SURPRISE_THEME_ID) {
    return resolveSurpriseTheme(url);
  }
  return getArenaThemeById(requestedThemeId)
    ?? getArenaThemeById(fallbackThemeId)
    ?? getDefaultArenaTheme();
}

export function applyArenaThemeSelection(
  arena: ArenaDefinition,
  searchOrHref: string | null | undefined,
): ArenaDefinition {
  const theme = resolveArenaThemeSelection(searchOrHref, arena.themeId);
  if (arena.themeId === theme.id) {
    return arena;
  }
  return {
    ...arena,
    themeId: theme.id,
  };
}

export function buildArenaThemeUrl(themeId: string, href: string | null | undefined): string {
  const url = parseUrl(href);
  if (themeId === SURPRISE_THEME_ID) {
    url.searchParams.set(ARENA_THEME_QUERY_PARAM, SURPRISE_THEME_ID);
    return url.toString();
  }
  const theme = getArenaThemeById(themeId) ?? getDefaultArenaTheme();
  url.searchParams.set(ARENA_THEME_QUERY_PARAM, theme.id);
  return url.toString();
}
