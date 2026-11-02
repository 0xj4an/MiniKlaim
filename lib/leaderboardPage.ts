import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getRanking } from "@/lib/leaderboardRanking";
import { evaluateBadges, type BadgeStats } from "@/lib/onchain/badgeCatalog";
import { createSharedCache } from "@/lib/sharedCache";

export type LeaderboardEntry = {
  address: string;
  username: string | null;
  hexCount: number;
  runCount: number;
  countries: string[];
  badges: string[];
  linked: string[];
};

/** The largest page the route will serve, so one build covers every page. */
export const MAX_PAGE = 100;

const TTL_MS = 30_000;

/**
 * The top page, enriched and shared.
 *
 * Caching the ranking took the endpoint from ~1.0 s to ~0.55 s and left a
 * floor of ~300 ms that was not the ranking: four more queries ran per
 * request, over the page's addresses, and they are what the remaining time
 * was. Each row's extras depend only on its own address, so the top 100 is
 * built once and a smaller page is a slice of it: a page of 10 and a page of
 * 100 now cost the same nothing.
 *
 * Stale-while-revalidate is on. Without it exactly one request per TTL pays
 * the whole build, which is the slow load someone would still be reporting.
 */
const cache = createSharedCache<LeaderboardEntry[]>(TTL_MS, {
  serveStaleWhileRevalidating: true,
});

export function clearLeaderboardPageCache(): void {
  cache.clear();
}

export async function getLeaderboardTop(): Promise<LeaderboardEntry[]> {
  return cache.get("top", build);
}

async function build(): Promise<LeaderboardEntry[]> {
  const ranking = await getRanking();
  const rows = ranking.rows.slice(0, MAX_PAGE);
  if (rows.length === 0) return [];

  const addressesLower = rows.map((r) => r.address.toLowerCase());
  const list = sql.join(
    addressesLower.map((a) => sql`${a}`),
    sql`, `,
  );

  const runCountsQ = db.execute(sql`
    SELECT
      user_address AS address,
      COUNT(*)::int AS count
    FROM runs
    WHERE LOWER(user_address) IN (${list})
    GROUP BY user_address
  `);

  // Every country the player holds, fullest first. Linked wallets count
  // toward the same player. The list shows three flags; the open row uses the rest.
  //
  // Owners are resolved through player_wallets only: the page's addresses plus
  // every wallet sharing their player_id. Resolving them by scanning all of
  // `users` with a correlated lookup per row made Postgres expect a
  // 224M-row join and sort the whole hexes table (~600 ms, ~1.5 s per request
  // end to end). Addresses are stored lowercase, so the hexes owner index
  // applies without LOWER().
  const countriesQ = db.execute(sql`
    WITH page AS (
      SELECT u.address AS display_address
      FROM users u
      WHERE LOWER(u.address) IN (${list})
    ),
    grp AS (
      SELECT p.display_address, pw.player_id
      FROM page p
      JOIN player_wallets pw ON pw.address = p.display_address
    ),
    owners AS (
      SELECT p.display_address, p.display_address AS owner_address
      FROM page p
      UNION
      SELECT g.display_address, pw2.address AS owner_address
      FROM grp g
      JOIN player_wallets pw2 ON pw2.player_id = g.player_id
    ),
    counts AS (
      SELECT
        o.display_address,
        h.country,
        COUNT(*)::int AS n
      FROM owners o
      JOIN hexes h ON h.owner_address = o.owner_address
      WHERE h.country IS NOT NULL
      GROUP BY o.display_address, h.country
    )
    SELECT display_address AS address, country
    FROM counts
    ORDER BY display_address, n DESC, country ASC
  `);

  // What the badge rules need, per listed player. City count is approximated
  // rather than computed: an exact one costs a pass over the player's hexes
  // and nothing on this page shows it.
  const badgeStatsQ = db.execute(sql`
    WITH player_stats AS (
      SELECT
        h.owner_address,
        -- h3_id is the primary key, so COUNT(*) is the same number without the
        -- distinct sort (780 ms to 270 ms for the top-100 page on prod data).
        COUNT(*)::int AS hex_count,
        COUNT(DISTINCT h.country)::int AS country_count
      FROM hexes h
      WHERE LOWER(h.owner_address) IN (${list})
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
      WHERE LOWER(r.user_address) IN (${list})
      GROUP BY r.user_address
    ),
    user_stats AS (
      SELECT
        u.address,
        u.conquests
      FROM users u
      WHERE LOWER(u.address) IN (${list})
    )
    SELECT
      ps.owner_address AS address,
      COALESCE(ps.hex_count, 0) AS hex_count,
      COALESCE(ps.country_count, 0) AS country_count,
      COALESCE(rs.total_runs, 0) AS total_runs,
      COALESCE(rs.best_run_hexes, 0) AS best_run_hexes,
      COALESCE(rs.best_distance, 0) AS best_distance,
      COALESCE(rs.lifetime_distance, 0) AS lifetime_distance,
      COALESCE(us.conquests, 0) AS conquests
    FROM player_stats ps
    LEFT JOIN run_stats rs ON LOWER(rs.user_address) = LOWER(ps.owner_address)
    LEFT JOIN user_stats us ON LOWER(us.address) = LOWER(ps.owner_address)
  `);

  // Every wallet linked to each listed player, so a map can paint all of a
  // player's blocks (top-10 colors), not only the display wallet's.
  const linkedQ = db.execute(sql`
    SELECT p.address AS display_address, pw2.address AS address
    FROM player_wallets p
    JOIN player_wallets pw2 ON pw2.player_id = p.player_id
    WHERE p.address IN (${list})
      AND pw2.address <> p.address
  `);

  const [runCountsRaw, countriesRaw, badgeStatsRaw, linkedRaw] =
    await Promise.all([runCountsQ, countriesQ, badgeStatsQ, linkedQ]);

  const linkedMap = new Map<string, string[]>();
  for (const row of linkedRaw as unknown as Array<{
    display_address: string;
    address: string;
  }>) {
    const key = row.display_address.toLowerCase();
    const of = linkedMap.get(key) ?? [];
    of.push(row.address.toLowerCase());
    linkedMap.set(key, of);
  }

  const runCounts = new Map<string, number>();
  for (const row of runCountsRaw as unknown as Array<{
    address: string;
    count: number;
  }>) {
    runCounts.set(row.address.toLowerCase(), row.count);
  }

  const countriesMap = new Map<string, string[]>();
  for (const row of countriesRaw as unknown as Array<{
    address: string;
    country: string;
  }>) {
    const addr = row.address.toLowerCase();
    const of = countriesMap.get(addr) ?? [];
    of.push(row.country);
    countriesMap.set(addr, of);
  }

  type StatsRow = {
    address: string;
    hex_count: number;
    country_count: number;
    total_runs: number;
    best_run_hexes: number;
    best_distance: number;
    lifetime_distance: number;
    conquests: number;
  };

  const badgesMap = new Map<string, string[]>();
  for (const row of badgeStatsRaw as unknown as StatsRow[]) {
    const stats: BadgeStats = {
      hexesOwned: row.hex_count,
      totalRuns: row.total_runs,
      bestRunHexes: row.best_run_hexes,
      bestRunDistanceMeters: row.best_distance,
      lifetimeDistanceMeters: row.lifetime_distance,
      cityCount: Math.max(1, Math.floor(row.hex_count / 10)),
      conquests: row.conquests,
      countryCount: row.country_count,
      streak: 0, // A streak costs a query of its own and no badge here shows it.
    };
    badgesMap.set(
      row.address.toLowerCase(),
      evaluateBadges(stats, "en")
        .filter((b) => b.unlocked)
        .map((b) => b.name),
    );
  }

  return rows.map((row) => {
    const addr = row.address.toLowerCase();
    return {
      address: row.address,
      username: row.username,
      hexCount: row.hexCount,
      runCount: runCounts.get(addr) ?? 0,
      countries: countriesMap.get(addr) ?? [],
      badges: badgesMap.get(addr) ?? [],
      linked: linkedMap.get(addr) ?? [],
    };
  });
}
