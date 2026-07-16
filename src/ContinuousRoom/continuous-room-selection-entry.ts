import type { SelectionEntryAdapter, SelectionEntryRequest } from "../FrontendKernel/CharacterSelection/selection-contract";
import {
  BrowserContinuousRoomCredentialStore,
  ContinuousRoomCanaryClient,
  FetchContinuousRoomCommandTransport,
} from "./continuous-room-canary-client";
import type { ContinuousRoomRollout } from "./continuous-room-rollout";

export class BrowserRolloutSelectionEntryAdapter implements SelectionEntryAdapter {
  constructor(
    private readonly rollout: ContinuousRoomRollout,
    private readonly fallback: SelectionEntryAdapter,
    private readonly client: ContinuousRoomCanaryClient = new ContinuousRoomCanaryClient(
      new FetchContinuousRoomCommandTransport(),
      new BrowserContinuousRoomCredentialStore(),
    ),
    private readonly navigator: { assign(destination: string): void } = window.location,
    private readonly operationIds: Readonly<{ create(): string }> = defaultOperationIds(),
  ) {}

  waitForCancellation(journey: SelectionEntryRequest["journey"]): boolean {
    return journey === "continuous-room" && this.rollout !== "off";
  }

  async enter(request: SelectionEntryRequest, signal: AbortSignal): Promise<void> {
    if (request.journey !== "continuous-room" || this.rollout === "off") {
      return this.fallback.enter(request, signal);
    }
    const snapshot = await this.client.enter({
      operationId: this.operationIds.create(),
      characterId: request.characterId,
      nick: request.nick,
      signal,
      onProgress: (progress) => request.onProgress?.(progress.label),
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!snapshot.roomId) throw new Error("continuous room authority did not commit a room");
    this.navigator.assign(`/sala/${encodeURIComponent(snapshot.roomId)}`);
  }
}

function defaultOperationIds(): Readonly<{ create(): string }> {
  return Object.freeze({ create: () => `operation_${crypto.randomUUID().replaceAll("-", "")}` });
}
