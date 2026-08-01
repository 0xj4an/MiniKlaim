import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { validateFinish } from "@/lib/runs/validation";

const log = createLogger("api:runs:finish");

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Anti-spoof sanity check on the whole run before we close it. Runs that
  // trip this (e.g. avg speed > 8 m/s = 28.8 km/h) look like GPS teleport or
  // motorized transport. We close the run regardless (so the client's finish
  // flow doesn't hang) but return 400 so the client can surface the reason
  // and the run's hexes stay un-minted (voucher endpoint will refuse).
  const check = await validateFinish(id);

  const [updated] = await db
    .update(runs)
    .set({ endedAt: sql`now()` })
    .where(eq(runs.id, id))
    .returning({
      id: runs.id,
      userAddress: runs.userAddress,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
    });

  if (!updated) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  if (check.ok === false) {
    log.warn("run finished but failed sanity check", {
      id: updated.id,
      reason: check.reason,
      detail: check.detail,
    });
    return NextResponse.json(
      { ...updated, suspicious: true, reason: check.reason, detail: check.detail },
      { status: 400 },
    );
  }

  log.info("run finished", {
    id: updated.id,
    hexesClaimed: updated.hexesClaimed,
  });

  // On-chain minting is client-driven after finish so the player is the on-chain
  // msg.sender (unique-wallet attribution). Hexes: POST /voucher -> claimRun ->
  // /claimed, sponsored /sponsor-mint fallback. Badges: claimed from /me via the
  // badge voucher (POST /api/users/[address]/badges/voucher), sponsored fallback
  // at /api/users/[address]/badges/sponsor-mint.

  return NextResponse.json(updated);
}
