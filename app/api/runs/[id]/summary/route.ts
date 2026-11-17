import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Blocks sent for the card's outline; lib/share/runShape coarsens them. */
const MAX_CELLS = 10_000;

/**
 * What a finished run's public page and share card show: who, how many
 * blocks, how far, how long, where, and the blocks it still holds. All of it
 * is already public (the activity feed lists the same run, and block
 * ownership is on the map), so this needs no auth. A run still in progress
 * is not served.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid run" }, { status: 400 });
  }
  const [run] = await db
    .select({
      id: runs.id,
      username: users.username,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
      serverDistanceMeters: runs.serverDistanceMeters,
      moveMode: runs.moveMode,
      country: sql<string | null>`(
        SELECT country FROM hexes h
        WHERE h.run_id = ${runs.id} AND h.country IS NOT NULL
        GROUP BY country ORDER BY COUNT(*) DESC LIMIT 1
      )`,
      city: sql<string | null>`(
        SELECT city FROM hexes h
        WHERE h.run_id = ${runs.id} AND h.city IS NOT NULL
        GROUP BY city ORDER BY COUNT(*) DESC LIMIT 1
      )`,
    })
    .from(runs)
    .leftJoin(users, eq(runs.userAddress, users.address))
    .where(eq(runs.id, id))
    .limit(1);
  if (!run || !run.endedAt) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const cells = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(eq(hexes.runId, id))
    // In the order they were captured: the card marks where the run
    // started and where it ended.
    .orderBy(asc(hexes.claimedAt), asc(hexes.h3Id))
    .limit(MAX_CELLS);

  return NextResponse.json({
    id: run.id,
    username: run.username,
    hexesClaimed: run.hexesClaimed,
    // The larger of the phone's figure and the server's hex path, as the
    // run summary shows it (lib/runs/runSummaryCopy).
    distanceMeters: Math.max(run.distanceMeters, run.serverDistanceMeters),
    durationSec: Math.max(
      0,
      Math.round(
        (new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
      ),
    ),
    moveMode: run.moveMode,
    city: run.city,
    country: run.country,
    h3Ids: cells.map((c) => c.h3Id),
  });
}
