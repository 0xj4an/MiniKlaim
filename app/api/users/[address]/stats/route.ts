import { cellToParent } from "h3-js";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
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
    userRow,
    countryRows,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(hexes)
      .where(eq(hexes.ownerAddress, lower)),
    db
      .select({ count: count() })
      .from(hexes)
      .where(and(eq(hexes.ownerAddress, lower), isNotNull(hexes.mintedAt))),
    db
      .select({ count: count() })
      .from(runs)
      .where(eq(runs.userAddress, lower)),
    db
      .select({ hexesClaimed: runs.hexesClaimed })
      .from(runs)
      .where(eq(runs.userAddress, lower))
      .orderBy(desc(runs.hexesClaimed))
      .limit(1),
    db
      .select({ distanceMeters: runs.distanceMeters })
      .from(runs)
      .where(eq(runs.userAddress, lower))
      .orderBy(desc(runs.distanceMeters))
      .limit(1),
    db.execute(sql`
      SELECT (
        SELECT COUNT(*) FROM (
          SELECT owner_address, COUNT(*) AS c
          FROM hexes
          GROUP BY owner_address
          HAVING COUNT(*) > (
            SELECT COUNT(*) FROM hexes WHERE owner_address = ${lower}
          )
        ) sub
      )::int + 1 AS rank
    `),
    db.execute(sql`
      SELECT DISTINCT DATE(ended_at AT TIME ZONE 'UTC') AS day
      FROM runs
      WHERE user_address = ${lower} AND ended_at IS NOT NULL
      ORDER BY day DESC
      LIMIT 365
    `),
    db
      .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
      .from(runs)
      .where(eq(runs.userAddress, lower)),
    db.select({ h3Id: hexes.h3Id }).from(hexes).where(eq(hexes.ownerAddress, lower)),
    db.select({ conquests: users.conquests }).from(users).where(eq(users.address, lower)),
    db
      .selectDistinct({ country: hexes.country })
      .from(hexes)
      .where(and(eq(hexes.ownerAddress, lower), isNotNull(hexes.country))),
  ]);

  const rank = (rankResult as unknown as Array<{ rank: number }>)[0]?.rank ?? 1;
  const days = (runDays as unknown as Array<{ day: string }>).map((r) => r.day);
  const streak = computeStreak(days);
  const cityCount = new Set(
    ownedHexes.map((h) => cellToParent(h.h3Id, CITY_RESOLUTION)),
  ).size;

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
    conquests: userRow[0]?.conquests ?? 0,
    countryCount: countryRows.length,
  });
}
