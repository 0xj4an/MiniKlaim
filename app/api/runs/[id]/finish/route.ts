import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:runs:finish");

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
