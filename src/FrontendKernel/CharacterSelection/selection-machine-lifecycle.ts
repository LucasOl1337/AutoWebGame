import {
  CANONICAL_CHARACTER_CATALOG,
  isAbortError,
  isCanonicalCharacter,
  normalizeSelectionNick,
  type CharacterSelectionIntent,
  type CharacterSelectionMachineInterface,
  type CharacterSelectionSnapshot,
  type SelectionDestination,
  type SelectionEntryAdapter,
  type SelectionJourney,
  type SelectionPreferenceStore,
  type SelectionRoute,
} from "./selection-contract";

export type SelectionJourneyDefinition = Readonly<{
  journey: SelectionJourney;
  route: SelectionRoute;
  destination: SelectionDestination;
  title: string;
  actionLabel: string;
  pendingLabel: string;
  errorMessage: string;
}>;

export class SelectionMachineLifecycle implements CharacterSelectionMachineInterface {
  private snapshot: CharacterSelectionSnapshot;
  private readonly listeners = new Set<(snapshot: CharacterSelectionSnapshot) => void>();
  private requestEpoch = 0;
  private requestSequence = 0;
  private activeRequest: AbortController | null = null;
  private disposed = false;

  constructor(
    private readonly definition: SelectionJourneyDefinition,
    private readonly preferences: SelectionPreferenceStore,
    private readonly entry: SelectionEntryAdapter,
  ) {
    const recovered = preferences.read(definition.journey);
    this.snapshot = this.createSnapshot({
      selectedCharacterId: isCanonicalCharacter(recovered.characterId)
        ? recovered.characterId
        : CANONICAL_CHARACTER_CATALOG[0].id,
      nick: recovered.nick,
    });
  }

  dispatch(intent: CharacterSelectionIntent): void {
    if (this.disposed || this.snapshot.status === "completed") return;
    if (intent.type === "cancel-selection") {
      this.cancel();
      return;
    }
    if (this.snapshot.status === "pending") return;
    if (intent.type === "choose-character") {
      if (!isCanonicalCharacter(intent.characterId)) return;
      const next = this.createSnapshot({ selectedCharacterId: intent.characterId, nick: this.snapshot.nick });
      this.persistRecoverableChoice(next);
      this.update(next);
      return;
    }
    if (intent.type === "edit-selection-nick") {
      const next = this.createSnapshot({
        selectedCharacterId: this.snapshot.selectedCharacterId,
        nick: intent.value.slice(0, 32),
      });
      this.persistRecoverableChoice(next);
      this.update(next);
      return;
    }
    if (intent.type === "confirm-selection" && this.snapshot.status === "choosing") {
      this.startEntry();
      return;
    }
    if (intent.type === "retry-selection" && this.snapshot.status === "error") {
      this.startEntry();
    }
  }

  getSnapshot(): CharacterSelectionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: CharacterSelectionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requestEpoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.listeners.clear();
  }

  private startEntry(): void {
    const nick = normalizeSelectionNick(this.snapshot.nick);
    if (!nick.ok) {
      this.update(this.createSnapshot({
        selectedCharacterId: this.snapshot.selectedCharacterId,
        nick: this.snapshot.nick,
        validationMessage: nick.message,
        focusTarget: "error",
      }));
      return;
    }
    this.preferences.write(this.definition.journey, {
      characterId: this.snapshot.selectedCharacterId,
      nick: nick.value,
    });
    const epoch = ++this.requestEpoch;
    const requestId = `${this.definition.journey}-${++this.requestSequence}`;
    const controller = new AbortController();
    this.activeRequest = controller;
    this.update(this.createSnapshot({
      selectedCharacterId: this.snapshot.selectedCharacterId,
      nick: nick.value,
      status: "pending",
      operation: Object.freeze({ requestId, label: this.definition.pendingLabel }),
    }));
    void this.entry.enter({
      journey: this.definition.journey,
      destination: this.definition.destination,
      requestId,
      characterId: this.snapshot.selectedCharacterId,
      nick: nick.value,
    }, controller.signal).then(() => {
      if (!this.isCurrent(epoch, controller)) return;
      this.activeRequest = null;
      this.update(this.createSnapshot({
        selectedCharacterId: this.snapshot.selectedCharacterId,
        nick: this.snapshot.nick,
        status: "completed",
      }));
    }).catch((error: unknown) => {
      if (!this.isCurrent(epoch, controller) || isAbortError(error)) return;
      this.activeRequest = null;
      this.update(this.createSnapshot({
        selectedCharacterId: this.snapshot.selectedCharacterId,
        nick: this.snapshot.nick,
        status: "error",
        errorMessage: this.definition.errorMessage,
        focusTarget: "error",
      }));
    });
  }

  private cancel(): void {
    if (this.snapshot.status !== "pending") return;
    this.requestEpoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.update(this.createSnapshot({
      selectedCharacterId: this.snapshot.selectedCharacterId,
      nick: this.snapshot.nick,
      focusTarget: "confirm",
    }));
  }

  private isCurrent(epoch: number, controller: AbortController): boolean {
    return !this.disposed && !controller.signal.aborted && epoch === this.requestEpoch;
  }

  private persistRecoverableChoice(snapshot: CharacterSelectionSnapshot): void {
    const nick = normalizeSelectionNick(snapshot.nick);
    if (!nick.ok) return;
    this.preferences.write(this.definition.journey, {
      characterId: snapshot.selectedCharacterId,
      nick: nick.value,
    });
  }

  private createSnapshot(overrides: Partial<CharacterSelectionSnapshot>): CharacterSelectionSnapshot {
    return Object.freeze({
      screen: "character-selection",
      journey: this.definition.journey,
      route: this.definition.route,
      title: this.definition.title,
      actionLabel: this.definition.actionLabel,
      status: "choosing",
      roster: CANONICAL_CHARACTER_CATALOG,
      selectedCharacterId: CANONICAL_CHARACTER_CATALOG[0].id,
      nick: "Visitante",
      operation: null,
      errorMessage: null,
      validationMessage: null,
      focusTarget: null,
      ...overrides,
    });
  }

  private update(next: CharacterSelectionSnapshot): void {
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener(next));
  }
}
