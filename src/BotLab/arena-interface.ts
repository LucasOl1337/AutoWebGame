import {
  createActionRegistry,
  immutableSnapshot,
  type ArenaActionRegistry,
} from "./action-registry";

export type RunState =
  | "accepted"
  | "queued"
  | "running"
  | "candidate-frozen"
  | "holdout-running"
  | "paused"
  | "evaluating"
  | "completed"
  | "failed"
  | "cancelled";

export type PolicyFamily = "deterministic" | "preset" | "model" | "hybrid";

export type Sha256Hash = `sha256:${string}`;
const SHA256_HASH_RE = /^sha256:[0-9a-f]{64}$/;

export interface ArenaPrincipal {
  readonly actorId: string;
  readonly sessionIdHash: Sha256Hash;
  readonly permissions: readonly string[];
}

export interface IssuedPromotionChallenge {
  readonly challengeId: string;
  readonly canonicalCommandHash: Sha256Hash;
  readonly nonce: string;
  readonly expiresAt: string;
}

export interface PromotionChallengeRecord {
  readonly challengeId: string;
  readonly canonicalCommandHash: Sha256Hash;
  readonly nonceHash: Sha256Hash;
  readonly actorId: string;
  readonly sessionIdHash: Sha256Hash;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export interface PromotionAuthorizer {
  issueChallenge(input: {
    readonly principal: ArenaPrincipal;
    readonly canonicalCommandHash: Sha256Hash;
    readonly expiresInMs: number;
  }): Promise<{ readonly issued: IssuedPromotionChallenge; readonly record: PromotionChallengeRecord }>;
  consumeChallenge(input: {
    readonly principal: ArenaPrincipal;
    readonly challengeId: string;
    readonly nonce: string;
    readonly canonicalCommandHash: Sha256Hash;
  }): Promise<
    | { readonly authorized: true; readonly actorId: string; readonly consumedAt: string }
    | { readonly authorized: false; readonly reasonCode: string }
  >;
}

export interface ArenaExecutionContext {
  readonly requestId: string;
  readonly principal: ArenaPrincipal | null;
  readonly promotionAuthorizer: PromotionAuthorizer;
}

export type ArenaCommand =
  | {
      readonly action: "arena.experiment.start";
      readonly idempotencyKey: string;
      readonly spec: Readonly<Record<string, unknown>>;
    }
  | {
      readonly action: "arena.run.pause";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly expectedState: "running" | "holdout-running";
    }
  | {
      readonly action: "arena.run.resume";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly expectedState: "paused";
    }
  | {
      readonly action: "arena.run.cancel";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly expectedState: RunState;
      readonly reason: string;
    }
  | {
      readonly action: "arena.evaluation.request";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly evidenceManifestHash: string;
    }
  | {
      readonly action: "arena.promotion.challenge.issue";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly candidateGenomeId: string;
      readonly evaluationHash: string;
      readonly expectedCurrentGenomeId: string | null;
    }
  | {
      readonly action: "arena.candidate.promote";
      readonly idempotencyKey: string;
      readonly runId: string;
      readonly candidateGenomeId: string;
      readonly evaluationHash: string;
      readonly expectedCurrentGenomeId: string | null;
      readonly adminChallengeId: string;
      readonly adminChallengeNonce: string;
    };

export interface ArenaError {
  readonly code: string;
  readonly category: "validation" | "conflict" | "infrastructure" | "evidence" | "budget" | "authorization";
  readonly message: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly causeReceiptId: string | null;
}

export interface ArenaReceipt {
  readonly receiptId: string;
  readonly action: string;
  readonly idempotencyKey: string;
  readonly status: "accepted" | "rejected";
  readonly acceptedAt: string;
  readonly runId: string | null;
  readonly stateBefore: RunState | null;
  readonly stateAfter: RunState | null;
  readonly resourceHash: string | null;
  readonly result: { readonly promotionChallenge?: IssuedPromotionChallenge } | null;
  readonly error: ArenaError | null;
}

export interface ArenaHandlerSuccess {
  readonly ok: true;
  readonly runId: string | null;
  readonly stateBefore: RunState | null;
  readonly stateAfter: RunState | null;
  readonly resourceHash: string | null;
}

export interface ArenaHandlerRejection {
  readonly ok: false;
  readonly runId?: string | null;
  readonly stateBefore?: RunState | null;
  readonly stateAfter?: RunState | null;
  readonly resourceHash?: string | null;
  readonly error: ArenaError;
}

export type ArenaHandlerResult = ArenaHandlerSuccess | ArenaHandlerRejection;

export interface ArenaHandlerContext {
  readonly receiptId: string;
  readonly acceptedAt: string;
  readonly requestId: string;
  readonly principal: ArenaPrincipal;
}

export type ArenaActionHandler<C extends ArenaCommand = ArenaCommand> = (
  command: C,
  context: ArenaHandlerContext,
) => ArenaHandlerResult | Promise<ArenaHandlerResult>;

export type ArenaActionHandlers = {
  [Action in ArenaCommand["action"]]: ArenaActionHandler<Extract<ArenaCommand, { action: Action }>>;
};

export interface ArenaActionDescriptor {
  readonly id: ArenaCommand["action"];
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly allowedStates: readonly (RunState | "none")[];
  readonly readOnly: false;
  readonly destructive: boolean;
  readonly disruptive: boolean;
  readonly requiresHumanConfirmation: boolean;
  readonly confirmationMechanism: "none" | "admin-session-challenge-v0.1";
  readonly requiredPermission: string;
  readonly errorCodes: readonly string[];
  readonly errorRetryability: Readonly<Record<string, boolean>>;
  readonly contractVersion: "botevolutionarena.v0.1";
  readonly idempotency: {
    readonly keyField: "idempotencyKey";
    readonly samePayloadReturnsOriginalReceipt: true;
  };
  readonly optimisticConcurrencyFields: readonly string[];
  readonly example: Readonly<Record<string, unknown>>;
}

export interface AdapterRuntimeState {
  readonly adapterId: string;
  readonly version: string;
  readonly family: PolicyFamily;
  readonly configured: boolean;
  readonly verified: boolean;
  readonly executed: boolean;
  readonly healthy: boolean;
  readonly lastProbeAt: string | null;
  readonly lastExecutionAt: string | null;
  readonly consumedGenePaths: readonly string[];
  readonly supportedActions: readonly string[];
  readonly effectiveIdentities: readonly { readonly provider: string; readonly model: string }[];
  readonly reason: string | null;
}

export interface AdapterDescriptor extends AdapterRuntimeState {
  readonly status: "configured" | "verified" | "unhealthy" | "unavailable";
}

export interface ArenaDescriptor {
  readonly schemaVersion: "botevolutionarena.v0.1";
  readonly implementationVersion: string;
  readonly capabilities: {
    readonly policyFamilies: readonly PolicyFamily[];
    readonly adapters: readonly AdapterDescriptor[];
    readonly actions: readonly ArenaActionDescriptor[];
    readonly artifactRoot: string;
    readonly limits: Readonly<Record<string, number>>;
    readonly limitations: readonly string[];
  };
  readonly health: {
    readonly status: "ready" | "degraded" | "unavailable";
    readonly checkedAt: string;
    readonly reasons: readonly string[];
  };
}

export type ArenaQuery =
  | { readonly view: "arena.status" }
  | { readonly view: "experiment"; readonly experimentId: string }
  | { readonly view: "run"; readonly runId: string }
  | { readonly view: "evidence"; readonly runId: string; readonly cursor?: string; readonly limit?: number }
  | { readonly view: "evaluation"; readonly runId: string }
  | { readonly view: "processes"; readonly runId: string };

export type ArenaView =
  | { readonly kind: "arena.status"; readonly descriptor: ArenaDescriptor }
  | { readonly kind: "experiment"; readonly data: unknown }
  | { readonly kind: "run"; readonly data: unknown }
  | { readonly kind: "evidence"; readonly data: unknown }
  | { readonly kind: "evaluation"; readonly data: unknown }
  | { readonly kind: "processes"; readonly data: unknown }
  | { readonly kind: "error"; readonly error: ArenaError };

export interface BotEvolutionArena {
  describe(): Promise<ArenaDescriptor>;
  execute(command: ArenaCommand, context: ArenaExecutionContext): Promise<ArenaReceipt>;
  observe(query: ArenaQuery): Promise<ArenaView>;
}

export interface BotEvolutionArenaDependencies {
  readonly implementationVersion: string;
  readonly policyFamilies: readonly PolicyFamily[];
  readonly adapters: readonly AdapterRuntimeState[];
  readonly artifactRoot: string;
  readonly limits: Readonly<Record<string, number>>;
  readonly handlers: Partial<ArenaActionHandlers>;
  readonly now: () => string;
  readonly nextReceiptId: () => string;
  readonly readView?: (query: Exclude<ArenaQuery, { view: "arena.status" }>) => ArenaView | Promise<ArenaView>;
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly receipt: Promise<ArenaReceipt>;
}

const promotionChallengeLifetimeMs = 5 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createError(
  code: string,
  category: ArenaError["category"],
  message: string,
  retryable: boolean,
  details: ArenaError["details"] = {},
  causeReceiptId: string | null = null,
): ArenaError {
  return immutableSnapshot({ code, category, message, retryable, details, causeReceiptId });
}

export function arenaError(
  code: string,
  category: ArenaError["category"],
  message: string,
  options: {
    readonly retryable?: boolean;
    readonly details?: ArenaError["details"];
    readonly causeReceiptId?: string | null;
  } = {},
): ArenaError {
  return createError(
    code,
    category,
    message,
    options.retryable ?? false,
    options.details ?? {},
    options.causeReceiptId ?? null,
  );
}

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in command");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("Cyclic command payload");
    ancestors.add(value);
    const result = `[${value.map((item) => canonicalize(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) throw new Error("Cyclic command payload");
    ancestors.add(value);
    const result = `{${Object.keys(value).sort().map((key) => {
      const nestedValue = value[key];
      if (nestedValue === undefined) throw new Error("Undefined command field");
      return `${JSON.stringify(key)}:${canonicalize(nestedValue, ancestors)}`;
    }).join(",")}}`;
    ancestors.delete(value);
    return result;
  }
  throw new Error("Command must contain JSON-compatible values");
}

function adapterDescriptor(state: AdapterRuntimeState): AdapterDescriptor {
  const verified = state.configured
    && state.healthy
    && state.verified
    && state.lastProbeAt !== null;
  const executed = state.executed && state.lastExecutionAt !== null;
  const status = !state.configured
    ? "unavailable"
    : !state.healthy
      ? "unhealthy"
      : verified
        ? "verified"
        : "configured";
  return {
    ...state,
    verified,
    executed,
    status,
    effectiveIdentities: verified ? state.effectiveIdentities : [],
  };
}

function descriptorFrom(
  dependencies: BotEvolutionArenaDependencies,
  registry: ArenaActionRegistry,
): ArenaDescriptor {
  const adapters = dependencies.adapters.map(adapterDescriptor);
  const hasVerifiedAdapter = adapters.some((adapter) => adapter.status === "verified");
  const hasConfiguredAdapter = adapters.some((adapter) => adapter.configured);
  const hasExecutableActions = registry.descriptors().length > 0;
  const limitations = ["volatile_idempotency", "audit_sink_not_bound"];
  const status = !hasExecutableActions
    ? "unavailable"
    : hasVerifiedAdapter
      ? "degraded"
      : hasConfiguredAdapter
        ? "degraded"
        : "unavailable";
  const reasons = adapters
    .filter((adapter) => adapter.status !== "verified")
    .map((adapter) => adapter.reason ?? `${adapter.adapterId}:${adapter.status}`);
  if (!hasExecutableActions) reasons.push("no_executable_actions");
  reasons.push(...limitations);

  return immutableSnapshot({
    schemaVersion: "botevolutionarena.v0.1",
    implementationVersion: dependencies.implementationVersion,
    capabilities: {
      policyFamilies: dependencies.policyFamilies,
      adapters,
      actions: registry.descriptors(),
      artifactRoot: dependencies.artifactRoot,
      limits: dependencies.limits,
      limitations,
    },
    health: {
      status,
      checkedAt: dependencies.now(),
      reasons,
    },
  });
}

function rejectedReceipt(
  dependencies: BotEvolutionArenaDependencies,
  action: string,
  idempotencyKey: string,
  error: ArenaError,
): ArenaReceipt {
  return immutableSnapshot({
    receiptId: dependencies.nextReceiptId(),
    action,
    idempotencyKey,
    status: "rejected",
    acceptedAt: dependencies.now(),
    runId: null,
    stateBefore: null,
    stateAfter: null,
    resourceHash: null,
    result: null,
    error,
  });
}

function trustedPrincipal(context: unknown): ArenaPrincipal | null {
  if (!isRecord(context) || !isRecord(context.principal)) return null;
  const principal = context.principal;
  if (typeof principal.actorId !== "string"
    || principal.actorId.length === 0
    || typeof principal.sessionIdHash !== "string"
    || !SHA256_HASH_RE.test(principal.sessionIdHash)
    || !Array.isArray(principal.permissions)
    || !principal.permissions.every((permission) => typeof permission === "string")) {
    return null;
  }
  return immutableSnapshot({
    actorId: principal.actorId,
    sessionIdHash: principal.sessionIdHash as Sha256Hash,
    permissions: principal.permissions,
  });
}

function hasPromotionAuthorizer(context: unknown): context is ArenaExecutionContext {
  return isRecord(context)
    && typeof context.requestId === "string"
    && context.requestId.length > 0
    && isRecord(context.promotionAuthorizer)
    && typeof context.promotionAuthorizer.issueChallenge === "function"
    && typeof context.promotionAuthorizer.consumeChallenge === "function";
}

async function sha256(value: string): Promise<Sha256Hash> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

type PromotionTargetCommand = Extract<
  ArenaCommand,
  { action: "arena.promotion.challenge.issue" | "arena.candidate.promote" }
>;

async function canonicalPromotionCommandHash(
  command: PromotionTargetCommand,
  principal: ArenaPrincipal,
): Promise<Sha256Hash> {
  return sha256(canonicalize({
    action: "arena.candidate.promote",
    runId: command.runId,
    candidateGenomeId: command.candidateGenomeId,
    evaluationHash: command.evaluationHash,
    expectedCurrentGenomeId: command.expectedCurrentGenomeId,
    actorId: principal.actorId,
  }));
}

function authorizationReceipt(
  receiptId: string,
  acceptedAt: string,
  command: ArenaCommand,
  error: ArenaError,
): ArenaReceipt {
  return immutableSnapshot({
    receiptId,
    action: command.action,
    idempotencyKey: command.idempotencyKey,
    status: "rejected",
    acceptedAt,
    runId: "runId" in command ? command.runId : null,
    stateBefore: null,
    stateAfter: null,
    resourceHash: null,
    result: null,
    error,
  });
}

export function createBotEvolutionArena(dependencies: BotEvolutionArenaDependencies): BotEvolutionArena {
  const registry = createActionRegistry(dependencies.handlers);
  const idempotency = new Map<string, IdempotencyRecord>();

  const executeHandler = async (
    command: ArenaCommand,
    handler: ArenaActionHandler,
    receiptId: string,
    acceptedAt: string,
    context: ArenaExecutionContext,
    principal: ArenaPrincipal,
    receiptResult: ArenaReceipt["result"] = null,
  ): Promise<ArenaReceipt> => {
    try {
      const result = await handler(command, {
        receiptId,
        acceptedAt,
        requestId: context.requestId,
        principal,
      });
      if (!result.ok) {
        return immutableSnapshot({
          receiptId,
          action: command.action,
          idempotencyKey: command.idempotencyKey,
          status: "rejected",
          acceptedAt,
          runId: result.runId ?? null,
          stateBefore: result.stateBefore ?? null,
          stateAfter: result.stateAfter ?? null,
          resourceHash: result.resourceHash ?? null,
          result: null,
          error: result.error,
        });
      }
      return immutableSnapshot({
        receiptId,
        action: command.action,
        idempotencyKey: command.idempotencyKey,
        status: "accepted",
        acceptedAt,
        runId: result.runId,
        stateBefore: result.stateBefore,
        stateAfter: result.stateAfter,
        resourceHash: result.resourceHash,
        result: receiptResult,
        error: null,
      });
    } catch (error) {
      return immutableSnapshot({
        receiptId,
        action: command.action,
        idempotencyKey: command.idempotencyKey,
        status: "rejected",
        acceptedAt,
        runId: null,
        stateBefore: null,
        stateAfter: null,
        resourceHash: null,
        result: null,
        error: createError(
          "handler_failed",
          "infrastructure",
          "The bound action handler failed without a domain response.",
          true,
          { errorType: error instanceof Error ? error.name : "unknown" },
          receiptId,
        ),
      });
    }
  };

  const dispatchAuthorized = async (
    command: ArenaCommand,
    entry: { readonly handler: ArenaActionHandler },
    receiptId: string,
    acceptedAt: string,
    context: ArenaExecutionContext,
    principal: ArenaPrincipal,
  ): Promise<ArenaReceipt> => {
    if (command.action === "arena.promotion.challenge.issue") {
      try {
        const canonicalCommandHash = await canonicalPromotionCommandHash(command, principal);
        const challenge = await context.promotionAuthorizer.issueChallenge({
          principal,
          canonicalCommandHash,
          expiresInMs: promotionChallengeLifetimeMs,
        });
        const issuedAtMs = Date.parse(challenge.record.issuedAt);
        const expiresAtMs = Date.parse(challenge.issued.expiresAt);
        const acceptedAtMs = Date.parse(acceptedAt);
        const nonceHash = await sha256(challenge.issued.nonce);
        if (challenge.issued.challengeId.length === 0
          || challenge.issued.nonce.length === 0
          || !SHA256_HASH_RE.test(challenge.issued.canonicalCommandHash)
          || !SHA256_HASH_RE.test(challenge.record.canonicalCommandHash)
          || !SHA256_HASH_RE.test(challenge.record.nonceHash)
          || challenge.issued.canonicalCommandHash !== canonicalCommandHash
          || challenge.record.canonicalCommandHash !== canonicalCommandHash
          || challenge.record.challengeId !== challenge.issued.challengeId
          || challenge.record.nonceHash !== nonceHash
          || challenge.record.actorId !== principal.actorId
          || challenge.record.sessionIdHash !== principal.sessionIdHash
          || challenge.record.expiresAt !== challenge.issued.expiresAt
          || !Number.isFinite(issuedAtMs)
          || !Number.isFinite(expiresAtMs)
          || !Number.isFinite(acceptedAtMs)
          || issuedAtMs > acceptedAtMs
          || expiresAtMs <= acceptedAtMs
          || expiresAtMs - issuedAtMs > promotionChallengeLifetimeMs
          || challenge.record.usedAt !== null) {
          return authorizationReceipt(
            receiptId,
            acceptedAt,
            command,
            createError(
              "promotion_challenge_issue_failed",
              "authorization",
              "Promotion authorizer returned an inconsistent challenge record.",
              true,
            ),
          );
        }
        return executeHandler(command, entry.handler, receiptId, acceptedAt, context, principal, {
          promotionChallenge: challenge.issued,
        });
      } catch (error) {
        return authorizationReceipt(
          receiptId,
          acceptedAt,
          command,
          createError(
            "promotion_challenge_issue_failed",
            "authorization",
            "Promotion challenge could not be issued.",
            true,
            { errorType: error instanceof Error ? error.name : "unknown" },
          ),
        );
      }
    }

    if (command.action === "arena.candidate.promote") {
      try {
        const canonicalCommandHash = await canonicalPromotionCommandHash(command, principal);
        const authorization = await context.promotionAuthorizer.consumeChallenge({
          principal,
          challengeId: command.adminChallengeId,
          nonce: command.adminChallengeNonce,
          canonicalCommandHash,
        });
        if (!authorization.authorized || authorization.actorId !== principal.actorId) {
          return authorizationReceipt(
            receiptId,
            acceptedAt,
            command,
            createError(
              "promotion_challenge_invalid",
              "authorization",
              "Promotion challenge was rejected by the trusted authorizer.",
              true,
              { reasonCode: authorization.authorized ? "actor_mismatch" : authorization.reasonCode },
            ),
          );
        }
      } catch (error) {
        return authorizationReceipt(
          receiptId,
          acceptedAt,
          command,
          createError(
            "promotion_challenge_invalid",
            "authorization",
            "Promotion challenge verification failed.",
            true,
            { errorType: error instanceof Error ? error.name : "unknown" },
          ),
        );
      }
    }

    return executeHandler(command, entry.handler, receiptId, acceptedAt, context, principal);
  };

  return Object.freeze({
    describe: async () => descriptorFrom(dependencies, registry),
    execute: async (candidateCommand: ArenaCommand, candidateContext: ArenaExecutionContext) => {
      if (!isRecord(candidateCommand)) {
        return rejectedReceipt(
          dependencies,
          "unknown",
          "",
          createError("invalid_command", "validation", "Command must be an object.", false),
        );
      }
      let commandRecord: Readonly<Record<string, unknown>>;
      try {
        commandRecord = immutableSnapshot(candidateCommand);
      } catch (error) {
        return rejectedReceipt(
          dependencies,
          "unknown",
          "",
          createError(
            "invalid_command",
            "validation",
            "Command payload must be finite acyclic JSON data.",
            false,
            { reason: error instanceof Error ? error.message : "unknown" },
          ),
        );
      }
      const action = typeof commandRecord.action === "string" ? commandRecord.action : "unknown";
      const idempotencyKey = typeof commandRecord.idempotencyKey === "string"
        ? commandRecord.idempotencyKey
        : "";
      if (idempotencyKey.trim().length === 0) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError("invalid_command", "validation", "A non-empty idempotencyKey is required.", false),
        );
      }
      const entry = registry.resolve(action);
      if (!entry) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError("unknown_action", "validation", "Action is not implemented by this arena.", false, { action }),
        );
      }

      const validationIssues = entry.validate(commandRecord);
      if (validationIssues.length > 0) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError(
            "invalid_command",
            "validation",
            "Command does not match the action input schema.",
            false,
            { issues: validationIssues.join("; ") },
          ),
        );
      }

      const principal = trustedPrincipal(candidateContext);
      if (!principal) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError("principal_required", "authorization", "A trusted authenticated principal is required.", true),
        );
      }
      if (!principal.permissions.includes(entry.descriptor.requiredPermission)) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError(
            "permission_denied",
            "authorization",
            "The authenticated principal lacks the action permission.",
            false,
            { requiredPermission: entry.descriptor.requiredPermission },
          ),
        );
      }
      if (!hasPromotionAuthorizer(candidateContext)) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError(
            "promotion_authorizer_unavailable",
            "authorization",
            "A trusted promotion authorizer is required in the execution context.",
            true,
          ),
        );
      }

      const authorizer = candidateContext.promotionAuthorizer;
      const executionContext: ArenaExecutionContext = Object.freeze({
        requestId: candidateContext.requestId,
        principal,
        promotionAuthorizer: Object.freeze({
          issueChallenge: authorizer.issueChallenge.bind(authorizer),
          consumeChallenge: authorizer.consumeChallenge.bind(authorizer),
        }),
      });
      const command = commandRecord as unknown as ArenaCommand;

      let fingerprint: string;
      try {
        fingerprint = canonicalize({
          command,
          principal: { actorId: principal.actorId, sessionIdHash: principal.sessionIdHash },
        });
      } catch (error) {
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError(
            "invalid_command",
            "validation",
            "Command payload must be finite JSON data.",
            false,
            { reason: error instanceof Error ? error.message : "unknown" },
          ),
        );
      }

      const previous = idempotency.get(idempotencyKey);
      if (previous) {
        if (previous.fingerprint === fingerprint) return previous.receipt;
        return rejectedReceipt(
          dependencies,
          action,
          idempotencyKey,
          createError(
            "idempotency_conflict",
            "conflict",
            "The idempotency key was already used with a different payload.",
            false,
            { idempotencyKey },
          ),
        );
      }

      const receiptId = dependencies.nextReceiptId();
      const acceptedAt = dependencies.now();
      const receipt = Promise.resolve().then(() => dispatchAuthorized(
        command,
        entry,
        receiptId,
        acceptedAt,
        executionContext,
        principal,
      ));
      idempotency.set(idempotencyKey, { fingerprint, receipt });
      return receipt;
    },
    observe: async (candidateQuery: ArenaQuery) => {
      if (!isRecord(candidateQuery) || typeof candidateQuery.view !== "string") {
        return immutableSnapshot<ArenaView>({
          kind: "error",
          error: createError("invalid_query", "validation", "Arena query must be an object with a view.", false),
        });
      }
      if (candidateQuery.view === "arena.status") {
        return immutableSnapshot<ArenaView>({
          kind: "arena.status",
          descriptor: descriptorFrom(dependencies, registry),
        });
      }
      if (!["experiment", "run", "evidence", "evaluation", "processes"].includes(candidateQuery.view)) {
        return immutableSnapshot<ArenaView>({
          kind: "error",
          error: createError(
            "unknown_view",
            "validation",
            "Arena query view is not supported.",
            false,
            { view: candidateQuery.view },
          ),
        });
      }
      const query = candidateQuery as Exclude<ArenaQuery, { view: "arena.status" }>;
      if (!dependencies.readView) {
        return immutableSnapshot<ArenaView>({
          kind: "error",
          error: createError("view_unavailable", "validation", "No read model is bound for this view.", false),
        });
      }
      return immutableSnapshot(await dependencies.readView(query));
    },
  });
}
