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
    // Top 10 countries by hex count (for geography chart).
    db.execute(sql`
      SELECT country, COUNT(*)::int AS count
      FROM hexes
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
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
  ] = queries;

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
    // Country distribution (top 10 for the geography chart).
    topCountries: topCountriesRows as unknown as Array<{
      country: string;
      count: number;
    }>,
    chain: "celo",
    chainId: 42220,
  });
}
