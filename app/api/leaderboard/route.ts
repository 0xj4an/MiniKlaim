import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type LeaderSqlRow = {
  address: string;
  username: string | null;
  hexCount: number;
  runCount: number;
};

type CountrySqlRow = {
  address: string;
  country: string;
};

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

  // Get leaderboard entries
  const rows = await db.execute<LeaderSqlRow>(sql`
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
        COUNT(h.h3_id) AS hex_count,
        COUNT(DISTINCT r.id) AS run_count
      FROM group_map gm
      LEFT JOIN hexes h ON h.owner_address = gm.address
      LEFT JOIN runs r ON r.user_address = gm.address
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
      ghc.hex_count::int AS "hexCount",
      ghc.run_count::int AS "runCount"
    FROM group_hex_counts ghc
    INNER JOIN group_display gd ON gd.group_key = ghc.group_key
    ORDER BY ghc.hex_count DESC, gd.address ASC
    LIMIT ${limit}
  `);

  const addresses = rows.map((r) => r.address.toLowerCase());
  const countriesData: CountrySqlRow[] =
    addresses.length === 0
      ? []
      : await db.execute<CountrySqlRow>(sql`
      SELECT
        owner_address AS address,
        country,
        COUNT(*)::int AS count
      FROM hexes
      WHERE LOWER(owner_address) = ANY(${addresses})
        AND country IS NOT NULL
      GROUP BY owner_address, country
      ORDER BY owner_address, count DESC
    `);

  const countriesByAddr = new Map<string, string[]>();
  for (const row of countriesData) {
    const addr = row.address.toLowerCase();
    const list = countriesByAddr.get(addr) ?? [];
    if (list.length >= 5) continue;
    list.push(row.country);
    countriesByAddr.set(addr, list);
  }

  const leaderboard = rows.map((row) => {
    const addr = row.address.toLowerCase();
    return {
      address: row.address,
      username: row.username,
      hexCount: row.hexCount,
      runCount: row.runCount,
      countries: countriesByAddr.get(addr) ?? [],
      // Held badges are on-chain only. There is no badges table.
      badges: [],
    };
  });

  return NextResponse.json({ leaderboard });
}
