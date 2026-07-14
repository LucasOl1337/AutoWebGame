import { buildLocalizedUrl, type SiteCopy, type SiteLanguage } from "../UiLayouts/i18n";

function normalizeRoomCodeToken(roomCode: string | null | undefined): string {
  return normalizeRoomCodeCharacters(roomCode).slice(0, 6);
}

function normalizeRoomCodeCharacters(roomCode: string | null | undefined): string {
  return String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readStandaloneRoomCode(value: string): string | null {
  const exactMatches = [...value.toUpperCase().matchAll(/(?:^|[^A-Z0-9])([A-Z0-9]{6})(?=$|[^A-Z0-9])/g)]
    .map((match) => match[1]);
  const exactWithDigit = exactMatches.find((candidate) => /\d/.test(candidate));
  if (exactWithDigit) {
    return exactWithDigit;
  }

  const looseTokens = value.match(/[A-Z0-9][A-Z0-9_-]{0,14}[A-Z0-9]/gi) ?? [];
  const looseCandidates: string[] = [];
  for (const token of looseTokens) {
    const normalizedToken = normalizeRoomCodeCharacters(token);
    if (normalizedToken.length === 6) {
      looseCandidates.push(normalizedToken);
    }
  }

  return looseCandidates.find((candidate) => /\d/.test(candidate))
    ?? exactMatches.at(-1)
    ?? looseCandidates.at(-1)
    ?? null;
}

function readNestedRoomCode(value: string, depth = 0): string | null {
  if (!value || depth > 2) {
    return null;
  }

  const candidates = [value];
  try {
    const decodedValue = decodeURIComponent(value);
    if (decodedValue !== value) {
      candidates.push(decodedValue);
    }
  } catch {
    // Keep the raw value if it is not valid percent-encoded input.
  }

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, "https://example.com/");
      const roomQuery = url.searchParams.get("room");
      if (roomQuery === null) {
        continue;
      }

      const nestedRoomCode = readNestedRoomCode(roomQuery, depth + 1);
      if (nestedRoomCode) {
        return nestedRoomCode;
      }

      const standaloneRoomCode = readStandaloneRoomCode(roomQuery);
      if (standaloneRoomCode) {
        return standaloneRoomCode;
      }

      const normalizedRoomCode = normalizeRoomCodeToken(roomQuery);
      if (normalizedRoomCode) {
        return normalizedRoomCode;
      }
    } catch {
      // Non-URL values are handled by the token fallback.
    }
  }

  return null;
}

export function normalizeRoomCode(roomCode: string | null | undefined): string {
  const rawRoomCode = String(roomCode || "").trim();
  return readNestedRoomCode(rawRoomCode)
    ?? readStandaloneRoomCode(rawRoomCode)
    ?? normalizeRoomCodeToken(rawRoomCode);
}

export function resolveManualLobbyJoinCode(roomCode: string | null | undefined): string | null {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  return normalizedRoomCode || null;
}

export function resolvePastedLobbyJoinCode(roomCode: string | null | undefined): string | null {
  const normalizedRoomCode = resolveManualLobbyJoinCode(roomCode);
  return normalizedRoomCode?.length === 6 ? normalizedRoomCode : null;
}

export function readRoomCodeFromUrl(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }
  try {
    const url = new URL(href, "https://example.com/");
    const roomCode = normalizeRoomCode(url.searchParams.get("room"));
    return roomCode || null;
  } catch {
    return null;
  }
}

export function buildRoomInviteUrl(language: SiteLanguage, roomCode: string | null | undefined, href?: string): string {
  const url = buildLocalizedUrl(language, href);
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (normalizedRoomCode) {
    url.searchParams.set("room", normalizedRoomCode);
  } else {
    url.searchParams.delete("room");
  }
  return url.toString();
}

export function formatInviteCopyManualStatus(copy: SiteCopy, roomCode: string | null | undefined): string {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  return normalizedRoomCode ? copy.status.inviteCopyManual(normalizedRoomCode) : copy.status.inviteCopyFailed;
}

type ClipboardFallbackEnvironment = {
  clipboard?: Pick<Clipboard, "writeText"> | null;
  document?: Document | null;
};

function getClipboardFallbackEnvironment(): ClipboardFallbackEnvironment {
  return {
    clipboard: typeof navigator === "undefined" ? null : (navigator.clipboard ?? null),
    document: typeof document === "undefined" ? null : document,
  };
}

function removeClipboardFallbackTextarea(textarea: HTMLTextAreaElement): void {
  try {
    if (typeof textarea.remove === "function") {
      textarea.remove();
      return;
    }
    textarea.parentNode?.removeChild(textarea);
  } catch {
    // Cleanup must not turn a successful legacy copy into a failed invite action.
  }
}

export async function copyTextWithFallback(
  text: string,
  environment: ClipboardFallbackEnvironment = getClipboardFallbackEnvironment(),
): Promise<boolean> {
  if (environment.clipboard) {
    try {
      await environment.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path for browsers that expose but reject Clipboard API calls.
    }
  }

  const targetDocument = environment.document;
  if (!targetDocument?.body || typeof targetDocument.execCommand !== "function") {
    return false;
  }

  const textarea = targetDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  targetDocument.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return targetDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    removeClipboardFallbackTextarea(textarea);
  }
}
