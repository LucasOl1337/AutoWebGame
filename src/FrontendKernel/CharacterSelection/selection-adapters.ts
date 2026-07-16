import {
  CANONICAL_CHARACTER_CATALOG,
  defaultSelectionPreference,
  isCanonicalCharacter,
  normalizeSelectionNick,
  type SelectionEntryAdapter,
  type SelectionEntryRequest,
  type SelectionJourney,
  type SelectionPreference,
  type SelectionPreferenceStore,
} from "./selection-contract";

const STORAGE_PREFIX = "bomba-pvp:character-selection:v1:";
const HANDOFF_STORAGE_KEY = "bomba-pvp:character-selection:v1:handoff";
const LEGACY_CHARACTER_INDEX_STORAGE_KEY = "mistbridge-preferred-character-index";

type SelectionStorage = Pick<Storage, "getItem" | "setItem">;

export class BrowserSelectionPreferenceStore implements SelectionPreferenceStore {
  constructor(private readonly storage: SelectionStorage = window.localStorage) {}

  has(journey: SelectionJourney): boolean {
    const parsed = this.readRaw(journey);
    return isRecord(parsed)
      && parsed.version === 1
      && parsed.journey === journey
      && typeof parsed.characterId === "string"
      && isCanonicalCharacter(parsed.characterId)
      && typeof parsed.nick === "string"
      && normalizeSelectionNick(parsed.nick).ok;
  }

  read(journey: SelectionJourney): SelectionPreference {
    const parsed = this.readRaw(journey);
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.journey !== journey) {
      return defaultSelectionPreference();
    }
    const characterId = typeof parsed.characterId === "string" && isCanonicalCharacter(parsed.characterId)
      ? parsed.characterId
      : defaultSelectionPreference().characterId;
    const nick = typeof parsed.nick === "string" ? normalizeSelectionNick(parsed.nick) : null;
    return Object.freeze({
      characterId,
      nick: nick?.ok ? nick.value : defaultSelectionPreference().nick,
    });
  }

  write(journey: SelectionJourney, preference: SelectionPreference): void {
    const nick = normalizeSelectionNick(preference.nick);
    if (!isCanonicalCharacter(preference.characterId) || !nick.ok) return;
    try {
      this.storage.setItem(`${STORAGE_PREFIX}${journey}`, JSON.stringify({
        version: 1,
        journey,
        characterId: preference.characterId,
        nick: nick.value,
      }));
    } catch {
      // Storage denial must not block public Selection.
    }
  }

  private readRaw(journey: SelectionJourney): unknown {
    try {
      return JSON.parse(this.storage.getItem(`${STORAGE_PREFIX}${journey}`) ?? "null");
    } catch {
      return null;
    }
  }
}

export class InMemorySelectionPreferenceStore implements SelectionPreferenceStore {
  private readonly preferences = new Map<SelectionJourney, SelectionPreference>();

  has(journey: SelectionJourney): boolean {
    return this.preferences.has(journey);
  }

  read(journey: SelectionJourney): SelectionPreference {
    return this.preferences.get(journey) ?? defaultSelectionPreference();
  }

  write(journey: SelectionJourney, preference: SelectionPreference): void {
    this.preferences.set(journey, Object.freeze({ ...preference }));
  }
}

export class BrowserLegacySelectionEntryAdapter implements SelectionEntryAdapter {
  constructor(
    private readonly handoffStorage: SelectionStorage = window.sessionStorage,
    private readonly legacyPreferenceStorage: SelectionStorage = window.localStorage,
    private readonly navigator: { assign(destination: string): void } = window.location,
  ) {}

  async enter(request: SelectionEntryRequest, signal: AbortSignal): Promise<void> {
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      this.handoffStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({ version: 1, ...request }));
      const rosterIndex = CANONICAL_CHARACTER_CATALOG.findIndex((character) => character.id === request.characterId);
      if (rosterIndex >= 0) {
        this.legacyPreferenceStorage.setItem(LEGACY_CHARACTER_INDEX_STORAGE_KEY, String(rosterIndex));
      }
    } catch {
      // The maintained destination still receives the handoff through its route.
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    this.navigator.assign(request.destination);
  }
}

type PendingEntry = {
  request: SelectionEntryRequest;
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export class InMemorySelectionEntryAdapter implements SelectionEntryAdapter {
  readonly requests: PendingEntry[] = [];

  enter(request: SelectionEntryRequest, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      this.requests.push({ request, signal, resolve, reject });
    });
  }

  resolve(index: number): void {
    this.requests[index]?.resolve();
  }

  reject(index: number, error: unknown): void {
    this.requests[index]?.reject(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
