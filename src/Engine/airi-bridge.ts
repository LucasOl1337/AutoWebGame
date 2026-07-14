import type { Direction } from "../Gameplay/types";
import type { OnlineInputState } from "../NetCode/protocol";
import type { GameApp } from "./game-app";

const AIRI_REQUEST_TYPE = "airi-autowebgame:request";
const AIRI_RESPONSE_TYPE = "airi-autowebgame:response";
const AIRI_QUERY_PARAMETER = "airi";
const DEFAULT_ACTION_DURATION_MS = 100;
const MAX_ACTION_DURATION_MS = 2_000;

type AiriGameAction = "start" | "reset" | "resume" | "snapshot" | "observe" | "act";

interface AiriBridgeRequest {
  type: typeof AIRI_REQUEST_TYPE;
  requestId: string;
  payload?: {
    action?: AiriGameAction;
    direction?: Direction | null;
    durationMs?: number;
    bomb?: boolean;
    detonate?: boolean;
    skill?: boolean;
    skillHeld?: boolean;
  };
}

interface AiriBridgeResponse {
  type: typeof AIRI_RESPONSE_TYPE;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

function readDirection(value: unknown): Direction | null {
  return value === "up" || value === "down" || value === "left" || value === "right"
    ? value
    : null;
}

function readDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ACTION_DURATION_MS;
  }
  return Math.min(MAX_ACTION_DURATION_MS, Math.max(0, Math.round(value)));
}

function readSnapshot(game: GameApp): unknown {
  const rendered = typeof window.render_game_to_text === "function"
    ? window.render_game_to_text()
    : null;

  if (rendered) {
    try {
      return JSON.parse(rendered) as unknown;
    }
    catch {
      // Fall back to the authoritative snapshot if a debug serializer changes shape.
    }
  }

  return game.exportOnlineSnapshot();
}

function startAiriMatch(game: GameApp): unknown {
  if (game.getCurrentMode() !== "match") {
    game.startServerAuthoritativeMatch(
      [1, 2],
      { 1: 0, 2: 1, 3: 0, 4: 1 },
      {
        botPlayerIds: [2],
        roomMode: "classic",
        playerLabels: { 1: "AIRI", 2: "AutoBot", 3: "Player 3", 4: "Player 4" },
      },
    );
  }

  game.resumeAiriMatch();

  return readSnapshot(game);
}

function applyAiriAction(game: GameApp, payload: AiriBridgeRequest["payload"]): unknown {
  if (game.getCurrentMode() !== "match") {
    startAiriMatch(game);
  }

  game.resumeAiriMatch();

  const input: OnlineInputState = {
    direction: readDirection(payload?.direction),
    bombPressed: payload?.bomb === true,
    detonatePressed: payload?.detonate === true,
    skillPressed: payload?.skill === true,
    skillHeld: payload?.skillHeld === true,
  };

  game.setServerPlayerInput(1, input);
  game.advanceServerSimulation(readDuration(payload?.durationMs));
  return readSnapshot(game);
}

function isAiriBridgeRequest(value: unknown): value is AiriBridgeRequest {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { type?: unknown }).type === AIRI_REQUEST_TYPE
    && typeof (value as { requestId?: unknown }).requestId === "string",
  );
}

/**
 * Installs the narrow parent-window bridge used by the AIRI AutoWebGame plugin.
 *
 * The bridge is opt-in through `?airi=1` and only accepts messages from the
 * embedding window, so a normal player tab keeps no remote-control surface.
 */
export function installAiriGameBridge(game: GameApp): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get(AIRI_QUERY_PARAMETER) !== "1" || window.parent === window) {
    return;
  }

  const parentWindow = window.parent;
  const handleMessage = async (event: MessageEvent<unknown>) => {
    if (event.source !== parentWindow || !isAiriBridgeRequest(event.data)) {
      return;
    }

    const request = event.data;
    const action = request.payload?.action ?? "snapshot";
    const response: AiriBridgeResponse = {
      type: AIRI_RESPONSE_TYPE,
      requestId: request.requestId,
      ok: true,
    };

    try {
      if (action === "start" || action === "reset") {
        if (action === "reset") {
          game.returnToMenu();
        }
        response.result = startAiriMatch(game);
      }
      else if (action === "resume") {
        game.resumeAiriMatch();
        response.result = readSnapshot(game);
      }
      else if (action === "act") {
        response.result = applyAiriAction(game, request.payload);
      }
      else {
        response.result = readSnapshot(game);
      }
    }
    catch (error) {
      response.ok = false;
      response.error = error instanceof Error ? error.message : String(error);
    }

    parentWindow.postMessage(response, event.origin === "null" ? "*" : event.origin);
  };

  window.addEventListener("message", handleMessage);
}
