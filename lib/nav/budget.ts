/**
 * Keeps navigation inside the provider's free plan.
 *
 * The free plan is a fixed number of credits a day and every search or route
 * costs one. Going over would either cut the service off or start a bill, so
 * the app stops asking first: once the day's budget is spent, navigation
 * answers "not available right now" and a run carries on without it.
 *
 * One web instance serves the app, so process memory is enough (same
 * reasoning as lib/supportRateLimit). A deploy resets the count, which errs
 * toward spending a little more on deploy days; the margin below the real
 * limit covers that.
 */

/** Geoapify's free plan allows 3000 a day; the rest is margin. */
export const DAILY_BUDGET = 2700;

/** One player, per minute. A destination takes a handful of requests. */
const PER_CLIENT_PER_MINUTE = 20;
const MINUTE_MS = 60_000;

let day = "";
let spent = 0;
const perClient = new Map<string, number[]>();

function today(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export type BudgetAnswer = "ok" | "client_limited" | "day_spent";

/** Ask before every provider request. "ok" has already counted it. */
export function spendNavCredit(
  clientKey: string,
  now = Date.now(),
): BudgetAnswer {
  const current = today(now);
  if (current !== day) {
    day = current;
    spent = 0;
  }
  if (spent >= DAILY_BUDGET) return "day_spent";

  const recent = (perClient.get(clientKey) ?? []).filter(
    (t) => now - t < MINUTE_MS,
  );
  if (recent.length >= PER_CLIENT_PER_MINUTE) {
    perClient.set(clientKey, recent);
    return "client_limited";
  }
  recent.push(now);
  perClient.set(clientKey, recent);
  if (perClient.size > 5000) {
    for (const [key, times] of perClient) {
      if (times.every((t) => now - t >= MINUTE_MS)) perClient.delete(key);
    }
  }

  spent += 1;
  return "ok";
}

export function navCreditsLeft(now = Date.now()): number {
  return today(now) === day ? Math.max(0, DAILY_BUDGET - spent) : DAILY_BUDGET;
}

export function resetNavBudget(): void {
  day = "";
  spent = 0;
  perClient.clear();
}
