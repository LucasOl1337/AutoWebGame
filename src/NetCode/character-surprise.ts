export type CharacterRandomSource = () => number;

function normalizeUnitRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

export function pickSurpriseCharacterIndex(
  currentIndex: number,
  rosterLength: number,
  random: CharacterRandomSource = Math.random,
): number {
  const total = Math.max(0, Math.floor(rosterLength));
  if (total <= 1) {
    return 0;
  }

  const normalizedCurrent = ((Math.floor(currentIndex) % total) + total) % total;
  const alternateSlot = Math.floor(normalizeUnitRandom(random()) * (total - 1));

  return alternateSlot >= normalizedCurrent ? alternateSlot + 1 : alternateSlot;
}
