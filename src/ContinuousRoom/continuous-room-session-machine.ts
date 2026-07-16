import type { OnlineInputState } from "../NetCode/protocol";
import {
  BrowserContinuousRoomCredentialStore,
  ContinuousRoomCanaryClient,
  FetchContinuousRoomCommandTransport,
} from "./continuous-room-canary-client";
import type { ContinuousRoomCanarySnapshot } from "./continuous-room-canary-contract";

export type ContinuousRoomSessionIntent =
  | Readonly<{ type: "continuous-room-retry" }>
  | Readonly<{ type: "continuous-room-leave" }>
  | Readonly<{ type: "continuous-room-input"; input: OnlineInputState }>;

export type ContinuousRoomSessionSnapshot = Readonly<{
  screen: "continuous-room";
  route: string;
  roomId: string;
  status: "recovering" | "preparing" | "round" | "result" | "compensating" | "failed" | "cancelled";
  authority: ContinuousRoomCanarySnapshot | null;
  label: string;
  errorMessage: string | null;
}>;

export interface ContinuousRoomSessionClient {
  recover(): Promise<ContinuousRoomCanarySnapshot>;
  input(inputSeq: number, input: OnlineInputState): Promise<ContinuousRoomCanarySnapshot>;
  observe(): Promise<ContinuousRoomCanarySnapshot>;
  leave(): Promise<ContinuousRoomCanarySnapshot>;
}

export class ContinuousRoomSessionMachine {
  private snapshot: ContinuousRoomSessionSnapshot;
  private readonly listeners = new Set<(snapshot: ContinuousRoomSessionSnapshot) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inputQueue: Promise<void> = Promise.resolve();
  private inputSeq = 0;
  private epoch = 0;
  private disposed = false;

  constructor(
    private readonly roomId: string,
    private readonly client: ContinuousRoomSessionClient = new ContinuousRoomCanaryClient(
      new FetchContinuousRoomCommandTransport(),
      new BrowserContinuousRoomCredentialStore(),
    ),
    private readonly clock: Readonly<{ now(): number }> = { now: () => Date.now() },
  ) {
    this.snapshot = Object.freeze({
      screen: "continuous-room",
      route: `/sala/${roomId}`,
      roomId,
      status: "recovering",
      authority: null,
      label: "Recuperando Sala contínua…",
      errorMessage: null,
    });
    void this.recover();
  }

  dispatch(intent: ContinuousRoomSessionIntent): void {
    if (this.disposed) return;
    if (intent.type === "continuous-room-retry") {
      void this.recover();
      return;
    }
    if (intent.type === "continuous-room-leave") {
      void this.leave();
      return;
    }
    if (intent.type === "continuous-room-input" && (this.snapshot.status === "preparing" || this.snapshot.status === "round")) {
      this.inputQueue = this.inputQueue.then(() => this.sendInput(intent.input));
    }
  }

  getSnapshot(): ContinuousRoomSessionSnapshot { return this.snapshot; }

  subscribe(listener: (snapshot: ContinuousRoomSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private async recover(): Promise<void> {
    const epoch = ++this.epoch;
    this.update({ ...this.snapshot, status: "recovering", label: "Recuperando Sala contínua…", errorMessage: null });
    try {
      const authority = await this.client.recover();
      if (!this.isCurrent(epoch) || authority.roomId !== this.roomId) return this.fail("A Sala recuperada não corresponde a esta rota.");
      this.inputSeq = authority.acceptedInputSeq;
      this.applyAuthority(authority);
    } catch {
      if (this.isCurrent(epoch)) this.fail("Não foi possível recuperar a Sala. O token não foi exposto nem repetido.");
    }
  }

  private async sendInput(input: OnlineInputState): Promise<void> {
    const epoch = this.epoch;
    try {
      const authority = await this.client.input(this.inputSeq + 1, input);
      if (!this.isCurrent(epoch)) return;
      this.inputSeq = authority.acceptedInputSeq;
      this.applyAuthority(authority);
    } catch {
      if (this.isCurrent(epoch)) this.fail("O input não foi confirmado pela revisão autoritativa.");
    }
  }

  private async observe(): Promise<void> {
    const epoch = this.epoch;
    if (this.snapshot.status === "preparing"
      && (this.snapshot.authority?.preparationDeadlineMs ?? Number.POSITIVE_INFINITY) <= this.clock.now()) {
      this.update({ ...this.snapshot, status: "round", label: "Rodada em curso — autoridade simulando…" });
    }
    try {
      const authority = await this.client.observe();
      if (this.isCurrent(epoch)) this.applyAuthority(authority);
    } catch {
      if (this.isCurrent(epoch)) this.fail("A Rodada não pôde ser observada com segurança.");
    }
  }

  private async leave(): Promise<void> {
    const epoch = ++this.epoch;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ ...this.snapshot, status: "compensating", label: "Desfazendo entrada na Sala…", errorMessage: null });
    try {
      const authority = await this.client.leave();
      if (!this.isCurrent(epoch)) return;
      this.update({ ...this.snapshot, status: "cancelled", authority, label: "Entrada desfeita. Nenhuma Sala ficou invisível." });
    } catch {
      if (this.isCurrent(epoch)) this.fail("Não foi possível confirmar a saída; tente novamente antes de navegar.");
    }
  }

  private applyAuthority(authority: ContinuousRoomCanarySnapshot): void {
    this.inputSeq = Math.max(this.inputSeq, authority.acceptedInputSeq);
    const status = authority.state === "preparing" ? "preparing"
      : authority.state === "round" ? "round"
        : authority.state === "result" ? "result"
          : authority.state === "cancelled" ? "cancelled"
            : authority.state === "compensating" ? "compensating"
              : "failed";
    const label = status === "preparing" ? "A primeira rodada começa em 5…"
      : status === "round" ? "Rodada em curso"
        : status === "result" ? "Resultado autoritativo da primeira Rodada"
          : status === "cancelled" ? "Entrada desfeita"
            : status === "compensating" ? "Desfazendo entrada na Sala…"
              : "A Sala falhou de modo seguro";
    this.update({ ...this.snapshot, status, authority, label, errorMessage: status === "failed" ? "A autoridade rejeitou a Rodada." : null });
    if (status === "preparing") this.scheduleObserve(authority.preparationDeadlineMs ?? this.clock.now());
  }

  private scheduleObserve(deadlineMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, Math.min(250, deadlineMs - this.clock.now()));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.observe();
    }, delay);
  }

  private fail(message: string): void {
    this.update({ ...this.snapshot, status: "failed", label: "Falha ao recuperar a Sala", errorMessage: message });
  }

  private isCurrent(epoch: number): boolean { return !this.disposed && epoch === this.epoch; }

  private update(snapshot: ContinuousRoomSessionSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export function parseContinuousRoomRoute(pathname: string): string | null {
  const match = /^\/sala\/([A-Za-z0-9_-]{8,128})$/.exec(pathname);
  return match?.[1] ?? null;
}
