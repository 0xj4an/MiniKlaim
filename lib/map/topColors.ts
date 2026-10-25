/**
 * One color per player in the top 10 of the leaderboard, painted on their
 * blocks instead of the gray used for other players, and shown next to their
 * name on /community. Rank 1 gets the first color. None of them is orange
 * (your own blocks), red (this run) or gray (everyone else).
 */
export const TOP_COLORS = [
  "#2563EB", // blue
  "#16A34A", // green
  "#9333EA", // purple
  "#DB2777", // pink
  "#0891B2", // cyan
  "#CA8A04", // gold
  "#65A30D", // lime
  "#1E3A8A", // navy
  "#C026D3", // magenta
  "#0F766E", // dark teal
] as const;

export const TOP_COLOR_COUNT = TOP_COLORS.length;

/**
 * Lowercased wallet -> color for the first 10 entries, linked wallets
 * included. Entries must be in rank order.
 */
export function topColorMap(
  entries: ReadonlyArray<{ address: string; linked?: string[] }> | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!entries) return out;
  entries.slice(0, TOP_COLOR_COUNT).forEach((entry, i) => {
    const color = TOP_COLORS[i];
    out.set(entry.address.toLowerCase(), color);
    for (const linked of entry.linked ?? []) out.set(linked.toLowerCase(), color);
  });
  return out;
}

/** Color for a leaderboard rank (1-based), or null outside the top 10. */
export function topColorForRank(rank: number): string | null {
  return rank >= 1 && rank <= TOP_COLOR_COUNT ? TOP_COLORS[rank - 1] : null;
}
