import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:runs:claim");

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    h3?: string;
    distanceMeters?: number;
  };
  const h3 = body.h3;
  const distanceMeters =
    typeof body.distanceMeters === "number" &&
    Number.isFinite(body.distanceMeters) &&
    body.distanceMeters > 0
      ? Math.round(body.distanceMeters)
      : 0;

  if (!h3 || typeof h3 !== "string") {
    return NextResponse.json({ error: "invalid h3" }, { status: 400 });
  }

  const [run] = await db
    .select({
      id: runs.id,
      userAddress: runs.userAddress,
      endedAt: runs.endedAt,
    })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.endedAt) {
    return NextResponse.json({ error: "run already ended" }, { status: 409 });
  }

  const [existing] = await db
    .select({ ownerAddress: hexes.ownerAddress, runId: hexes.runId })
    .from(hexes)
    .where(eq(hexes.h3Id, h3))
    .limit(1);

  const alreadyOwnedThisRun =
    existing &&
    existing.ownerAddress === run.userAddress &&
    existing.runId === id;

  if (alreadyOwnedThisRun) {
    if (distanceMeters > 0) {
      await db
        .update(runs)
        .set({
          distanceMeters: sql`${runs.distanceMeters} + ${distanceMeters}`,
        })
        .where(eq(runs.id, id));
    }
    return NextResponse.json({ ok: true, alreadyOwned: true });
  }

  await db
    .insert(hexes)
    .values({
      h3Id: h3,
      ownerAddress: run.userAddress,
      runId: id,
    })
    .onConflictDoUpdate({
      target: hexes.h3Id,
      set: {
        ownerAddress: run.userAddress,
        runId: id,
        claimedAt: sql`now()`,
      },
    });

  await db
    .update(runs)
    .set({
      hexesClaimed: sql`${runs.hexesClaimed} + 1`,
      ...(distanceMeters > 0
        ? { distanceMeters: sql`${runs.distanceMeters} + ${distanceMeters}` }
        : {}),
    })
    .where(eq(runs.id, id));

  log.info("hex claimed", {
    runId: id,
    h3,
    owner: run.userAddress,
    distanceDelta: distanceMeters,
  });

  return NextResponse.json({ ok: true, alreadyOwned: false });
}
