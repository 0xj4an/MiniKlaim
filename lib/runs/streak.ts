import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { addressesForPlayer } from "@/lib/players";
import {
  STREAK_MIN_SERVER_METERS,
  computeBestStreak,
  computeStreak,
  isValidTimeZone,
  localDay,
} from "@/lib/runs/streakMath";

export {
  STREAK_BADGE_DAYS,
  STREAK_MIN_SERVER_METERS,
  computeBestStreak,
  computeStreak,
  isValidTimeZone,
  nextStreakBadge,
} from "@/lib/runs/streakMath";

export type StreakDays = {
  /** Distinct run days, yyyy-mm-dd in `timeZone`, newest first. */
  days: string[];
  /** IANA zone the days are in ("UTC" when the player never sent one). */
  timeZone: string;
};

/**
 * Distinct days, in the player's own time zone, on which these wallets
 * finished a run that counts for the streak: it captured at least one new
 * block, reinforced or attacked one (hex strength), or the server measured at
 * least STREAK_MIN_SERVER_METERS of movement (a player walking their own
 * territory captures nothing new). Runs opened and closed without moving
 * still do not count.
 *
 * The zone is the one saved on the wallet that ran most recently (sent by the
 * client when a run starts). Days used to be cut at UTC midnight, which split
 * an evening run in Mexico onto the next day and broke real streaks.
 *
 * The day boundary is cut in JS, not in SQL, and that is the whole point of
 * how this is written.
 *
 * Node's ICU and Postgres's tz database are two different catalogs. The write
 * path validates the client's string with `Intl`, which accepts legacy
 * aliases, and Postgres only carries canonical names: `Asia/Calcutta` is a
 * zone Node is happy with and `AT TIME ZONE` rejects outright. On 30 Oct 2026
 * that raised `time zone "X" not recognized`, which aborts the whole
 * statement, and took /api/profile/[username], /api/users/[address]/stats and
 * the streak on /me to a 500 for four players (P65).
 *
 * That fix resolved the name against `pg_timezone_names` and fell back to
 * UTC, which stopped the 500 and left a quieter bug in its place: a player
 * whose zone Postgres does not know had their streak silently counted in UTC.
 * On 7 Nov 2026 that cost 0xj4an a real streak. In UTC his run days have a
 * hole at 6 Nov, because an evening run in India lands on the far side of UTC
 * midnight, so the chain reset to 1; in `Asia/Calcutta` it runs unbroken from
 * 28 Oct. He was not alone: 19 players carried `Asia/Calcutta` and 2
 * `America/Buenos_Aires`, which is also what triggered the original P65
 * incident that went down as having no identified cause.
 *
 * Canonicalising on the way in does not work either, and this was measured
 * rather than assumed: on Node 22 `Intl` resolves `Asia/Kolkata` to
 * `Asia/Calcutta`, which is the direction Postgres cannot use.
 *
 * So SQL returns the raw timestamps and `localDay` buckets them, using the
 * same ICU that accepted the zone in the first place and the same helper the
 * client already uses. Postgres's catalog stops mattering, the class of bug
 * disappears instead of being caught, and no stored zone needs migrating.
 */
export async function streakDays(
  addressesLower: string[],
): Promise<StreakDays> {
  if (addressesLower.length === 0) return { days: [], timeZone: "UTC" };
  const list = sql.join(
    addressesLower.map((a) => sql`${a}`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    SELECT
      r.ended_at AS ended_at,
      (
        SELECT u.time_zone
        FROM runs r2
        JOIN users u ON u.address = r2.user_address
        WHERE r2.user_address IN (${list}) AND u.time_zone IS NOT NULL
        ORDER BY r2.started_at DESC
        LIMIT 1
      ) AS tz
    FROM runs r
    WHERE r.user_address IN (${list})
      AND r.ended_at IS NOT NULL
      AND (
        r.hexes_claimed > 0
        OR r.hexes_reinforced > 0
        OR r.hexes_damaged > 0
        OR r.server_distance_meters >= ${STREAK_MIN_SERVER_METERS}
      )
    ORDER BY r.ended_at DESC
  `);
  const runRows = rows as unknown as Array<{
    ended_at: string | Date;
    tz: string | null;
  }>;

  // One row per qualifying run rather than per day, because the bucketing
  // moved to JS. A player with years of daily runs is still in the hundreds
  // of rows, and the dedupe below collapses them before anyone sees them.
  const timeZone = isValidTimeZone(runRows[0]?.tz) ? runRows[0].tz : "UTC";

  const seen = new Set<string>();
  const days: string[] = [];
  for (const row of runRows) {
    const at =
      row.ended_at instanceof Date
        ? row.ended_at.getTime()
        : Date.parse(String(row.ended_at));
    if (Number.isNaN(at)) continue;
    const day = localDay(at, timeZone);
    if (seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }

  return { days, timeZone };
}

/** Current and best streak from the days and zone `streakDays` returned. */
export function streaksFrom(
  { days, timeZone }: StreakDays,
  now = Date.now(),
): { current: number; best: number } {
  return {
    current: computeStreak(days, now, timeZone),
    best: computeBestStreak(days),
  };
}

/**
 * Current and best day-streak for a player (lowercased address), across every
 * wallet linked to that player, so /me, the public profile and the run
 * summary agree.
 */
export async function getPlayerStreaks(
  addressLower: string,
): Promise<{ current: number; best: number }> {
  const linked = await addressesForPlayer(addressLower);
  return streaksFrom(await streakDays(linked));
}

/** Current day-streak for a player (lowercased address). */
export async function getPlayerStreak(addressLower: string): Promise<number> {
  return (await getPlayerStreaks(addressLower)).current;
}
