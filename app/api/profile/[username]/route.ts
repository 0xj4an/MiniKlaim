import { cellToParent } from "h3-js";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";
import { getPlayerStreaks } from "@/lib/runs/streak";

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

  // Every wallet linked to this player, like /api/users/<address>/stats and
  // the leaderboard. Counting one wallet made the public profile and the
  // shared preview card disagree with /me and the ranking for anyone who
  // linked a second wallet (7,122 blocks against 11,926 on 27 Oct).
  const linked = await addressesForPlayer(user.address.toLowerCase());

  const [
    runResult,
    bestRun,
    bestRunDist,
    lifetimeRow,
    ownedHexes,
    countryRows,
    streaks,
  ] = await Promise.all([
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
    db
      .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
      .from(runs)
      .where(inArray(runs.userAddress, linked)),
    db
      .select({ h3Id: hexes.h3Id })
      .from(hexes)
      .where(inArray(hexes.ownerAddress, linked)),
    db
      .selectDistinct({ country: hexes.country })
      .from(hexes)
      .where(
        and(inArray(hexes.ownerAddress, linked), isNotNull(hexes.country)),
      ),
    getPlayerStreaks(user.address),
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
    streak: streaks.current,
    bestStreak: streaks.best,
    lifetimeDistanceMeters: Number(lifetimeRow[0]?.total ?? 0),
    cityCount,
    conquests: user.conquests ?? 0,
    countryCount: countryRows.length,
  });
}
