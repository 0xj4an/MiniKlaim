// Pure streak helpers, safe to import from client components.

/** Day-streak thresholds that unlock a badge, ascending. */
export const STREAK_BADGE_DAYS = [3, 7, 14, 30, 60, 90, 180, 365] as const;

const DAY_MS = 86_400_000;

function dayKey(d: string): string {
  return d.slice(0, 10);
}

/**
 * Walk a list of run days (UTC, ISO yyyy-mm-dd) and count consecutive days
 * ending today or yesterday. A streak only "counts" if the most recent run day
 * is today or yesterday; otherwise the streak is over.
 */
export function computeStreak(days: string[], now = Date.now()): number {
  if (days.length === 0) return 0;
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  const yesterdayUtc = new Date(now - DAY_MS).toISOString().slice(0, 10);
  const set = new Set(days.map(dayKey));
  if (!set.has(todayUtc) && !set.has(yesterdayUtc)) return 0;
  let streak = 0;
  let cursor = new Date(set.has(todayUtc) ? todayUtc : yesterdayUtc);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/** Longest run of consecutive days anywhere in the list (order-free). */
export function computeBestStreak(days: string[]): number {
  const sorted = [...new Set(days.map(dayKey))].sort();
  let best = 0;
  let current = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = Date.parse(d);
    current = prev !== null && t - prev === DAY_MS ? current + 1 : 1;
    prev = t;
    if (current > best) best = current;
  }
  return best;
}

/** The next streak badge threshold above `streak`, or null past the last. */
export function nextStreakBadge(streak: number): number | null {
  return STREAK_BADGE_DAYS.find((d) => d > streak) ?? null;
}
