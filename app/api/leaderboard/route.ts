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

  if (rows.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const addresses = (rows as unknown as Array<{ address: string }>).map(r => r.address);
  const addressesLower = addresses.map(a => a.toLowerCase());
  
  // Get run counts - one query for all players
  const runCountsRaw = await db.execute(sql`
    SELECT 
      user_address AS address, 
      COUNT(*)::int AS count
    FROM runs
    WHERE LOWER(user_address) IN (${sql.join(addressesLower.map(a => sql`${a}`), sql`, `)})
    GROUP BY user_address
  `);
  
  const runCounts = new Map<string, number>();
  for (const row of runCountsRaw as Array<{ address: string; count: number }>) {
    runCounts.set(row.address.toLowerCase(), row.count);
  }

  // Get countries - one query for all players
  const countriesRaw = await db.execute(sql`
    WITH ranked AS (
      SELECT 
        owner_address,
        country,
        COUNT(*) as count,
        ROW_NUMBER() OVER (PARTITION BY owner_address ORDER BY COUNT(*) DESC) as rn
      FROM hexes
      WHERE LOWER(owner_address) IN (${sql.join(addressesLower.map(a => sql`${a}`), sql`, `)})
        AND country IS NOT NULL
      GROUP BY owner_address, country
    )
    SELECT owner_address AS address, country
    FROM ranked
    WHERE rn <= 5
    ORDER BY owner_address, rn
  `);
  
  const countriesMap = new Map<string, string[]>();
  for (const row of countriesRaw as Array<{ address: string; country: string }>) {
    const addr = row.address.toLowerCase();
    const list = countriesMap.get(addr) ?? [];
    list.push(row.country);
    countriesMap.set(addr, list);
  }

  const leaderboard = (rows as unknown as Array<{ 
    address: string; 
    username: string | null; 
    hexCount: number;
  }>).map(row => {
    const addr = row.address.toLowerCase();
    return {
      address: row.address,
      username: row.username,
      hexCount: row.hexCount,
      runCount: runCounts.get(addr) ?? 0,
      countries: countriesMap.get(addr) ?? [],
      badges: [],
    };
  });

  return NextResponse.json({ leaderboard });
}
