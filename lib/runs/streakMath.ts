// Pure streak helpers, safe to import from client components.

/** Day-streak thresholds that unlock a badge, ascending. */
export const STREAK_BADGE_DAYS = [3, 7, 14, 30, 60, 90, 180, 365] as const;

/**
 * A run with no new block still keeps the streak if the server measured at
 * least this much movement along its hex path. Veterans walk their own
 * territory, where nothing is new; an empty open-and-close run measures 0.
 */
export const STREAK_MIN_SERVER_METERS = 200;

const DAY_MS = 86_400_000;

function dayKey(d: string): string {
  return d.slice(0, 10);
}

/** True when `tz` is an IANA zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar day (yyyy-mm-dd) of `now` in `timeZone` (UTC when missing or invalid). */
export function localDay(now: number, timeZone?: string | null): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** The calendar day before `day` (both yyyy-mm-dd). */
function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * Walk a list of run days (ISO yyyy-mm-dd, in the player's time zone) and
 * count consecutive days ending today or yesterday, where "today" is taken in
 * the same zone. A streak only counts if the most recent run day is today or
 * yesterday; otherwise the streak is over.
 */
export function computeStreak(
  days: string[],
  now = Date.now(),
  timeZone?: string | null,
): number {
  if (days.length === 0) return 0;
  const today = localDay(now, timeZone);
  const yesterday = previousDay(today);
  const set = new Set(days.map(dayKey));
  if (!set.has(today) && !set.has(yesterday)) return 0;
  let streak = 0;
  let cursor = set.has(today) ? today : yesterday;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
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
