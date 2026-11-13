import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { RUN_TOKEN_HEADER, runTokenMatches } from "@/lib/onchain/sponsorRules";
import { finalMoveMode } from "@/lib/runs/moveMode";
import { leftoverDistance } from "@/lib/runs/validation";

const log = createLogger("api:runs:finish");

export const dynamic = "force-dynamic";

const FINISHED_FIELDS = {
  id: runs.id,
  userAddress: runs.userAddress,
  startedAt: runs.startedAt,
  endedAt: runs.endedAt,
  hexesClaimed: runs.hexesClaimed,
  hexesReinforced: runs.hexesReinforced,
  hexesDamaged: runs.hexesDamaged,
  distanceMeters: runs.distanceMeters,
  serverDistanceMeters: runs.serverDistanceMeters,
  declaredMode: runs.declaredMode,
  maxSustainedKmh: runs.maxSustainedKmh,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const text = await request.text();
  let extra = 0;
  if (text) {
    try {
      const body = JSON.parse(text) as { distanceMeters?: unknown };
      extra = leftoverDistance(body.distanceMeters);
    } catch {
      extra = 0;
    }
  }

  const [run] = await db
    .select({ claimTokenHash: runs.claimTokenHash })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  // Run ids are public, so the id alone let anyone end someone else's run
  // mid-way. Only the client that started the run holds its token.
  if (!runTokenMatches(run.claimTokenHash, request.headers.get(RUN_TOKEN_HEADER))) {
    log.warn("finish without the run token", { id });
    return NextResponse.json({ error: "not your run" }, { status: 403 });
  }

  // Only a run still open is ended, so a repeated finish cannot move the end
  // time or add the leftover distance again. A retry whose first answer was
  // lost gets the run as it already stands.
  const [updated] = await db
    .update(runs)
    .set({
      endedAt: sql`now()`,
      ...(extra > 0
        ? { distanceMeters: sql`${runs.distanceMeters} + ${extra}` }
        : {}),
    })
    .where(and(eq(runs.id, id), isNull(runs.endedAt)))
    .returning(FINISHED_FIELDS);

  if (!updated) {
    const [current] = await db
      .select({ ...FINISHED_FIELDS, moveMode: runs.moveMode })
      .from(runs)
      .where(eq(runs.id, id))
      .limit(1);
    if (!current || !current.endedAt) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    log.info("finish repeated on an ended run", { id });
    return NextResponse.json(current);
  }
  if (!updated.endedAt) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const durationSec =
    (new Date(updated.endedAt).getTime() - new Date(updated.startedAt).getTime()) / 1000;
  // The server's hex path is the better distance when the client dropped
  // part of its GPS track; take whichever is longer.
  const { mode, mismatch } = finalMoveMode({
    declared: updated.declaredMode,
    distanceMeters: Math.max(updated.distanceMeters, updated.serverDistanceMeters),
    durationSec,
    maxSustainedKmh: updated.maxSustainedKmh,
  });
  if (mismatch) {
    log.warn("declared move mode does not fit the speed", {
      id,
      player: updated.userAddress,
      declared: updated.declaredMode,
      labelled: mode,
      maxSustainedKmh: updated.maxSustainedKmh,
      avgKmh: durationSec > 0 ? Math.round((updated.serverDistanceMeters / durationSec) * 3.6) : 0,
    });
  }
  if (mode) {
    await db.update(runs).set({ moveMode: mode }).where(eq(runs.id, id));
  }
  if ((mode === "train" || mode === "plane") && updated.hexesClaimed > 0) {
    await watchFastTravel(updated.userAddress, id, mode, updated.hexesClaimed);
  }

  log.info("run finished", {
    id: updated.id,
    hexesClaimed: updated.hexesClaimed,
    moveMode: mode,
  });

  // On-chain minting is client-driven after finish so the player is the on-chain
  // msg.sender when they confirm. The relayer mints when they cannot pay or
  // the attempt fails for a reason other than a declined signature. The
  // retry cron still mints runs left unminted.

  return NextResponse.json({ ...updated, moveMode: mode });
}

/**
 * Trains and planes are allowed, but nobody lives on one. Every fast run is
 * logged, and a player who keeps doing them is flagged for review:
 * FAST_DAYS_FLAG distinct days or FAST_RUNS_FLAG runs in the last 7 days.
 */
const FAST_DAYS_FLAG = 3;
const FAST_RUNS_FLAG = 6;

async function watchFastTravel(
  player: string,
  runId: string,
  mode: "train" | "plane",
  hexes: number,
) {
  try {
    const [week] = await db
      .select({
        runs: sql<number>`count(*)::int`,
        days: sql<number>`count(distinct date_trunc('day', ${runs.startedAt}))::int`,
        blocks: sql<number>`coalesce(sum(${runs.hexesClaimed}), 0)::int`,
      })
      .from(runs)
      .where(
        and(
          eq(runs.userAddress, player),
          inArray(runs.moveMode, ["train", "plane"]),
          gt(runs.startedAt, sql`now() - interval '7 days'`),
        ),
      );
    const flagged = week.days >= FAST_DAYS_FLAG || week.runs >= FAST_RUNS_FLAG;
    log.warn(flagged ? "fast travel: frequent, review player" : "fast travel run", {
      player,
      runId,
      mode,
      hexes,
      runs7d: week.runs,
      days7d: week.days,
      blocks7d: week.blocks,
    });
  } catch (err) {
    log.error("fast travel watch failed", { player, runId, err: String(err) });
  }
}
