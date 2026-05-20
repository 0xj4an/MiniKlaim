import { count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  const [hexResult, runResult, bestRun, bestRunDist, rankResult, runDays] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(hexes)
        .where(eq(hexes.ownerAddress, lower)),
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
    ]);

  const rank = (rankResult as unknown as Array<{ rank: number }>)[0]?.rank ?? 1;
  const days = (runDays as unknown as Array<{ day: string }>).map((r) => r.day);
  const streak = computeStreak(days);

  return NextResponse.json({
    hexesOwned: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    bestRunDistanceMeters: bestRunDist[0]?.distanceMeters ?? 0,
    rank,
    streak,
  });
}

/**
 * Walk a list of run days (UTC, ISO yyyy-mm-dd, newest first) and count
 * consecutive days ending today or yesterday. A streak only "counts" if the
 * most recent run day is today or yesterday — otherwise the streak is over.
 */
function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const yesterdayUtc = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const set = new Set(days.map((d) => d.slice(0, 10)));
  if (!set.has(todayUtc) && !set.has(yesterdayUtc)) return 0;
  let streak = 0;
  let cursor = new Date(set.has(todayUtc) ? todayUtc : yesterdayUtc);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}
