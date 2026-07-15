const LAB_API_BASE = "/api/lab";

export type LabAgentConfig = {
  slot: "1" | "2" | "3" | "4";
  provider: string;
  model: string;
  label?: string;
};

export type LabSessionRequest = {
  agents: LabAgentConfig[];
  rounds: number;
  durationSec: number;
  map: string;
  modifier: string;
};

export type LabSessionResponse = {
  ok: boolean;
  sessionId?: string;
  gameUrl?: string;
  codexbot?: string;
  error?: string;
  hint?: string;
  agents?: Array<{ slot: string; provider: string; model: string; label: string }>;
};

export type LabModelInfo = { id: string; label: string };

export type LabModelCatalogResult = {
  models: LabModelInfo[];
  warning?: string;
  verified: boolean;
  verifiedAtMs: number | null;
};

export const LAB_MODEL_CATALOG: readonly LabModelInfo[] = [
  { id: "cx/gpt-5.6-sol", label: "GPT-5.6 SOL" },
  { id: "cx/gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "cx/gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "cc/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "cc/claude-sonnet-5", label: "Claude Sonnet 5" },
] as const;

export const LAB_MODEL_VERIFICATION_TTL_MS = 5 * 60 * 1_000;

const LAB_MODEL_UNAVAILABLE_OPTION: LabModelInfo = {
  id: "",
  label: "Modelos não verificados — atualize a lista",
};
const MIN_REMOTE_CATALOG_EVIDENCE = 2;

let verifiedModelIds = new Set<string>();
let modelsVerifiedAtMs: number | null = null;
let modelCatalogRequestSequence = 0;
let latestCatalogResult: LabModelCatalogResult = {
  models: [{ ...LAB_MODEL_UNAVAILABLE_OPTION }],
  warning: "models_not_verified",
  verified: false,
  verifiedAtMs: null,
};

function clearModelVerification(): void {
  verifiedModelIds = new Set<string>();
  modelsVerifiedAtMs = null;
}

function cloneCatalogResult(result: LabModelCatalogResult): LabModelCatalogResult {
  return {
    ...result,
    models: result.models.map((model) => ({ ...model })),
  };
}

function unverifiedCatalog(requestSequence: number, warning: string): LabModelCatalogResult {
  if (requestSequence !== modelCatalogRequestSequence) {
    return cloneCatalogResult(latestCatalogResult);
  }
  clearModelVerification();
  latestCatalogResult = {
    models: [{ ...LAB_MODEL_UNAVAILABLE_OPTION }],
    warning,
    verified: false,
    verifiedAtMs: null,
  };
  return cloneCatalogResult(latestCatalogResult);
}

export function getBrokerBase(): string {
  return LAB_API_BASE;
}

export async function fetchLabModels(): Promise<LabModelCatalogResult> {
  const requestSequence = ++modelCatalogRequestSequence;
  try {
    const response = await fetch(`${getBrokerBase()}/models`, { method: "GET" });
    let data: {
      ok?: boolean;
      source?: string;
      models?: LabModelInfo[];
      warning?: string;
      error?: string;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      return unverifiedCatalog(
        requestSequence,
        response.ok ? "invalid_broker_response" : "broker_unreachable",
      );
    }
    if (!response.ok || !data.ok) {
      const warning = response.status >= 500
        ? "broker_unreachable"
        : data.warning || data.error || "models_unavailable";
      return unverifiedCatalog(requestSequence, warning);
    }
    if (!Array.isArray(data.models)) {
      return unverifiedCatalog(requestSequence, "invalid_model_catalog");
    }

    const remoteIds = new Set(
      data.models
        .map((model) => model?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const available = new Set(remoteIds);
    const models = LAB_MODEL_CATALOG.filter((model) => available.has(model.id));
    if (data.warning || data.source !== "9router") {
      return unverifiedCatalog(requestSequence, data.warning || "models_unverified_source");
    }

    // The current broker can synthesize exactly one configured default when the
    // remote catalog is empty. Requiring two independent IDs fails closed until
    // the broker can expose explicit per-model provenance.
    if (remoteIds.size < MIN_REMOTE_CATALOG_EVIDENCE) {
      return unverifiedCatalog(requestSequence, "catalog_provenance_insufficient");
    }
    if (models.length === 0) {
      return unverifiedCatalog(requestSequence, "no_curated_models_available");
    }
    if (requestSequence !== modelCatalogRequestSequence) {
      return cloneCatalogResult(latestCatalogResult);
    }

    verifiedModelIds = new Set(models.map((model) => model.id));
    modelsVerifiedAtMs = Date.now();
    latestCatalogResult = {
      models: models.map((model) => ({
        ...model,
        label: `${model.label} · confirmado por 5 min`,
      })),
      verified: true,
      verifiedAtMs: modelsVerifiedAtMs,
    };
    return cloneCatalogResult(latestCatalogResult);
  } catch {
    return unverifiedCatalog(requestSequence, "broker_unreachable");
  }
}

export async function createLabSession(request: LabSessionRequest): Promise<LabSessionResponse> {
  if (!Array.isArray(request.agents) || request.agents.length === 0) {
    return {
      ok: false,
      error: "agents_required",
      hint: "Selecione ao menos um bot com modelo confirmado antes de iniciar o duelo.",
    };
  }

  const modelAgents = request.agents.filter((agent) => {
    const provider = agent.provider.trim().toLowerCase() || "9router";
    return provider === "9router";
  });
  if (modelAgents.length > 0) {
    if (modelsVerifiedAtMs === null) {
      return {
        ok: false,
        error: "models_not_verified",
        hint: "Atualize a lista e aguarde a confirmação de disponibilidade do 9Router.",
      };
    }

    const verificationAgeMs = Date.now() - modelsVerifiedAtMs;
    if (verificationAgeMs < 0 || verificationAgeMs > LAB_MODEL_VERIFICATION_TTL_MS) {
      clearModelVerification();
      return {
        ok: false,
        error: "models_verification_expired",
        hint: "A verificação dos modelos expirou. Atualize a lista antes de iniciar o duelo.",
      };
    }

    const unavailable = modelAgents.find((agent) => !verifiedModelIds.has(agent.model));
    if (unavailable) {
      return {
        ok: false,
        error: "model_not_available",
        hint: `O modelo de ${unavailable.label || `P${unavailable.slot}`} não foi confirmado pelo 9Router. Atualize a lista.`,
      };
    }
  }

  const response = await fetch(`${getBrokerBase()}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agents: request.agents.map((agent) => ({
        slot: agent.slot,
        provider: agent.provider,
        model: agent.model,
        label: agent.label,
      })),
      rounds: request.rounds,
      durationSec: request.durationSec,
      map: request.map,
      modifier: request.modifier,
    }),
  });

  let data: LabSessionResponse;
  try {
    data = (await response.json()) as LabSessionResponse;
  } catch {
    return { ok: false, error: "invalid_broker_response" };
  }

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `http_${response.status}`,
      hint: data.hint,
    };
  }

  return data;
}
