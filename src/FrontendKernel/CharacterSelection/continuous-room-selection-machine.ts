import type {
  CharacterSelectionIntent,
  CharacterSelectionMachineInterface,
  CharacterSelectionSnapshot,
  SelectionEntryAdapter,
  SelectionPreferenceStore,
} from "./selection-contract";
import { SelectionMachineLifecycle } from "./selection-machine-lifecycle";

export class ContinuousRoomSelectionMachine implements CharacterSelectionMachineInterface {
  private readonly lifecycle: SelectionMachineLifecycle;

  constructor(preferences: SelectionPreferenceStore, entry: SelectionEntryAdapter) {
    this.lifecycle = new SelectionMachineLifecycle({
      journey: "continuous-room",
      route: "/jogar/personagem",
      destination: "/game/play",
      title: "Escolha para a Sala contínua",
      actionLabel: "Continuar",
      pendingLabel: "Procurando próxima sala…",
      errorMessage: "Não entramos em nenhuma sala. Sua escolha foi preservada.",
    }, preferences, entry);
  }

  dispatch(intent: CharacterSelectionIntent): void {
    this.lifecycle.dispatch(intent);
  }

  getSnapshot(): CharacterSelectionSnapshot {
    return this.lifecycle.getSnapshot();
  }

  subscribe(listener: (snapshot: CharacterSelectionSnapshot) => void): () => void {
    return this.lifecycle.subscribe(listener);
  }

  dispose(): void {
    this.lifecycle.dispose();
  }
}
