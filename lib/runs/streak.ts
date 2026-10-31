import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { addressesForPlayer } from "@/lib/players";
import {
  STREAK_MIN_SERVER_METERS,
  computeBestStreak,
  computeStreak,
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
 * The zone is resolved against `pg_timezone_names` before it reaches
 * `AT TIME ZONE`, and falls back to UTC when this server does not know it.
 * The write path validates the client's string with `Intl`, but Node's ICU
 * and Postgres's tz database are two different catalogs: a zone Node accepts
 * can still make `AT TIME ZONE` raise `time zone "X" not recognized`, and
 * that error aborts the whole statement. On 30 Oct 2026 that took
 * /api/profile/[username], /api/users/[address]/stats and the streak on /me
 * to a 500 for four players, who then had no profile at all rather than a
 * streak cut at the wrong midnight. Degrading to UTC is the lesser error.
 */
export async function streakDays(addressesLower: string[]): Promise<StreakDays> {
  if (addressesLower.length === 0) return { days: [], timeZone: "UTC" };
  const list = sql.join(
    addressesLower.map((a) => sql`${a}`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    WITH claimed AS (
      SELECT COALESCE(
        (
          SELECT u.time_zone
          FROM runs r
          JOIN users u ON u.address = r.user_address
          WHERE r.user_address IN (${list}) AND u.time_zone IS NOT NULL
          ORDER BY r.started_at DESC
          LIMIT 1
        ),
        (
          SELECT time_zone FROM users
          WHERE address IN (${list}) AND time_zone IS NOT NULL
          LIMIT 1
        ),
        'UTC'
      ) AS name
    ), tz AS (
      SELECT COALESCE(
        (SELECT z.name FROM pg_timezone_names z, claimed c WHERE z.name = c.name),
        'UTC'
      ) AS name
    )
    SELECT DISTINCT
      DATE(r.ended_at AT TIME ZONE tz.name)::text AS day,
      tz.name AS tz
    FROM runs r, tz
    WHERE r.user_address IN (${list})
      AND r.ended_at IS NOT NULL
      AND (
        r.hexes_claimed > 0
        OR r.hexes_reinforced > 0
        OR r.hexes_damaged > 0
        OR r.server_distance_meters >= ${STREAK_MIN_SERVER_METERS}
      )
    ORDER BY day DESC
  `);
  const dayRows = rows as unknown as Array<{ day: string; tz: string }>;
  return {
    days: dayRows.map((r) => String(r.day)),
    timeZone: dayRows[0]?.tz ?? "UTC",
  };
}

/** Current and best streak from the days and zone `streakDays` returned. */
export function streaksFrom(
  { days, timeZone }: StreakDays,
  now = Date.now(),
): { current: number; best: number } {
  return { current: computeStreak(days, now, timeZone), best: computeBestStreak(days) };
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
