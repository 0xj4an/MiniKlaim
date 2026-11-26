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

/**
 * One formatter per zone, built once.
 *
 * Building an `Intl.DateTimeFormat` loads the zone's rules and is expensive;
 * using one is cheap. Both helpers below used to build a fresh one per call,
 * and the streak is computed from every run a player has: about 1.5 s of CPU
 * per stats request for a player with a few thousand runs, profiled in
 * production on 26 Nov 2026, and the largest single cause of the server
 * stalling when someone opened the app. Players use a handful of zones, so
 * the cache stays tiny; it is capped anyway so a client sending made-up
 * zone names cannot grow it.
 */
const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();
const BAD_ZONES = new Set<string>();
const MAX_ZONES = 500;

function dayFormat(tz: string): Intl.DateTimeFormat | null {
  const hit = DAY_FORMATS.get(tz);
  if (hit) return hit;
  if (BAD_ZONES.has(tz)) return null;
  let made: Intl.DateTimeFormat;
  try {
    // en-CA formats as yyyy-mm-dd.
    made = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    if (BAD_ZONES.size < MAX_ZONES) BAD_ZONES.add(tz);
    return null;
  }
  if (DAY_FORMATS.size < MAX_ZONES) DAY_FORMATS.set(tz, made);
  return made;
}

/** True when `tz` is an IANA zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  return dayFormat(tz) !== null;
}

/** Calendar day (yyyy-mm-dd) of `now` in `timeZone` (UTC when missing or invalid). */
export function localDay(now: number, timeZone?: string | null): string {
  const format =
    (typeof timeZone === "string" &&
      timeZone.length > 0 &&
      timeZone.length <= 64 &&
      dayFormat(timeZone)) ||
    (dayFormat("UTC") as Intl.DateTimeFormat);
  return format.format(new Date(now));
}

/**
 * Rest days: every REST_DAY_EVERY days played in a row earn one, at most
 * REST_DAYS_MAX are held, and a missed day spends one by itself instead of
 * ending the streak.
 *
 * Until 17 Nov 2026 one missed day reset the count, whatever its length: a
 * 21-day streak went to 1 over a single Monday. The numbers are the ones the
 * rule was asked for in: a week still has to be seven days in a row, two
 * weeks can carry one missed day, a month about three. Other games do the
 * same with a held, limited allowance (Duolingo's streak freeze, Zwift's
 * streak savers). Simulated on every player that day, it changes six
 * streaks and one 14-day badge; it matters as streaks grow.
 */
export const REST_DAY_EVERY = 10;
export const REST_DAYS_MAX = 3;

export type StreakState = {
  /** Days played in the live streak. Rest days keep it alive, they do not add. */
  current: number;
  /** Longest streak ever, by the same rule. */
  best: number;
  /** Rest days held right now, after any that are covering missed days. */
  restDays: number;
  /** Missed days since the last day played that a rest day is covering. */
  restDaysCovering: number;
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * Walk the run days (ISO yyyy-mm-dd, any order) and return the live streak,
 * the best one and the rest days held. "Today" is taken in `timeZone`. The
 * streak is alive while every day missed since the last one played is
 * covered by a rest day; today itself is never missed until it is over.
 */
export function streakState(
  days: string[],
  now = Date.now(),
  timeZone?: string | null,
): StreakState {
  const sorted = [...new Set(days.map(dayKey))].sort();
  let chain = 0;
  let bank = 0;
  let best = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    const gap: number = prev === null ? 0 : daysBetween(prev, day) - 1;
    if (prev === null) {
      chain = 1;
    } else if (gap === 0) {
      chain += 1;
    } else if (gap <= bank) {
      bank -= gap;
      chain += 1;
    } else {
      chain = 1;
      bank = 0;
    }
    if (chain % REST_DAY_EVERY === 0 && bank < REST_DAYS_MAX) bank += 1;
    if (chain > best) best = chain;
    prev = day;
  }
  if (prev === null) return { current: 0, best: 0, restDays: 0, restDaysCovering: 0 };
  const missed = Math.max(0, daysBetween(prev, localDay(now, timeZone)) - 1);
  if (missed > bank) return { current: 0, best, restDays: 0, restDaysCovering: 0 };
  return { current: chain, best, restDays: bank - missed, restDaysCovering: missed };
}

/**
 * The live streak: days played in a row ending today or yesterday, where a
 * rest day can stand in for a missed one (see REST_DAY_EVERY). Zero once a
 * missed day has no rest day to cover it.
 */
export function computeStreak(
  days: string[],
  now = Date.now(),
  timeZone?: string | null,
): number {
  return streakState(days, now, timeZone).current;
}

/** Longest streak anywhere in the list (order-free), by the same rule. */
export function computeBestStreak(days: string[]): number {
  return streakState(days, 0).best;
}

/** Days still to play in a row before the next rest day is earned. */
export function daysToNextRestDay(streak: number): number {
  return REST_DAY_EVERY - (streak % REST_DAY_EVERY);
}

/** The next streak badge threshold above `streak`, or null past the last. */
export function nextStreakBadge(streak: number): number | null {
  return STREAK_BADGE_DAYS.find((d) => d > streak) ?? null;
}
