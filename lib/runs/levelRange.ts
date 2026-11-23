/** The lowest and highest level a set of blocks was left at. */
export type LevelRange = { min: number; max: number };

/**
 * The span of a list of block levels, for a line like "now level 1-3".
 * Null when there is nothing to say: no blocks, or no level the server sent.
 */
export function levelRange(levels: readonly number[]): LevelRange | null {
  const known = levels.filter((l) => Number.isFinite(l) && l > 0);
  if (known.length === 0) return null;
  return { min: Math.min(...known), max: Math.max(...known) };
}

/** A range as the player reads it: "3", or "1-3". */
export function levelRangeLabel(range: LevelRange): string {
  return range.min === range.max
    ? String(range.min)
    : `${range.min}-${range.max}`;
}
