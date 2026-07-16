import { CHARACTER_ROSTER_MANIFEST } from "../../Characters/Animations/character-roster-manifest";

export type SelectionJourney = "continuous-room" | "training";
export type SelectionRoute = "/jogar/personagem" | "/treino/personagem";
export type SelectionDestination = "/game/play" | "/game/training";

export type SelectionCharacter = Readonly<{
  id: string;
  name: string;
}>;

export const CANONICAL_CHARACTER_CATALOG: readonly SelectionCharacter[] = Object.freeze(
  CHARACTER_ROSTER_MANIFEST
    .slice()
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))
    .map(({ id, name }) => Object.freeze({ id, name })),
);

export type CharacterSelectionIntent =
  | { readonly type: "choose-character"; readonly characterId: string }
  | { readonly type: "edit-selection-nick"; readonly value: string }
  | { readonly type: "confirm-selection" }
  | { readonly type: "retry-selection" }
  | { readonly type: "cancel-selection" };

export type CharacterSelectionSnapshot = Readonly<{
  screen: "character-selection";
  journey: SelectionJourney;
  route: SelectionRoute;
  title: string;
  actionLabel: string;
  status: "choosing" | "pending" | "error" | "completed";
  roster: readonly SelectionCharacter[];
  selectedCharacterId: string;
  nick: string;
  operation: Readonly<{ requestId: string; label: string }> | null;
  errorMessage: string | null;
  validationMessage: string | null;
  focusTarget: "confirm" | "error" | null;
}>;

export interface CharacterSelectionMachineInterface {
  dispatch(intent: CharacterSelectionIntent): void;
  getSnapshot(): CharacterSelectionSnapshot;
  subscribe(listener: (snapshot: CharacterSelectionSnapshot) => void): () => void;
  dispose(): void;
}

export type SelectionPreference = Readonly<{
  characterId: string;
  nick: string;
}>;

export interface SelectionPreferenceStore {
  has(journey: SelectionJourney): boolean;
  read(journey: SelectionJourney): SelectionPreference;
  write(journey: SelectionJourney, preference: SelectionPreference): void;
}

export type SelectionEntryRequest = Readonly<{
  journey: SelectionJourney;
  destination: SelectionDestination;
  requestId: string;
  characterId: string;
  nick: string;
}>;

export interface SelectionEntryAdapter {
  enter(request: SelectionEntryRequest, signal: AbortSignal): Promise<void>;
}

export function normalizeSelectionNick(value: string):
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; message: string }> {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 16) {
    return Object.freeze({ ok: false, message: "Use de 3 a 16 caracteres." });
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(normalized)) {
    return Object.freeze({ ok: false, message: "Use letras, números, espaço, hífen ou underscore." });
  }
  return Object.freeze({ ok: true, value: normalized });
}

export function isCanonicalCharacter(characterId: string): boolean {
  return CANONICAL_CHARACTER_CATALOG.some((character) => character.id === characterId);
}

export function defaultSelectionPreference(): SelectionPreference {
  const firstCharacter = CANONICAL_CHARACTER_CATALOG[0];
  if (!firstCharacter) throw new Error("The approved character catalog cannot be empty");
  return Object.freeze({ characterId: firstCharacter.id, nick: "Visitante" });
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
