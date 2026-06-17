import { cellToParent } from "h3-js";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { getPlayerStreak } from "@/lib/runs/streak";

export const dynamic = "force-dynamic";

// H3 resolution-5 cluster = one "city" (matches the territory map grouping).
const CITY_RESOLUTION = 5;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const cleanUsername = username.toLowerCase().trim();

  if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  const [user] = await db
    .select({
      address: users.address,
      username: users.username,
      createdAt: users.createdAt,
      conquests: users.conquests,
    })
    .from(users)
    .where(eq(users.username, cleanUsername))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [runResult, bestRun, bestRunDist, lifetimeRow, ownedHexes, countryRows, streak] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(runs)
        .where(eq(runs.userAddress, user.address)),
      db
        .select({ hexesClaimed: runs.hexesClaimed })
        .from(runs)
        .where(eq(runs.userAddress, user.address))
        .orderBy(desc(runs.hexesClaimed))
        .limit(1),
      db
        .select({ distanceMeters: runs.distanceMeters })
        .from(runs)
        .where(eq(runs.userAddress, user.address))
        .orderBy(desc(runs.distanceMeters))
        .limit(1),
      db
        .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
        .from(runs)
        .where(eq(runs.userAddress, user.address)),
      db
        .select({ h3Id: hexes.h3Id })
        .from(hexes)
        .where(eq(hexes.ownerAddress, user.address)),
      db
        .selectDistinct({ country: hexes.country })
        .from(hexes)
        .where(and(eq(hexes.ownerAddress, user.address), isNotNull(hexes.country))),
      getPlayerStreak(user.address),
    ]);

  const cityCount = new Set(
    ownedHexes.map((h) => cellToParent(h.h3Id, CITY_RESOLUTION)),
  ).size;

  return NextResponse.json({
    username: user.username,
    joinedAt: user.createdAt,
    hexesOwned: ownedHexes.length,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    bestRunDistanceMeters: bestRunDist[0]?.distanceMeters ?? 0,
    streak,
    lifetimeDistanceMeters: Number(lifetimeRow[0]?.total ?? 0),
    cityCount,
    conquests: user.conquests ?? 0,
    countryCount: countryRows.length,
  });
}
