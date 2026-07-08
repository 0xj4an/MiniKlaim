import { cellToParent } from "h3-js";
import { and, count, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";
import { computeStreak } from "@/lib/runs/streak";

export const dynamic = "force-dynamic";

// H3 resolution-5 cluster = one "city" (matches the territory map grouping).
const CITY_RESOLUTION = 5;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  // Aggregate across every wallet linked to this address's player. Falls back
  // to `[lower]` when the wallet has no player yet, so pre-link behavior is
  // unchanged.
  const linked = await addressesForPlayer(lower);

  const [
    hexResult,
    hexMintedResult,
    runResult,
    bestRun,
    bestRunDist,
    rankResult,
    runDays,
    lifetimeRow,
    ownedHexes,
    userRows,
    countryRows,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(hexes)
      .where(inArray(hexes.ownerAddress, linked)),
    db
      .select({ count: count() })
      .from(hexes)
      .where(
        and(
          inArray(hexes.ownerAddress, linked),
          isNotNull(hexes.mintedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(runs)
      .where(inArray(runs.userAddress, linked)),
    db
      .select({ hexesClaimed: runs.hexesClaimed })
      .from(runs)
      .where(inArray(runs.userAddress, linked))
      .orderBy(desc(runs.hexesClaimed))
      .limit(1),
    db
      .select({ distanceMeters: runs.distanceMeters })
      .from(runs)
      .where(inArray(runs.userAddress, linked))
      .orderBy(desc(runs.distanceMeters))
      .limit(1),
    // Rank across per-player aggregated hex counts. Each address in the DB is
    // grouped by its `player_id` (via player_wallets) or by its own address as
    // a fallback for wallets that never linked. Then we count how many groups
    // have a hex_count > this player's.
    db.execute(sql`
      WITH group_scores AS (
        SELECT
          COALESCE(
            (SELECT pw.player_id::text
             FROM player_wallets pw
             WHERE pw.address = u.address
             LIMIT 1),
            u.address
          ) AS group_key,
          COUNT(h.h3_id) AS hex_count
        FROM users u
        LEFT JOIN hexes h ON h.owner_address = u.address
        GROUP BY group_key
      ),
      my_score AS (
        SELECT hex_count FROM group_scores
        WHERE group_key = (
          SELECT COALESCE(
            (SELECT pw2.player_id::text
             FROM player_wallets pw2
             WHERE pw2.address = ${lower}
             LIMIT 1),
            ${lower}
          )
        )
      )
      SELECT (
        SELECT COUNT(*) FROM group_scores
        WHERE hex_count > (SELECT hex_count FROM my_score)
      )::int + 1 AS rank
    `),
    db.execute(sql`
      SELECT DISTINCT DATE(ended_at AT TIME ZONE 'UTC') AS day
      FROM runs
      WHERE user_address = ANY(${linked}::text[])
        AND ended_at IS NOT NULL
      ORDER BY day DESC
      LIMIT 365
    `),
    db
      .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
      .from(runs)
      .where(inArray(runs.userAddress, linked)),
    db
      .select({ h3Id: hexes.h3Id })
      .from(hexes)
      .where(inArray(hexes.ownerAddress, linked)),
    db
      .select({ conquests: users.conquests })
      .from(users)
      .where(inArray(users.address, linked)),
    db
      .selectDistinct({ country: hexes.country })
      .from(hexes)
      .where(
        and(inArray(hexes.ownerAddress, linked), isNotNull(hexes.country)),
      ),
  ]);

  const rank = (rankResult as unknown as Array<{ rank: number }>)[0]?.rank ?? 1;
  const days = (runDays as unknown as Array<{ day: string }>).map((r) => r.day);
  const streak = computeStreak(days);
  const cityCount = new Set(
    ownedHexes.map((h) => cellToParent(h.h3Id, CITY_RESOLUTION)),
  ).size;
  const conquests = userRows.reduce((sum, r) => sum + (r.conquests ?? 0), 0);

  return NextResponse.json({
    hexesOwned: hexResult[0]?.count ?? 0,
    hexesMinted: hexMintedResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    bestRunDistanceMeters: bestRunDist[0]?.distanceMeters ?? 0,
    rank,
    streak,
    lifetimeDistanceMeters: Number(lifetimeRow[0]?.total ?? 0),
    cityCount,
    conquests,
    countryCount: countryRows.length,
  });
}
