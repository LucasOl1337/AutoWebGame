export type AnimationPlayback = "loop" | "hold";

export function pickAnimationFrame<T>(
  frames: T[],
  elapsedMs: number,
  frameMs: number,
  playback: AnimationPlayback = "loop",
): T | null {
  if (frames.length === 0) {
    return null;
  }

  if (frameMs <= 0) {
    return frames[frames.length - 1] ?? null;
  }

  const rawIndex = Math.max(0, Math.floor(Math.max(0, elapsedMs) / frameMs));
  const frameIndex = playback === "hold"
    ? Math.min(rawIndex, frames.length - 1)
    : rawIndex % frames.length;

  return frames[frameIndex] ?? frames[frames.length - 1] ?? null;
}
