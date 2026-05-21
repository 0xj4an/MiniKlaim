import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const [hexResult, runResult, userResult] = await Promise.all([
    db.select({ count: count() }).from(hexes),
    db.select({ count: count() }).from(runs),
    db.select({ count: count() }).from(users),
  ]);

  return NextResponse.json({
    totalHexes: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    totalPlayers: userResult[0]?.count ?? 0,
  });
}
