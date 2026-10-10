import { NextResponse } from "next/server";
import type { Address } from "viem";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { mintBadgesBatch } from "@/lib/onchain/badges";
import { badgeIdsHeldByPlayer } from "@/lib/onchain/playerHeldBadges";

const log = createLogger("api:badges:sponsor-mint");

export const dynamic = "force-dynamic";

/**
 * Relayer-mint eligible badges the player does not already hold on any
 * linked wallet. A declined signature does not call this route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const eligible = await computeEligibleBadgeIds(lower as Address);
  const held = new Set(await badgeIdsHeldByPlayer(lower, chainKey));
  const candidates = eligible.filter((id) => !held.has(Number(id)));
  if (candidates.length === 0) {
    return NextResponse.json({ minted: [] });
  }

  const result = await mintBadgesBatch(lower as Address, candidates, chainKey);
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
