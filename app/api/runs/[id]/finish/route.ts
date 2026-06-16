import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { mintBadgesBatch } from "@/lib/onchain/badges";

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

  // Hex minting is now driven by the client after finish: the player either
  // submits their own `claimRun` tx (POST /voucher then on-chain, recorded via
  // /claimed) so they count as a unique on-chain wallet, or falls back to the
  // sponsored relayer (POST /sponsor-mint) when they cannot pay gas. Badges stay
  // relayer-minted in the background here.
  void mintEligibleBadges(updated.userAddress as Address);

  return NextResponse.json(updated);
}

/**
 * Derive every badge the player currently qualifies for (shared with the
 * player-claim voucher endpoint) and relayer-mint them as the sponsored
 * fallback. The contract skips badges already held, so the full eligible list
 * is safe to pass every time.
 */
async function mintEligibleBadges(player: Address) {
  const lower = player.toLowerCase();
  const candidates = await computeEligibleBadgeIds(player);

  if (candidates.length === 0) {
    log.info("no badge candidates", { player: lower });
    return;
  }

  const result = await mintBadgesBatch(player, candidates);
  if (result.ok !== true) {
    log.warn("badges mint not done", {
      player: lower,
      reason: result.reason,
    });
    return;
  }

  log.info("badges mint queued", {
    player: lower,
    candidates: candidates.map((b) => Number(b)),
    txHash: result.txHash,
  });
}
