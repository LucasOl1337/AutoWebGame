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

export const LAB_MODEL_CATALOG: readonly LabModelInfo[] = [
  { id: "cx/gpt-5.6-sol", label: "GPT-5.6 SOL" },
  { id: "cx/gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "cx/gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "cc/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "cc/claude-sonnet-5", label: "Claude Sonnet 5" },
] as const;

export function getBrokerBase(): string {
  return LAB_API_BASE;
}

export async function fetchLabModels(): Promise<{ models: LabModelInfo[]; warning?: string }> {
  try {
    const response = await fetch(`${getBrokerBase()}/models`, { method: "GET" });
    const data = (await response.json()) as {
      ok?: boolean;
      models?: LabModelInfo[];
      warning?: string;
    };
    if (!response.ok || !data.ok) {
      return { models: [...LAB_MODEL_CATALOG], warning: data.warning || "models_unavailable" };
    }
    const available = new Set((Array.isArray(data.models) ? data.models : []).map((model) => model.id));
    const models = LAB_MODEL_CATALOG.filter((model) => available.has(model.id));
    return { models, warning: data.warning };
  } catch {
    return { models: [...LAB_MODEL_CATALOG], warning: "broker_unreachable" };
  }
}

export async function createLabSession(request: LabSessionRequest): Promise<LabSessionResponse> {
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
