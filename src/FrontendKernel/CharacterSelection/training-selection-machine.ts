import type {
  CharacterSelectionIntent,
  CharacterSelectionMachineInterface,
  CharacterSelectionSnapshot,
  SelectionEntryAdapter,
  SelectionPreferenceStore,
} from "./selection-contract";
import { SelectionMachineLifecycle } from "./selection-machine-lifecycle";

export class TrainingSelectionMachine implements CharacterSelectionMachineInterface {
  private readonly lifecycle: SelectionMachineLifecycle;

  constructor(preferences: SelectionPreferenceStore, entry: SelectionEntryAdapter) {
    this.lifecycle = new SelectionMachineLifecycle({
      journey: "training",
      route: "/treino/personagem",
      destination: "/game/training",
      title: "Escolha para o Treino contra bots",
      actionLabel: "Iniciar treino",
      pendingLabel: "Preparando treino…",
      errorMessage: "O treino não iniciou. Sua escolha foi preservada.",
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
