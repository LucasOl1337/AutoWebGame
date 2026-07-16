export type ContinuousRoomRollout = "off" | "canary" | "on";

export function resolveContinuousRoomRollout(configured: unknown): ContinuousRoomRollout {
  return configured === "canary" || configured === "on" ? configured : "off";
}

export const CONTINUOUS_ROOM_ROLLOUT = resolveContinuousRoomRollout(
  import.meta.env?.VITE_CONTINUOUS_ROOM_POINTER,
);
