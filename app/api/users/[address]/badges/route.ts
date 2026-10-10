import { NextResponse } from "next/server";
import type { Address } from "viem";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { badgesContractAddress } from "@/lib/onchain/badges";
import { parseChainKey } from "@/lib/onchain/chains";
import { badgeIdsHeldByPlayer } from "@/lib/onchain/playerHeldBadges";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const url = new URL(request.url);
  const chainKey = parseChainKey(url.searchParams.get("chain"));
  const contract = badgesContractAddress(chainKey);
  if (!contract) {
    return NextResponse.json({ contract: null, heldIds: [] });
  }

  // Union across linked wallets. The finish card used to subtract only the
  // connected address, so badges already held on another wallet came back
  // as claimable after MiniPay cleared its cache.
  const heldIds = await badgeIdsHeldByPlayer(lower, chainKey);

  let claimableIds: number[] | undefined;
  if (url.searchParams.get("claimable") === "1") {
    const eligible = await computeEligibleBadgeIds(lower as Address);
    const heldSet = new Set(heldIds);
    claimableIds = eligible
      .map((id) => Number(id))
      .filter((id) => !heldSet.has(id));
  }

  return NextResponse.json({ contract, heldIds, claimableIds });
}
