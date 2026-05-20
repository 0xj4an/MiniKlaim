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

  const [hexResult, runResult, bestRun, rankResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(hexes)
      .where(eq(hexes.ownerAddress, lower)),
    db.select({ count: count() }).from(runs).where(eq(runs.userAddress, lower)),
    db
      .select({ hexesClaimed: runs.hexesClaimed })
      .from(runs)
      .where(eq(runs.userAddress, lower))
      .orderBy(desc(runs.hexesClaimed))
      .limit(1),
    // Count users (with at least one hex) who own strictly more hexes than
    // this user. Rank = that count + 1. If this user owns zero hexes, rank
    // is still reported — they sit below everyone with claimed territory.
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
  ]);

  const rank = (rankResult as unknown as Array<{ rank: number }>)[0]?.rank ?? 1;

  return NextResponse.json({
    hexesOwned: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    rank,
  });
}
