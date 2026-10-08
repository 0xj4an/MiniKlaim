import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Rank by per-player aggregated hex count. Each user is grouped by their
 * `player_id` (via `player_wallets`) when linked, else by their own address
 * as a fallback. One row per group, using the group's primary wallet
 * address and its username (or any linked wallet's username, primary
 * first). Unlinked users behave exactly as before.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    100,
  );

  const rows = await db.execute(sql`
    WITH group_map AS (
      SELECT
        u.address,
        u.username,
        COALESCE(
          (SELECT pw.player_id::text
           FROM player_wallets pw
           WHERE pw.address = u.address
           LIMIT 1),
          u.address
        ) AS group_key
      FROM users u
    ),
    group_hex_counts AS (
      SELECT
        gm.group_key,
        COUNT(h.h3_id) AS hex_count
      FROM group_map gm
      LEFT JOIN hexes h ON h.owner_address = gm.address
      GROUP BY gm.group_key
    ),
    group_display AS (
      SELECT DISTINCT ON (gm.group_key)
        gm.group_key,
        gm.address,
        gm.username
      FROM group_map gm
      LEFT JOIN player_wallets pw ON pw.address = gm.address
      ORDER BY
        gm.group_key,
        (gm.username IS NOT NULL) DESC,
        COALESCE(pw.is_primary, false) DESC,
        gm.address ASC
    )
    SELECT
      gd.address AS "address",
      gd.username AS "username",
      ghc.hex_count::int AS "hexCount"
    FROM group_hex_counts ghc
    INNER JOIN group_display gd ON gd.group_key = ghc.group_key
    ORDER BY ghc.hex_count DESC, gd.address ASC
    LIMIT ${limit}
  `);

  // Get additional data for each player
  const leaderboard: Array<{
    address: string;
    username: string | null;
    hexCount: number;
    runCount: number;
    countries: string[];
    badges: string[];
  }> = [];

  for (const row of rows as Array<{ address: string; username: string | null; hexCount: number }>) {
    const addr = row.address.toLowerCase();
    
    // Get run count for this player
    const runCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM runs
      WHERE LOWER(user_address) = ${addr}
    `);
    const runCount = (runCountResult[0] as { count: number })?.count ?? 0;

    // Get top 5 countries for this player
    const countriesResult = await db.execute(sql`
      SELECT country, COUNT(*)::int AS count
      FROM hexes
      WHERE LOWER(owner_address) = ${addr}
        AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 5
    `);
    const countries = (countriesResult as Array<{ country: string }>).map(c => c.country);

    leaderboard.push({
      address: row.address,
      username: row.username,
      hexCount: row.hexCount,
      runCount,
      countries,
      badges: [],
    });
  }

  return NextResponse.json({ leaderboard });
}
