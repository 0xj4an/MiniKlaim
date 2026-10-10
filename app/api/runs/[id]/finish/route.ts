import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { moveMode } from "@/lib/runs/moveMode";
import { leftoverDistance } from "@/lib/runs/validation";

const log = createLogger("api:runs:finish");

export const dynamic = "force-dynamic";

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

  const [updated] = await db
    .update(runs)
    .set({
      endedAt: sql`now()`,
      ...(extra > 0
        ? { distanceMeters: sql`${runs.distanceMeters} + ${extra}` }
        : {}),
    })
    .where(eq(runs.id, id))
    .returning({
      id: runs.id,
      userAddress: runs.userAddress,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
    });

  if (!updated || !updated.endedAt) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const durationSec =
    (new Date(updated.endedAt).getTime() - new Date(updated.startedAt).getTime()) / 1000;
  const mode = moveMode(updated.distanceMeters, durationSec);
  if (mode) {
    await db.update(runs).set({ moveMode: mode }).where(eq(runs.id, id));
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
