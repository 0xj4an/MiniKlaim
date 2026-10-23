import { cellToParent } from "h3-js";
import { and, count, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";
import { computeBestStreak, computeStreak, streakDays } from "@/lib/runs/streak";

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
    // have a hex_count > this player's. Hexes are counted per address first:
    // looking up player_wallets per joined hex row (~230k per request) ran
    // ~2 billion index scans and took ~1.5 s per stats call.
    db.execute(sql`
      WITH per_address AS (
        SELECT owner_address AS address, COUNT(*) AS n
        FROM hexes
        GROUP BY owner_address
      ),
      group_scores AS (
        SELECT
          COALESCE(pw.player_id::text, u.address) AS group_key,
          COALESCE(SUM(pa.n), 0) AS hex_count
        FROM users u
        LEFT JOIN per_address pa ON pa.address = u.address
        LEFT JOIN LATERAL (
          SELECT player_id FROM player_wallets WHERE address = u.address LIMIT 1
        ) pw ON true
        GROUP BY 1
      ),
      me AS (
        SELECT COALESCE(
          (SELECT player_id::text FROM player_wallets WHERE address = ${lower} LIMIT 1),
          ${lower}
        ) AS group_key
      )
      SELECT (
        SELECT COUNT(*) FROM group_scores
        WHERE hex_count > (
          SELECT hex_count FROM group_scores WHERE group_key = (SELECT group_key FROM me)
        )
      )::int + 1 AS rank
    `),
    streakDays(linked),
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
  const streak = computeStreak(runDays);
  const bestStreak = computeBestStreak(runDays);
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
    bestStreak,
    lifetimeDistanceMeters: Number(lifetimeRow[0]?.total ?? 0),
    cityCount,
    conquests,
    countryCount: countryRows.length,
  });
}
