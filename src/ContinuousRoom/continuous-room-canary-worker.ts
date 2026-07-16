import { ContinuousRoomCanaryAuthority } from "./continuous-room-canary-authority";
import { parseContinuousRoomCanaryCommand, type ContinuousRoomCanaryResponse } from "./continuous-room-canary-contract";

const MAX_COMMAND_BYTES = 16 * 1024;

export async function createContinuousRoomCanaryCommandResponse(
  request: Request,
  authority: ContinuousRoomCanaryAuthority,
): Promise<Response> {
  if (request.method !== "POST") return response({ ok: false, code: "invalid_command", message: "POST required", snapshot: null }, 405);
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COMMAND_BYTES) {
    return response({ ok: false, code: "invalid_command", message: "command body exceeds 16 KiB", snapshot: null }, 413);
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    return response({ ok: false, code: "invalid_command", message: "command body could not be read", snapshot: null }, 400);
  }
  if (new TextEncoder().encode(body).byteLength > MAX_COMMAND_BYTES) {
    return response({ ok: false, code: "invalid_command", message: "command body exceeds 16 KiB", snapshot: null }, 413);
  }
  let command;
  try {
    command = parseContinuousRoomCanaryCommand(JSON.parse(body));
  } catch {
    return response({ ok: false, code: "invalid_command", message: "invalid lifecycle command", snapshot: null }, 400);
  }
  let result: ContinuousRoomCanaryResponse;
  try {
    result = await authority.handle(command);
  } catch {
    result = { ok: false, code: "round_failed", message: "continuous room authority failed safely", snapshot: null };
  }
  return response(result, statusFor(result));
}

function statusFor(result: ContinuousRoomCanaryResponse): number {
  if (result.ok) return 200;
  if (result.code === "not_found") return 404;
  if (result.code === "recovery_denied") return 401;
  if (result.code === "rate_limited") return 429;
  if (result.code === "round_failed") return 500;
  if (result.code === "stale_revision" || result.code === "command_conflict" || result.code === "invalid_state") return 409;
  return 400;
}

function response(payload: ContinuousRoomCanaryResponse, status: number): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
