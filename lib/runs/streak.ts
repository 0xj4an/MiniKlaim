import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Walk a list of run days (UTC, ISO yyyy-mm-dd, newest first) and count
 * consecutive days ending today or yesterday. A streak only "counts" if the
 * most recent run day is today or yesterday; otherwise the streak is over.
 */
export function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const yesterdayUtc = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const set = new Set(days.map((d) => d.slice(0, 10)));
  if (!set.has(todayUtc) && !set.has(yesterdayUtc)) return 0;
  let streak = 0;
  let cursor = new Date(set.has(todayUtc) ? todayUtc : yesterdayUtc);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

/** Current day-streak for a player (lowercased address). */
export async function getPlayerStreak(addressLower: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT DISTINCT DATE(ended_at AT TIME ZONE 'UTC') AS day
    FROM runs
    WHERE user_address = ${addressLower} AND ended_at IS NOT NULL
    ORDER BY day DESC
    LIMIT 365
  `);
  const days = (rows as unknown as Array<{ day: string }>).map((r) =>
    String(r.day),
  );
  return computeStreak(days);
}
