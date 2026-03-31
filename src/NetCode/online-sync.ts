import {
  FIXED_STEP_MS,
  TILE_SIZE,
} from "../PersonalConfig/config";
import type {
  BombState,
  Direction,
  FlameState,
  PixelCoord,
  PlayerId,
  PlayerState,
  PowerUpState,
  RoundOutcome,
} from "../Gameplay/types";
import type {
  OnlineInputState,
  OnlineRole,
} from "./protocol";
import { tileKey } from "../Arenas/arena";
import type { SfxKey } from "../Engine/sound-manager";

export const ONLINE_SNAPSHOT_INTERVAL_MS = 50;
const ONLINE_RENDER_SMOOTHING = 0.48;
const ONLINE_MIN_INTERPOLATION_DELAY_MS = 18;
const ONLINE_MAX_INTERPOLATION_DELAY_MS = 34;
const ONLINE_INTERPOLATION_JITTER_BUFFER_MS = 6;
const ONLINE_EXTRAPOLATION_MS = 28;
const ONLINE_VELOCITY_LEAD_MS = 10;
const ONLINE_MAX_VISUAL_LEAD_PX = TILE_SIZE * 0.34;
const ONLINE_SAMPLE_BUFFER_SIZE = 12;

export interface OnlineRenderSample {
  receivedAtMs: number;
  serverTimeMs: number;
  serverTick: number;
  players: Record<PlayerId, { position: PixelCoord; velocity: PixelCoord }>;
}

export interface PendingOnlineInput {
  seq: number;
  input: OnlineInputState;
}

export function createNeutralOnlineInput(): OnlineInputState {
  return {
    direction: null,
    bombPressed: false,
    detonatePressed: false,
    skillPressed: false,
    skillHeld: false,
  };
}

export function cloneOnlineInputState(input: OnlineInputState): OnlineInputState {
  return {
    direction: input.direction,
    bombPressed: input.bombPressed,
    detonatePressed: input.detonatePressed,
    skillPressed: input.skillPressed,
    skillHeld: Boolean(input.skillHeld),
  };
}

export function mergeLatchedOnlineInput(
  current: OnlineInputState | undefined,
  next: OnlineInputState,
): OnlineInputState {
  return {
    direction: next.direction,
    bombPressed: Boolean(current?.bombPressed) || next.bombPressed,
    detonatePressed: Boolean(current?.detonatePressed) || next.detonatePressed,
    skillPressed: Boolean(current?.skillPressed) || next.skillPressed,
    skillHeld: Boolean(next.skillHeld),
  };
}

export function consumeLatchedOnlinePress(
  onlineEnabled: boolean,
  source: OnlineInputState | undefined,
  field: "bombPressed" | "detonatePressed" | "skillPressed",
): boolean {
  if (!onlineEnabled || !source) {
    return false;
  }
  const pressed = source[field];
  source[field] = false;
  return pressed;
}

export function captureOnlineLocalInput(
  source: OnlineInputState,
  direction: Direction | null,
  bombPressed: boolean,
  detonatePressed: boolean,
  skillPressed: boolean,
  skillHeld: boolean,
): void {
  source.direction = direction;
  source.bombPressed = source.bombPressed || bombPressed;
  source.detonatePressed = source.detonatePressed || detonatePressed;
  source.skillPressed = source.skillPressed || skillPressed;
  source.skillHeld = skillHeld;
}

export function appendPendingOnlineInput(
  pending: PendingOnlineInput[],
  next: PendingOnlineInput,
  maxEntries = 180,
): void {
  pending.push(next);
  if (pending.length > maxEntries) {
    pending.splice(0, pending.length - maxEntries);
  }
}

interface OnlineAudioTransitionArgs {
  headless: boolean;
  role: OnlineRole | null;
  audioPrimed: boolean;
  localPlayerId: PlayerId;
  suppressLocalBombAudio: boolean;
  previousBombs: BombState[];
  previousFlames: FlameState[];
  previousMatchWinner: PlayerId | null;
  next: {
    bombs: BombState[];
    flames: FlameState[];
    players: Record<PlayerId, PlayerState>;
    roundOutcome: RoundOutcome | null;
    matchWinner: PlayerId | null;
    suddenDeathActive: boolean;
    breakableTiles?: string[];
    powerUps?: PowerUpState[];
  };
  didCollectRemotePowerUp: (nextPowerUps: PowerUpState[]) => boolean;
  playSound: (name: SfxKey) => void;
}

export function playOnlineAudioTransition({
  headless,
  role,
  audioPrimed,
  localPlayerId,
  suppressLocalBombAudio,
  previousBombs,
  previousFlames,
  previousMatchWinner,
  next,
  didCollectRemotePowerUp,
  playSound,
}: OnlineAudioTransitionArgs): void {
  if (headless || role !== "guest" || !audioPrimed) {
    return;
  }

  const previousBombKeys = new Set(previousBombs.map((bomb) => getBombAudioKey(bomb)));
  const nextBombKeys = new Set(next.bombs.map((bomb) => getBombAudioKey(bomb)));
  const addedBombs = next.bombs.filter((bomb) => (
    !previousBombKeys.has(getBombAudioKey(bomb))
    && !(suppressLocalBombAudio && bomb.ownerId === localPlayerId)
  )).length;
  const removedBombs = previousBombs.filter((bomb) => (
    !nextBombKeys.has(getBombAudioKey(bomb))
    && !(suppressLocalBombAudio && bomb.ownerId === localPlayerId)
  )).length;

  const previousFlameKeys = new Set(previousFlames.map((flame) => tileKey(flame.tile.x, flame.tile.y)));
  const newFlames = next.flames.filter((flame) => !previousFlameKeys.has(tileKey(flame.tile.x, flame.tile.y))).length;

  if (addedBombs > 0) {
    playSound("bombPlace");
  }
  if (removedBombs > 0) {
    playSound("bombExplode");
  }
  if (newFlames > 0) {
    playSound("flames");
  }
  if (next.powerUps && didCollectRemotePowerUp(next.powerUps)) {
    playSound("powerCollect");
  }
  if (!previousMatchWinner && next.matchWinner) {
    playSound("matchWin");
  }
}

function getBombAudioKey(bomb: BombState): string {
  return `${bomb.ownerId}:${tileKey(bomb.tile.x, bomb.tile.y)}`;
}

export function pushOnlineRenderSample(
  samples: OnlineRenderSample[],
  headless: boolean,
  serverTimeMs: number,
  serverTick: number,
  players: Record<PlayerId, PlayerState>,
  getPlayerPixelPositionFromState: (player: PlayerState) => PixelCoord,
): void {
  if (headless || typeof performance === "undefined") {
    return;
  }
  const sample: OnlineRenderSample = {
    receivedAtMs: performance.now(),
    serverTimeMs,
    serverTick,
    players: {
      1: {
        position: getPlayerPixelPositionFromState(players[1]),
        velocity: { x: players[1].velocity.x, y: players[1].velocity.y },
      },
      2: {
        position: getPlayerPixelPositionFromState(players[2]),
        velocity: { x: players[2].velocity.x, y: players[2].velocity.y },
      },
      3: {
        position: getPlayerPixelPositionFromState(players[3]),
        velocity: { x: players[3].velocity.x, y: players[3].velocity.y },
      },
      4: {
        position: getPlayerPixelPositionFromState(players[4]),
        velocity: { x: players[4].velocity.x, y: players[4].velocity.y },
      },
    },
  };
  const previousSample = samples[samples.length - 1] ?? null;
  if (previousSample && previousSample.serverTick === sample.serverTick) {
    samples[samples.length - 1] = sample;
  } else {
    samples.push(sample);
    if (samples.length > ONLINE_SAMPLE_BUFFER_SIZE) {
      samples.splice(0, samples.length - ONLINE_SAMPLE_BUFFER_SIZE);
    }
  }
}

export function getOnlineInterpolationDelayMs(samples: OnlineRenderSample[]): number {
  if (samples.length < 2) {
    return ONLINE_MIN_INTERPOLATION_DELAY_MS;
  }

  const intervals: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const intervalMs = samples[index].serverTimeMs - samples[index - 1].serverTimeMs;
    if (intervalMs > 0) {
      intervals.push(intervalMs);
    }
  }

  if (intervals.length === 0) {
    return ONLINE_MIN_INTERPOLATION_DELAY_MS;
  }

  intervals.sort((left, right) => left - right);
  const medianIntervalMs = intervals[Math.floor(intervals.length / 2)];
  return Math.max(
    ONLINE_MIN_INTERPOLATION_DELAY_MS,
    Math.min(
      ONLINE_MAX_INTERPOLATION_DELAY_MS,
      medianIntervalMs + ONLINE_INTERPOLATION_JITTER_BUFFER_MS,
    ),
  );
}

export function projectNetworkPlayerPosition(
  samples: OnlineRenderSample[],
  playerId: PlayerId,
  nowMs: number,
  fallbackPosition: PixelCoord,
  fallbackVelocity: PixelCoord,
): PixelCoord {
  const latestSample = samples[samples.length - 1] ?? null;
  const currentSample = latestSample?.players[playerId] ?? null;
  if (!currentSample || !latestSample) {
    return {
      x: fallbackPosition.x + fallbackVelocity.x * (ONLINE_VELOCITY_LEAD_MS / 1000),
      y: fallbackPosition.y + fallbackVelocity.y * (ONLINE_VELOCITY_LEAD_MS / 1000),
    };
  }

  const elapsedSinceLatestMs = Math.max(0, nowMs - latestSample.receivedAtMs);
  const estimatedServerNowMs = latestSample.serverTimeMs + elapsedSinceLatestMs;
  const renderAtServerMs = estimatedServerNowMs - getOnlineInterpolationDelayMs(samples);
  const oldestSample = samples[0] ?? latestSample;
  if (renderAtServerMs <= oldestSample.serverTimeMs) {
    const oldestPlayer = oldestSample.players[playerId];
    return {
      x: oldestPlayer.position.x,
      y: oldestPlayer.position.y,
    };
  }

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (renderAtServerMs < previous.serverTimeMs || renderAtServerMs > next.serverTimeMs) {
      continue;
    }
    const previousSample = previous.players[playerId];
    const nextSample = next.players[playerId];
    const spanMs = Math.max(1, next.serverTimeMs - previous.serverTimeMs);
    const alpha = Math.max(0, Math.min(1, (renderAtServerMs - previous.serverTimeMs) / spanMs));
    return {
      x: previousSample.position.x + (nextSample.position.x - previousSample.position.x) * alpha,
      y: previousSample.position.y + (nextSample.position.y - previousSample.position.y) * alpha,
    };
  }

  const extrapolationMs = Math.max(
    0,
    Math.min(ONLINE_EXTRAPOLATION_MS, renderAtServerMs - latestSample.serverTimeMs),
  );
  return {
    x: currentSample.position.x + currentSample.velocity.x * (extrapolationMs / 1000),
    y: currentSample.position.y + currentSample.velocity.y * (extrapolationMs / 1000),
  };
}

interface UpdateVisualPlayerPositionsArgs {
  headless: boolean;
  hasSession: boolean;
  activePlayerIds: PlayerId[];
  onlineLocalPlayerId: PlayerId;
  players: Record<PlayerId, PlayerState>;
  visualPlayerPositions: Record<PlayerId, PixelCoord>;
  onlineRenderSamples: OnlineRenderSample[];
  deltaMs: number;
  getPlayerPixelPositionFromState: (player: PlayerState) => PixelCoord;
}

export function updateVisualPlayerPositions({
  headless,
  hasSession,
  activePlayerIds,
  onlineLocalPlayerId,
  players,
  visualPlayerPositions,
  onlineRenderSamples,
  deltaMs,
  getPlayerPixelPositionFromState,
}: UpdateVisualPlayerPositionsArgs): void {
  if (headless || !hasSession) {
    for (const playerId of activePlayerIds) {
      visualPlayerPositions[playerId] = getPlayerPixelPositionFromState(players[playerId]);
    }
    return;
  }

  const frameBlend = 1 - Math.pow(1 - ONLINE_RENDER_SMOOTHING, Math.max(1, deltaMs) / FIXED_STEP_MS);
  const nowMs = typeof performance === "undefined" ? 0 : performance.now();
  for (const id of activePlayerIds) {
    const player = players[id];
    const target = getPlayerPixelPositionFromState(player);
    if (id === onlineLocalPlayerId) {
      visualPlayerPositions[id] = target;
      continue;
    }

    let projected = projectNetworkPlayerPosition(
      onlineRenderSamples,
      id,
      nowMs,
      target,
      player.velocity,
    );
    const current = visualPlayerPositions[id];

    const offsetX = projected.x - target.x;
    const offsetY = projected.y - target.y;
    const offsetDistance = Math.hypot(offsetX, offsetY);
    if (offsetDistance > ONLINE_MAX_VISUAL_LEAD_PX && offsetDistance > 0.001) {
      const scale = ONLINE_MAX_VISUAL_LEAD_PX / offsetDistance;
      projected = {
        x: target.x + offsetX * scale,
        y: target.y + offsetY * scale,
      };
    }

    visualPlayerPositions[id] = {
      x: current.x + (projected.x - current.x) * frameBlend,
      y: current.y + (projected.y - current.y) * frameBlend,
    };
  }
}
