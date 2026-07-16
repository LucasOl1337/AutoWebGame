import type {
  ArenaActionDescriptor,
  ArenaActionHandler,
  ArenaActionHandlers,
  ArenaCommand,
} from "./arena-interface";

export function immutableSnapshot<T>(value: T, ancestors = new Set<object>()): T {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("Cannot snapshot cyclic data");
    ancestors.add(value);
    const snapshot = value.map((item) => immutableSnapshot(item, ancestors));
    ancestors.delete(value);
    return Object.freeze(snapshot) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    if (ancestors.has(value)) throw new Error("Cannot snapshot cyclic data");
    ancestors.add(value);
    const snapshot: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      snapshot[key] = immutableSnapshot(nestedValue, ancestors);
    }
    ancestors.delete(value);
    return Object.freeze(snapshot) as T;
  }
  return value;
}

const receiptSchema: Readonly<Record<string, unknown>> = {
  type: "object",
  required: ["receiptId", "action", "idempotencyKey", "status", "acceptedAt", "result", "error"],
};
const SHA256_PATTERN = "^sha256:[0-9a-f]{64}$";
const EXAMPLE_SHA256 = `sha256:${"0".repeat(64)}`;

function inputSchema(
  required: readonly string[],
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "idempotencyKey", ...required],
    properties: {
      action: { type: "string" },
      idempotencyKey: { type: "string", minLength: 1 },
      ...properties,
    },
  };
}

type DescriptorDefinition = Omit<
  ArenaActionDescriptor,
  "outputSchema" | "contractVersion" | "errorRetryability"
>;

const retryableErrorCodes = new Set([
  "adapter_unhealthy",
  "handler_failed",
  "pair_incomplete",
  "principal_required",
  "promotion_authorizer_unavailable",
  "promotion_challenge_invalid",
  "promotion_challenge_issue_failed",
  "promotion_stale",
  "run_state_conflict",
]);

const definitions: readonly DescriptorDefinition[] = [
  {
    id: "arena.experiment.start",
    title: "Start experiment",
    description: "Validate an immutable experiment specification and create one execution.",
    inputSchema: inputSchema(["spec"], { spec: { type: "object" } }),
    allowedStates: ["none"],
    readOnly: false,
    destructive: false,
    disruptive: false,
    requiresHumanConfirmation: false,
    confirmationMechanism: "none",
    requiredPermission: "arena.experiment.start",
    errorCodes: ["invalid_spec", "idempotency_conflict", "handler_failed"],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: [],
    example: {
      action: "arena.experiment.start",
      idempotencyKey: "start-example-1",
      spec: { schemaVersion: "botevolutionarena.v0.1" },
    },
  },
  {
    id: "arena.run.pause",
    title: "Pause run",
    description: "Pause scheduling for a running execution after optimistic state validation.",
    inputSchema: inputSchema(["runId", "expectedState"], {
      runId: { type: "string", minLength: 1 },
      expectedState: { enum: ["running", "holdout-running"] },
    }),
    allowedStates: ["running", "holdout-running"],
    readOnly: false,
    destructive: false,
    disruptive: false,
    requiresHumanConfirmation: false,
    confirmationMechanism: "none",
    requiredPermission: "arena.run.control",
    errorCodes: ["run_state_conflict", "idempotency_conflict", "handler_failed"],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["expectedState"],
    example: {
      action: "arena.run.pause",
      idempotencyKey: "pause-example-1",
      runId: "run-1",
      expectedState: "running",
    },
  },
  {
    id: "arena.run.resume",
    title: "Resume run",
    description: "Resume a paused execution after optimistic state validation.",
    inputSchema: inputSchema(["runId", "expectedState"], {
      runId: { type: "string", minLength: 1 },
      expectedState: { const: "paused" },
    }),
    allowedStates: ["paused"],
    readOnly: false,
    destructive: false,
    disruptive: false,
    requiresHumanConfirmation: false,
    confirmationMechanism: "none",
    requiredPermission: "arena.run.control",
    errorCodes: ["run_state_conflict", "idempotency_conflict", "handler_failed"],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["expectedState"],
    example: {
      action: "arena.run.resume",
      idempotencyKey: "resume-example-1",
      runId: "run-1",
      expectedState: "paused",
    },
  },
  {
    id: "arena.run.cancel",
    title: "Cancel run",
    description: "Cancel an active execution and propagate teardown to its owned resources.",
    inputSchema: inputSchema(["runId", "expectedState", "reason"], {
      runId: { type: "string", minLength: 1 },
      expectedState: {
        enum: [
          "accepted",
          "queued",
          "running",
          "paused",
          "candidate-frozen",
          "holdout-running",
          "evaluating",
          "completed",
          "failed",
          "cancelled",
        ],
      },
      reason: { type: "string", minLength: 1 },
    }),
    allowedStates: ["accepted", "queued", "running", "paused", "candidate-frozen", "holdout-running", "evaluating"],
    readOnly: false,
    destructive: false,
    disruptive: true,
    requiresHumanConfirmation: false,
    confirmationMechanism: "none",
    requiredPermission: "arena.run.cancel",
    errorCodes: ["run_state_conflict", "idempotency_conflict", "handler_failed"],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["expectedState"],
    example: {
      action: "arena.run.cancel",
      idempotencyKey: "cancel-example-1",
      runId: "run-1",
      expectedState: "running",
      reason: "operator-request",
    },
  },
  {
    id: "arena.evaluation.request",
    title: "Request evaluation",
    description: "Evaluate a frozen evidence manifest without promoting any candidate.",
    inputSchema: inputSchema(["runId", "evidenceManifestHash"], {
      runId: { type: "string", minLength: 1 },
      evidenceManifestHash: { type: "string", pattern: SHA256_PATTERN },
    }),
    allowedStates: ["running", "evaluating"],
    readOnly: false,
    destructive: false,
    disruptive: false,
    requiresHumanConfirmation: false,
    confirmationMechanism: "none",
    requiredPermission: "arena.evaluation.request",
    errorCodes: ["evidence_corrupt", "pair_incomplete", "idempotency_conflict", "handler_failed"],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["evidenceManifestHash"],
    example: {
      action: "arena.evaluation.request",
      idempotencyKey: "evaluation-example-1",
      runId: "run-1",
      evidenceManifestHash: EXAMPLE_SHA256,
    },
  },
  {
    id: "arena.promotion.challenge.issue",
    title: "Issue promotion challenge",
    description: "Issue a short-lived, single-use challenge bound to the authenticated admin session and promotion target.",
    inputSchema: inputSchema([
      "runId",
      "candidateGenomeId",
      "evaluationHash",
      "expectedCurrentGenomeId",
    ], {
      runId: { type: "string", minLength: 1 },
      candidateGenomeId: { type: "string", minLength: 1 },
      evaluationHash: { type: "string", pattern: SHA256_PATTERN },
      expectedCurrentGenomeId: { type: ["string", "null"] },
    }),
    allowedStates: ["completed"],
    readOnly: false,
    destructive: false,
    disruptive: false,
    requiresHumanConfirmation: false,
    confirmationMechanism: "admin-session-challenge-v0.1",
    requiredPermission: "arena.candidate.promote",
    errorCodes: [
      "principal_required",
      "permission_denied",
      "promotion_authorizer_unavailable",
      "promotion_challenge_issue_failed",
      "promotion_stale",
      "idempotency_conflict",
      "handler_failed",
    ],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["evaluationHash", "expectedCurrentGenomeId"],
    example: {
      action: "arena.promotion.challenge.issue",
      idempotencyKey: "promotion-challenge-example-1",
      runId: "run-1",
      candidateGenomeId: "genome-candidate",
      evaluationHash: EXAMPLE_SHA256,
      expectedCurrentGenomeId: null,
    },
  },
  {
    id: "arena.candidate.promote",
    title: "Promote candidate",
    description: "Promote one eligible candidate after fresh state checks and explicit human confirmation.",
    inputSchema: inputSchema([
      "runId",
      "candidateGenomeId",
      "evaluationHash",
      "expectedCurrentGenomeId",
      "adminChallengeId",
      "adminChallengeNonce",
    ], {
      runId: { type: "string", minLength: 1 },
      candidateGenomeId: { type: "string", minLength: 1 },
      evaluationHash: { type: "string", pattern: SHA256_PATTERN },
      expectedCurrentGenomeId: { type: ["string", "null"] },
      adminChallengeId: { type: "string", minLength: 1 },
      adminChallengeNonce: { type: "string", minLength: 1 },
    }),
    allowedStates: ["completed"],
    readOnly: false,
    destructive: false,
    disruptive: true,
    requiresHumanConfirmation: true,
    confirmationMechanism: "admin-session-challenge-v0.1",
    requiredPermission: "arena.candidate.promote",
    errorCodes: [
      "principal_required",
      "permission_denied",
      "promotion_authorizer_unavailable",
      "promotion_challenge_invalid",
      "promotion_stale",
      "hard_gate_failed",
      "idempotency_conflict",
      "handler_failed",
    ],
    idempotency: { keyField: "idempotencyKey", samePayloadReturnsOriginalReceipt: true },
    optimisticConcurrencyFields: ["evaluationHash", "expectedCurrentGenomeId"],
    example: {
      action: "arena.candidate.promote",
      idempotencyKey: "promotion-example-1",
      runId: "run-1",
      candidateGenomeId: "genome-candidate",
      evaluationHash: EXAMPLE_SHA256,
      expectedCurrentGenomeId: null,
      adminChallengeId: "challenge-1",
      adminChallengeNonce: "single-use-nonce",
    },
  },
];

export interface BoundArenaAction {
  readonly descriptor: ArenaActionDescriptor;
  readonly handler: ArenaActionHandler;
  readonly validate: (command: unknown) => readonly string[];
}

export interface ArenaActionRegistry {
  descriptors(): readonly ArenaActionDescriptor[];
  resolve(action: string): BoundArenaAction | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesJsonType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validateSchema(
  schemaValue: unknown,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(schemaValue)) return;
  if ("const" in schemaValue && value !== schemaValue.const) {
    issues.push(`${path} must equal ${JSON.stringify(schemaValue.const)}`);
    return;
  }
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.includes(value)) {
    issues.push(`${path} is not an allowed value`);
    return;
  }
  const declaredTypes = typeof schemaValue.type === "string"
    ? [schemaValue.type]
    : Array.isArray(schemaValue.type)
      ? schemaValue.type.filter((type): type is string => typeof type === "string")
      : [];
  if (declaredTypes.length > 0 && !declaredTypes.some((type) => matchesJsonType(value, type))) {
    issues.push(`${path} has an invalid type`);
    return;
  }
  if (typeof value === "string") {
    if (typeof schemaValue.minLength === "number" && value.length < schemaValue.minLength) {
      issues.push(`${path} is too short`);
    }
    if (typeof schemaValue.pattern === "string" && !new RegExp(schemaValue.pattern).test(value)) {
      issues.push(`${path} has an invalid format`);
    }
  }
  if (!isRecord(value)) return;

  const properties = isRecord(schemaValue.properties) ? schemaValue.properties : {};
  const required = Array.isArray(schemaValue.required)
    ? schemaValue.required.filter((field): field is string => typeof field === "string")
    : [];
  for (const field of required) {
    if (!Object.hasOwn(value, field)) issues.push(`${path}.${field} is required`);
  }
  if (schemaValue.additionalProperties === false) {
    for (const field of Object.keys(value)) {
      if (!Object.hasOwn(properties, field)) issues.push(`${path}.${field} is not allowed`);
    }
  }
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, field)) validateSchema(fieldSchema, value[field], `${path}.${field}`, issues);
  }
}

function validateCommand(descriptor: ArenaActionDescriptor, command: unknown): readonly string[] {
  const issues: string[] = [];
  validateSchema(descriptor.inputSchema, command, "$", issues);
  return immutableSnapshot(issues);
}

export function createActionRegistry(handlers: Partial<ArenaActionHandlers>): ArenaActionRegistry {
  const entries = new Map<string, BoundArenaAction>();
  for (const definition of definitions) {
    const handler = handlers[definition.id] as ArenaActionHandler | undefined;
    if (typeof handler !== "function") continue;
    const errorCodes = [
      "invalid_command",
      "principal_required",
      "permission_denied",
      "promotion_authorizer_unavailable",
      ...definition.errorCodes,
    ].filter((code, index, codes) => codes.indexOf(code) === index);
    const descriptor = immutableSnapshot({
      ...definition,
      errorCodes,
      contractVersion: "botevolutionarena.v0.1" as const,
      outputSchema: receiptSchema,
      errorRetryability: Object.fromEntries(
        errorCodes.map((code) => [code, retryableErrorCodes.has(code)]),
      ),
    });
    entries.set(definition.id, immutableSnapshot({
      descriptor,
      handler,
      validate: (command: unknown) => validateCommand(descriptor, command),
    }));
  }

  return Object.freeze({
    descriptors: () => immutableSnapshot([...entries.values()].map((entry) => entry.descriptor)),
    resolve: (action: string) => entries.get(action) ?? null,
  });
}

export function definedArenaActionIds(): readonly ArenaCommand["action"][] {
  return immutableSnapshot(definitions.map((definition) => definition.id));
}
