import { count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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
    })
    .from(users)
    .where(eq(users.username, cleanUsername))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [hexResult, runResult, bestRun, bestRunDist, runDays] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(hexes)
        .where(eq(hexes.ownerAddress, user.address)),
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
      db.execute(sql`
        SELECT DISTINCT DATE(ended_at AT TIME ZONE 'UTC') AS day
        FROM runs
        WHERE user_address = ${user.address} AND ended_at IS NOT NULL
        ORDER BY day DESC
        LIMIT 365
      `),
    ]);

  const days = (runDays as unknown as Array<{ day: string }>).map((r) => r.day);
  const streak = computeStreak(days);

  return NextResponse.json({
    username: user.username,
    joinedAt: user.createdAt,
    hexesOwned: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    bestRunDistanceMeters: bestRunDist[0]?.distanceMeters ?? 0,
    streak,
  });
}

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
