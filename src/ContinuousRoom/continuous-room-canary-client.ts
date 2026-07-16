import type { OnlineInputState } from "../NetCode/protocol";
import {
  CONTINUOUS_ROOM_CANARY_PROTOCOL,
  CONTINUOUS_ROOM_CANARY_ROUTE,
  isContinuousRoomCanarySnapshot,
  type ContinuousRoomCanaryCommand,
  type ContinuousRoomCanaryResponse,
  type ContinuousRoomCanarySnapshot,
} from "./continuous-room-canary-contract";
import { sha256RecoveryToken } from "./continuous-room-recovery-token";

const CREDENTIALS_KEY = "bomba-pvp:continuous-room-canary:v1:credentials";

export type ContinuousRoomCredentials = Readonly<{
  operationId: string;
  sessionId: string;
  roomId: string;
  serverRevision: number;
  recoveryToken: string;
}>;

export type ContinuousRoomEntryRequest = Readonly<{
  operationId: string;
  characterId: string;
  nick: string;
  signal: AbortSignal;
  onProgress?: (progress: Readonly<{ phase: "preparing" | "compensating"; label: string }>) => void;
}>;

export interface ContinuousRoomCommandTransport {
  send(command: ContinuousRoomCanaryCommand): Promise<ContinuousRoomCanaryResponse>;
}

export interface ContinuousRoomCredentialStore {
  read(): ContinuousRoomCredentials | null;
  write(credentials: ContinuousRoomCredentials): void;
  clear(): void;
}

export class ContinuousRoomCanaryClient {
  private snapshot: ContinuousRoomCanarySnapshot | null = null;
  private commandSequence = 0;

  constructor(
    private readonly transport: ContinuousRoomCommandTransport,
    private readonly credentials: ContinuousRoomCredentialStore,
    private readonly tokens: Readonly<{ create(): string }> = defaultTokens(),
  ) {}

  async enter(request: ContinuousRoomEntryRequest): Promise<ContinuousRoomCanarySnapshot> {
    const recoveryToken = this.tokens.create();
    const recoveryProofHash = await sha256RecoveryToken(recoveryToken);
    const prepared = await this.command({
      operationId: request.operationId,
      expectedServerRevision: 0,
      type: "prepare-entry",
      characterId: request.characterId,
      nick: request.nick,
    });
    if (request.signal.aborted) {
      await this.cancelPrepared(prepared, request);
      throw abortError();
    }
    request.onProgress?.({ phase: "preparing", label: "Criando nova sala…" });
    const committed = await this.command({
      operationId: request.operationId,
      expectedServerRevision: prepared.serverRevision,
      type: "commit-entry",
      recoveryProofHash,
    });
    if (!committed.sessionId || !committed.roomId) throw new Error("authority committed without opaque room identity");
    const credentials = Object.freeze({
      operationId: committed.operationId,
      sessionId: committed.sessionId,
      roomId: committed.roomId,
      serverRevision: committed.serverRevision,
      recoveryToken,
    });
    this.credentials.write(credentials);
    if (request.signal.aborted) {
      request.onProgress?.({ phase: "compensating", label: "Desfazendo entrada na Sala…" });
      await this.cancelCommitted(committed, request.operationId);
      this.credentials.clear();
      throw abortError();
    }
    return committed;
  }

  async recover(): Promise<ContinuousRoomCanarySnapshot> {
    const current = this.credentials.read();
    if (!current) throw new Error("continuous room credentials are unavailable");
    const nextToken = this.tokens.create();
    const recovered = await this.command({
      operationId: current.operationId,
      sessionId: current.sessionId,
      recoveryToken: current.recoveryToken,
      nextRecoveryProofHash: await sha256RecoveryToken(nextToken),
      expectedServerRevision: 0,
      type: "recover",
    });
    if (!recovered.sessionId || !recovered.roomId) throw new Error("recovery returned no active room");
    this.credentials.write(Object.freeze({
      operationId: recovered.operationId,
      sessionId: recovered.sessionId,
      roomId: recovered.roomId,
      serverRevision: recovered.serverRevision,
      recoveryToken: nextToken,
    }));
    return recovered;
  }

  async input(inputSeq: number, input: OnlineInputState): Promise<ContinuousRoomCanarySnapshot> {
    const current = this.requireCredentials();
    const snapshot = await this.command({
      operationId: current.operationId,
      sessionId: current.sessionId,
      expectedServerRevision: this.snapshot?.serverRevision ?? current.serverRevision,
      type: "input",
      inputSeq,
      input,
    });
    this.syncRevision(snapshot);
    return snapshot;
  }

  async observe(): Promise<ContinuousRoomCanarySnapshot> {
    const current = this.requireCredentials();
    const snapshot = await this.command({
      operationId: current.operationId,
      sessionId: current.sessionId,
      expectedServerRevision: this.snapshot?.serverRevision ?? current.serverRevision,
      type: "observe",
    });
    this.syncRevision(snapshot);
    return snapshot;
  }

  async leave(): Promise<ContinuousRoomCanarySnapshot> {
    const current = this.requireCredentials();
    const snapshot = await this.command({
      operationId: current.operationId,
      sessionId: current.sessionId,
      expectedServerRevision: this.snapshot?.serverRevision ?? current.serverRevision,
      type: "cancel-entry",
    });
    this.credentials.clear();
    return snapshot;
  }

  getSnapshot(): ContinuousRoomCanarySnapshot | null {
    return this.snapshot;
  }

  private async cancelPrepared(snapshot: ContinuousRoomCanarySnapshot, request: ContinuousRoomEntryRequest): Promise<void> {
    request.onProgress?.({ phase: "preparing", label: "Cancelando busca…" });
    await this.command({
      operationId: request.operationId,
      expectedServerRevision: snapshot.serverRevision,
      type: "cancel-entry",
    });
  }

  private async cancelCommitted(snapshot: ContinuousRoomCanarySnapshot, operationId: string): Promise<void> {
    await this.command({
      operationId,
      sessionId: snapshot.sessionId ?? undefined,
      expectedServerRevision: snapshot.serverRevision,
      type: "cancel-entry",
    });
  }

  private async command(
    command: Omit<ContinuousRoomCanaryCommand, "protocol" | "commandId">,
  ): Promise<ContinuousRoomCanarySnapshot> {
    const envelope: ContinuousRoomCanaryCommand = Object.freeze({
      protocol: CONTINUOUS_ROOM_CANARY_PROTOCOL,
      commandId: `cmd_${command.operationId}_${++this.commandSequence}_${crypto.randomUUID().replaceAll("-", "")}`,
      ...command,
    });
    const response = await this.transport.send(envelope);
    if (!response.ok) {
      if (response.snapshot) this.acceptSnapshot(response.snapshot, command.operationId);
      throw new ContinuousRoomClientError(response.code, response.message, response.snapshot);
    }
    this.acceptSnapshot(response.snapshot, command.operationId);
    return response.snapshot;
  }

  private acceptSnapshot(snapshot: ContinuousRoomCanarySnapshot, operationId: string): void {
    if (snapshot.operationId !== operationId) throw new Error("stale response belongs to a different operation");
    if (this.snapshot?.operationId === operationId && snapshot.serverRevision < this.snapshot.serverRevision) {
      throw new Error("stale response carries an older server revision");
    }
    this.snapshot = snapshot;
  }

  private requireCredentials(): ContinuousRoomCredentials {
    const credentials = this.credentials.read();
    if (!credentials) throw new Error("continuous room credentials are unavailable");
    return credentials;
  }

  private syncRevision(snapshot: ContinuousRoomCanarySnapshot): void {
    const current = this.credentials.read();
    if (!current || !snapshot.sessionId || !snapshot.roomId) return;
    this.credentials.write(Object.freeze({ ...current, serverRevision: snapshot.serverRevision }));
  }
}

export class FetchContinuousRoomCommandTransport implements ContinuousRoomCommandTransport {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly route: string = CONTINUOUS_ROOM_CANARY_ROUTE,
  ) {}

  async send(command: ContinuousRoomCanaryCommand): Promise<ContinuousRoomCanaryResponse> {
    const response = await this.fetcher(this.route, {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      credentials: "same-origin",
      body: JSON.stringify(command),
    });
    const payload: unknown = await response.json();
    if (!isResponse(payload)) throw new Error("continuous room authority returned an invalid envelope");
    return payload;
  }
}

export class BrowserContinuousRoomCredentialStore implements ContinuousRoomCredentialStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.sessionStorage) {}

  read(): ContinuousRoomCredentials | null {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(CREDENTIALS_KEY) ?? "null");
      return isCredentials(value) ? Object.freeze({ ...value }) : null;
    } catch {
      return null;
    }
  }

  write(credentials: ContinuousRoomCredentials): void {
    try { this.storage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials)); } catch { /* fail closed on recovery */ }
  }

  clear(): void {
    try { this.storage.removeItem(CREDENTIALS_KEY); } catch { /* storage denial is already terminal */ }
  }
}

export class ContinuousRoomClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly snapshot: ContinuousRoomCanarySnapshot | null,
  ) {
    super(message);
    this.name = "ContinuousRoomClientError";
  }
}

function defaultTokens(): Readonly<{ create(): string }> {
  return Object.freeze({ create: () => `token_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}` });
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function isResponse(value: unknown): value is ContinuousRoomCanaryResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return typeof value.replayed === "boolean" && isContinuousRoomCanarySnapshot(value.snapshot);
  return typeof value.code === "string" && typeof value.message === "string"
    && (value.snapshot === null || isContinuousRoomCanarySnapshot(value.snapshot));
}

function isCredentials(value: unknown): value is ContinuousRoomCredentials {
  if (!isRecord(value)) return false;
  return typeof value.operationId === "string" && typeof value.sessionId === "string"
    && typeof value.roomId === "string" && Number.isInteger(value.serverRevision)
    && typeof value.recoveryToken === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
