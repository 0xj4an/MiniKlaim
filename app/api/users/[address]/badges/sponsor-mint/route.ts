import { NextResponse } from "next/server";
import type { Address } from "viem";
import { createLogger } from "@/lib/logger";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { mintBadgesBatch } from "@/lib/onchain/badges";

const log = createLogger("api:badges:sponsor-mint");

export const dynamic = "force-dynamic";

/**
 * Relayer-mint the player's eligible badges (sponsored fallback) when they
 * cannot submit `claimBadges` themselves (no gas / declined / wallet error).
 * The contract skips already-held badges, so this is safe to call repeatedly.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const candidates = await computeEligibleBadgeIds(lower as Address);
  if (candidates.length === 0) {
    return NextResponse.json({ minted: [] });
  }

  const result = await mintBadgesBatch(lower as Address, candidates);
  if (result.ok !== true) {
    log.warn("badge sponsor mint not done", {
      player: lower,
      reason: result.reason,
    });
    return NextResponse.json(
      { error: "mint unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    txHash: result.txHash,
    minted: result.minted.map((b) => b.toString()),
  });
}
