import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { computeBestStreak, computeStreak } from "@/lib/runs/streakMath";

export {
  STREAK_BADGE_DAYS,
  computeBestStreak,
  computeStreak,
  nextStreakBadge,
} from "@/lib/runs/streakMath";

/**
 * Distinct UTC days on which these wallets finished a run that captured at
 * least one block. Empty runs do not count: opening a run and closing it
 * without moving used to keep a streak (and earn streak badges) alive.
 */
export async function streakDays(addressesLower: string[]): Promise<string[]> {
  if (addressesLower.length === 0) return [];
  const list = sql.join(
    addressesLower.map((a) => sql`${a}`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    SELECT DISTINCT DATE(ended_at AT TIME ZONE 'UTC')::text AS day
    FROM runs
    WHERE user_address IN (${list})
      AND ended_at IS NOT NULL
      AND hexes_claimed > 0
    ORDER BY day DESC
  `);
  return (rows as unknown as Array<{ day: string }>).map((r) => String(r.day));
}

/** Current and best day-streak for a player (lowercased address). */
export async function getPlayerStreaks(
  addressLower: string,
): Promise<{ current: number; best: number }> {
  const days = await streakDays([addressLower]);
  return { current: computeStreak(days), best: computeBestStreak(days) };
}

/** Current day-streak for a player (lowercased address). */
export async function getPlayerStreak(addressLower: string): Promise<number> {
  return (await getPlayerStreaks(addressLower)).current;
}
