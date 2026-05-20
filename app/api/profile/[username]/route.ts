import { count, desc, eq } from "drizzle-orm";
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
    .select({ address: users.address, username: users.username })
    .from(users)
    .where(eq(users.username, cleanUsername))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [hexResult, runResult, bestRun, bestRunDist] = await Promise.all([
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
  ]);

  return NextResponse.json({
    username: user.username,
    hexesOwned: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    bestRunHexes: bestRun[0]?.hexesClaimed ?? 0,
    bestRunDistanceMeters: bestRunDist[0]?.distanceMeters ?? 0,
  });
}
