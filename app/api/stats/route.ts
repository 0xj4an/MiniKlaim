import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { createSharedCache } from "@/lib/sharedCache";

export const dynamic = "force-dynamic";

type Totals = { totalHexes: number; totalRuns: number; totalPlayers: number };

// Three full-table counts per home-screen visit: one sequential scan of
// users, runs and the 300k-row hexes table each time. The numbers are shown
// rounded on the home screen, so one copy a minute per process is plenty.
const STATS_TTL_MS = 60_000;
const totals = createSharedCache<Totals>(STATS_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

async function loadTotals(): Promise<Totals> {
  const [hexResult, runResult, userResult] = await Promise.all([
    db.select({ count: count() }).from(hexes),
    db.select({ count: count() }).from(runs),
    db.select({ count: count() }).from(users),
  ]);
  return {
    totalHexes: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
    totalPlayers: userResult[0]?.count ?? 0,
  };
}

export async function GET() {
  return NextResponse.json(await totals.get("all", loadTotals));
}
