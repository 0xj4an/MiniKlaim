import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badgesContractAddress } from "@/lib/onchain/badges";
import { hexesContractAddress } from "@/lib/onchain/hexes";

export const dynamic = "force-dynamic";

type Row<T> = T;

/**
 * Public analytics dashboard endpoint. Powers `/stats` page and the MiniPay
 * listing evaluators (Stage 2 §8). Includes:
 *
 * - Lifetime counts (users, hexes, runs, distance).
 * - Active-user rolling windows: DAU (24h), WAU (7d), MAU (30d).
 * - Retention cohorts: D1, D7, D30 (percentage of players from a cohort day
 *   who returned N days later). Rolling over last 60 days of cohorts,
 *   averaged.
 * - On-chain: hexes minted, distinct capture txs, unique on-chain holders,
 *   plus contract addresses for Celoscan linkage.
 * - Country distribution (top 10 by hex count) for geography charts.
 */
export async function GET() {
  const queries = await Promise.all([
    // Lifetime.
    db.execute(sql`SELECT COUNT(*)::int AS c FROM users`),
    db.execute(sql`SELECT COUNT(*)::int AS c FROM hexes`),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(distance_meters), 0)::int AS c FROM runs`,
    ),
    // Activity windows (DAU, WAU, MAU).
    db.execute(
      sql`SELECT COUNT(DISTINCT user_address)::int AS c FROM runs WHERE started_at >= now() - interval '24 hours'`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT user_address)::int AS c FROM runs WHERE started_at >= now() - interval '7 days'`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT user_address)::int AS c FROM runs WHERE started_at >= now() - interval '30 days'`,
    ),
    // Runs volume windows.
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '24 hours'`,
    ),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '7 days'`,
    ),
    // On-chain.
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM hexes WHERE minted_at IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT mint_tx_hash)::int AS c FROM hexes WHERE mint_tx_hash IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT owner_address)::int AS c FROM hexes WHERE minted_at IS NOT NULL`,
    ),
    // On-chain activity windows.
    db.execute(
      sql`SELECT COUNT(DISTINCT mint_tx_hash)::int AS c FROM hexes WHERE minted_at >= now() - interval '24 hours' AND mint_tx_hash IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT mint_tx_hash)::int AS c FROM hexes WHERE minted_at >= now() - interval '7 days' AND mint_tx_hash IS NOT NULL`,
    ),
    // Retention: average D1/D7/D30 return rate over last 60 days of cohorts.
    // A "cohort day" = day of user's first run. Returned = ran at least one
    // more time exactly N days later (within 24h grace).
    db.execute(sql`
      WITH first_runs AS (
        SELECT user_address, DATE_TRUNC('day', MIN(started_at)) AS cohort_day
        FROM runs
        GROUP BY user_address
      ),
      cohorts AS (
        SELECT cohort_day, COUNT(*)::float AS cohort_size
        FROM first_runs
        WHERE cohort_day >= NOW() - INTERVAL '60 days'
          AND cohort_day < NOW() - INTERVAL '1 day'
        GROUP BY cohort_day
      ),
      d1 AS (
        SELECT fr.cohort_day, COUNT(DISTINCT fr.user_address)::float AS returned
        FROM first_runs fr
        WHERE EXISTS (
          SELECT 1 FROM runs r
          WHERE r.user_address = fr.user_address
            AND r.started_at >= fr.cohort_day + INTERVAL '1 day'
            AND r.started_at < fr.cohort_day + INTERVAL '2 days'
        )
        GROUP BY fr.cohort_day
      )
      SELECT COALESCE(
        AVG(d1.returned / c.cohort_size),
        0
      )::float AS c
      FROM cohorts c
      LEFT JOIN d1 ON d1.cohort_day = c.cohort_day
    `),
    db.execute(sql`
      WITH first_runs AS (
        SELECT user_address, DATE_TRUNC('day', MIN(started_at)) AS cohort_day
        FROM runs
        GROUP BY user_address
      ),
      cohorts AS (
        SELECT cohort_day, COUNT(*)::float AS cohort_size
        FROM first_runs
        WHERE cohort_day >= NOW() - INTERVAL '60 days'
          AND cohort_day < NOW() - INTERVAL '7 days'
        GROUP BY cohort_day
      ),
      d7 AS (
        SELECT fr.cohort_day, COUNT(DISTINCT fr.user_address)::float AS returned
        FROM first_runs fr
        WHERE EXISTS (
          SELECT 1 FROM runs r
          WHERE r.user_address = fr.user_address
            AND r.started_at >= fr.cohort_day + INTERVAL '7 days'
            AND r.started_at < fr.cohort_day + INTERVAL '8 days'
        )
        GROUP BY fr.cohort_day
      )
      SELECT COALESCE(
        AVG(d7.returned / c.cohort_size),
        0
      )::float AS c
      FROM cohorts c
      LEFT JOIN d7 ON d7.cohort_day = c.cohort_day
    `),
    db.execute(sql`
      WITH first_runs AS (
        SELECT user_address, DATE_TRUNC('day', MIN(started_at)) AS cohort_day
        FROM runs
        GROUP BY user_address
      ),
      cohorts AS (
        SELECT cohort_day, COUNT(*)::float AS cohort_size
        FROM first_runs
        WHERE cohort_day >= NOW() - INTERVAL '90 days'
          AND cohort_day < NOW() - INTERVAL '30 days'
        GROUP BY cohort_day
      ),
      d30 AS (
        SELECT fr.cohort_day, COUNT(DISTINCT fr.user_address)::float AS returned
        FROM first_runs fr
        WHERE EXISTS (
          SELECT 1 FROM runs r
          WHERE r.user_address = fr.user_address
            AND r.started_at >= fr.cohort_day + INTERVAL '30 days'
            AND r.started_at < fr.cohort_day + INTERVAL '31 days'
        )
        GROUP BY fr.cohort_day
      )
      SELECT COALESCE(
        AVG(d30.returned / c.cohort_size),
        0
      )::float AS c
      FROM cohorts c
      LEFT JOIN d30 ON d30.cohort_day = c.cohort_day
    `),
    // Top countries by hex count (for geography chart).
    db.execute(sql`
      SELECT country, COUNT(*)::int AS count
      FROM hexes
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
    `),
    // Runs by how they were done. Stored move_mode, else the same speed
    // buckets as lib/runs/moveMode.ts. Only runs that captured something.
    db.execute(sql`
      WITH r AS (
        SELECT
          hexes_claimed,
          distance_meters,
          EXTRACT(EPOCH FROM (ended_at - started_at)) AS secs,
          move_mode
        FROM runs
        WHERE ended_at IS NOT NULL AND hexes_claimed > 0
      )
      SELECT
        COALESCE(move_mode, CASE
          WHEN distance_meters < 30 OR secs < 20 THEN 'none'
          WHEN distance_meters / secs * 3.6 >= 100 THEN 'plane'
          WHEN distance_meters / secs * 3.6 >= 40 THEN 'car'
          WHEN distance_meters / secs * 3.6 >= 15 THEN 'bike'
          ELSE 'foot'
        END) AS mode,
        COUNT(*)::int AS runs,
        COALESCE(SUM(hexes_claimed), 0)::int AS blocks,
        COALESCE(SUM(distance_meters), 0)::bigint::float AS meters
      FROM r
      GROUP BY 1
    `),
    // Typical run (moved at least 30 m and captured something) and records.
    db.execute(sql`
      SELECT
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at))), 0)::float AS median_secs,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY distance_meters), 0)::float AS median_meters,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hexes_claimed), 0)::float AS median_blocks,
        COALESCE(MAX(hexes_claimed), 0)::int AS best_blocks,
        COALESCE(MAX(distance_meters), 0)::int AS best_meters
      FROM runs
      WHERE ended_at IS NOT NULL AND hexes_claimed > 0 AND distance_meters >= 30
    `),
    // Runs per day, last 14 days (UTC).
    db.execute(sql`
      SELECT TO_CHAR(g.d, 'YYYY-MM-DD') AS "day", COALESCE(x.n, 0)::int AS runs
      FROM generate_series(
        DATE_TRUNC('day', NOW()) - INTERVAL '13 days',
        DATE_TRUNC('day', NOW()),
        INTERVAL '1 day'
      ) AS g(d)
      LEFT JOIN (
        SELECT DATE_TRUNC('day', ended_at) AS dd, COUNT(*) AS n
        FROM runs
        WHERE ended_at >= DATE_TRUNC('day', NOW()) - INTERVAL '13 days'
          AND hexes_claimed > 0
        GROUP BY 1
      ) x ON x.dd = g.d
      ORDER BY g.d
    `),
    // Blocks taken from another player, all time.
    db.execute(sql`SELECT COALESCE(SUM(conquests), 0)::int AS c FROM users`),
    // Cities within top countries.
    db.execute(sql`
      SELECT country, city, COUNT(*)::int AS count
      FROM hexes
      WHERE country IS NOT NULL AND city IS NOT NULL
      GROUP BY country, city
      ORDER BY country, count DESC
    `),
  ]);

  const [
    users,
    hexes,
    runsLifetime,
    distance,
    dau,
    wau,
    mau,
    runs24h,
    runs7d,
    hexesOnchain,
    captureTxs,
    onchainHolders,
    onchainTxs24h,
    onchainTxs7d,
    retentionD1,
    retentionD7,
    retentionD30,
    topCountriesRows,
    runsByModeRows,
    runShapeRows,
    runsPerDayRows,
    conquestsTotal,
    topCitiesRows,
  ] = queries;

  const shape = (runShapeRows as unknown as Array<{
    median_secs: number;
    median_meters: number;
    median_blocks: number;
    best_blocks: number;
    best_meters: number;
  }>)[0];

  const scalar = (q: unknown) =>
    (q as unknown as Row<Array<{ c: number }>>)[0]?.c ?? 0;

  return NextResponse.json({
    totalPlayers: scalar(users),
    totalBlocks: scalar(hexes),
    runsLifetime: scalar(runsLifetime),
    totalDistanceMeters: scalar(distance),
    // Activity (unique users in window).
    dau: scalar(dau),
    wau: scalar(wau),
    mau: scalar(mau),
    // Also keep the legacy alias so /stats page doesn't break.
    activePlayers7d: scalar(wau),
    // Runs volume windows.
    runs24h: scalar(runs24h),
    runs7d: scalar(runs7d),
    // Retention (0..1 float, rolling 60-day cohort average).
    retention: {
      d1: scalar(retentionD1),
      d7: scalar(retentionD7),
      d30: scalar(retentionD30),
    },
    // On-chain.
    hexesOnchain: scalar(hexesOnchain),
    captureTxs: scalar(captureTxs),
    onchainHolders: scalar(onchainHolders),
    onchainTxs24h: scalar(onchainTxs24h),
    onchainTxs7d: scalar(onchainTxs7d),
    hexesContract: hexesContractAddress(),
    badgesContract: badgesContractAddress(),
    // Country distribution with nested cities.
    topCountries: topCountriesRows as unknown as Array<{
      country: string;
      count: number;
    }>,
    citiesByCountry: topCitiesRows as unknown as Array<{
      country: string;
      city: string;
      count: number;
    }>,
    // Runs breakdown.
    runsByMode: (runsByModeRows as unknown as Array<{
      mode: string;
      runs: number;
      blocks: number;
      meters: number;
    }>).filter((r) => r.mode !== "none"),
    typicalRun: {
      seconds: Math.round(shape?.median_secs ?? 0),
      meters: Math.round(shape?.median_meters ?? 0),
      blocks: Math.round(shape?.median_blocks ?? 0),
    },
    records: {
      blocks: shape?.best_blocks ?? 0,
      meters: shape?.best_meters ?? 0,
    },
    runsPerDay: runsPerDayRows as unknown as Array<{ day: string; runs: number }>,
    conquests: scalar(conquestsTotal),
    chain: "celo",
    chainId: 42220,
  });
}
