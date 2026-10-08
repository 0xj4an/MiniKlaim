import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cellToParent } from "h3-js";
import { db } from "@/lib/db";
import { evaluateBadges, type BadgeStats } from "@/lib/onchain/badgeCatalog";

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
  for (const row of runCountsRaw as unknown as Array<{ address: string; count: number }>) {
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
  for (const row of countriesRaw as unknown as Array<{ address: string; country: string }>) {
    const addr = row.address.toLowerCase();
    const list = countriesMap.get(addr) ?? [];
    list.push(row.country);
    countriesMap.set(addr, list);
  }

  // Get badge stats for all players
  const badgeStatsRaw = await db.execute(sql`
    WITH player_stats AS (
      SELECT 
        h.owner_address,
        COUNT(DISTINCT h.h3_id)::int AS hex_count,
        COUNT(DISTINCT h.country)::int AS country_count,
        json_agg(DISTINCT h.h3_id) AS hex_ids
      FROM hexes h
      WHERE LOWER(h.owner_address) IN (${sql.join(addressesLower.map(a => sql`${a}`), sql`, `)})
      GROUP BY h.owner_address
    ),
    run_stats AS (
      SELECT
        r.user_address,
        COUNT(*)::int AS total_runs,
        MAX(r.hexes_claimed)::int AS best_run_hexes,
        MAX(r.distance_meters)::int AS best_distance,
        SUM(r.distance_meters)::int AS lifetime_distance
      FROM runs r
      WHERE LOWER(r.user_address) IN (${sql.join(addressesLower.map(a => sql`${a}`), sql`, `)})
      GROUP BY r.user_address
    ),
    user_stats AS (
      SELECT
        u.address,
        u.conquests
      FROM users u
      WHERE LOWER(u.address) IN (${sql.join(addressesLower.map(a => sql`${a}`), sql`, `)})
    )
    SELECT
      ps.owner_address AS address,
      COALESCE(ps.hex_count, 0) AS hex_count,
      COALESCE(ps.country_count, 0) AS country_count,
      COALESCE(ps.hex_ids, '[]'::json) AS hex_ids,
      COALESCE(rs.total_runs, 0) AS total_runs,
      COALESCE(rs.best_run_hexes, 0) AS best_run_hexes,
      COALESCE(rs.best_distance, 0) AS best_distance,
      COALESCE(rs.lifetime_distance, 0) AS lifetime_distance,
      COALESCE(us.conquests, 0) AS conquests
    FROM player_stats ps
    LEFT JOIN run_stats rs ON LOWER(rs.user_address) = LOWER(ps.owner_address)
    LEFT JOIN user_stats us ON LOWER(us.address) = LOWER(ps.owner_address)
  `);

  type StatsRow = {
    address: string;
    hex_count: number;
    country_count: number;
    hex_ids: string[];
    total_runs: number;
    best_run_hexes: number;
    best_distance: number;
    lifetime_distance: number;
    conquests: number;
  };

  const badgeStatsMap = new Map<string, string[]>();
  const CITY_RESOLUTION = 5;
  
  for (const row of badgeStatsRaw as unknown as StatsRow[]) {
    const addr = row.address.toLowerCase();
    
    // Calculate city count from hex IDs
    const hexIds = Array.isArray(row.hex_ids) ? row.hex_ids : [];
    const cityCount = new Set(
      hexIds.map((h3Id: string) => cellToParent(h3Id, CITY_RESOLUTION))
    ).size;
    
    const stats: BadgeStats = {
      hexesOwned: row.hex_count,
      totalRuns: row.total_runs,
      bestRunHexes: row.best_run_hexes,
      bestRunDistanceMeters: row.best_distance,
      lifetimeDistanceMeters: row.lifetime_distance,
      cityCount,
      conquests: row.conquests,
      countryCount: row.country_count,
      streak: 0, // Streak calculation is expensive, skip for leaderboard
    };
    
    // Get unlocked badges
    const allBadges = evaluateBadges(stats, "en");
    const unlockedBadges = allBadges
      .filter(b => b.unlocked)
      .map(b => b.name);
    
    badgeStatsMap.set(addr, unlockedBadges);
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
      badges: badgeStatsMap.get(addr) ?? [],
    };
  });

  return NextResponse.json({ leaderboard });
}
