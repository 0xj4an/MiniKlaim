import { NextResponse } from "next/server";
import type { Address } from "viem";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { parseChainKey } from "@/lib/onchain/chains";
import {
  badgesContractAddress,
  onchainBadgeIdsHeld,
} from "@/lib/onchain/badges";
import { addressesForPlayer } from "@/lib/players";

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

  // Union the on-chain held badges across every linked wallet (same chain).
  // Addresses that never held anything on this chain harmlessly return an
  // empty set. Per-chain aggregation avoids double-mint issues when the
  // same badge is claimable on multiple chains.
  const linked = await addressesForPlayer(lower);
  const perAddress = await Promise.all(
    linked.map((a) => onchainBadgeIdsHeld(a as Address, chainKey)),
  );
  const heldIds = Array.from(new Set(perAddress.flat())).sort(
    (a, b) => a - b,
  );

  // Same set claimAll puts in the voucher: earned, not yet held by this
  // address. Only the finish card asks for it. The profile read stays a
  // chain read.
  let claimableIds: number[] | undefined;
  if (url.searchParams.get("claimable") === "1") {
    const [eligible, playerHeld] = await Promise.all([
      computeEligibleBadgeIds(lower as Address),
      onchainBadgeIdsHeld(lower as Address, chainKey),
    ]);
    const heldSet = new Set(playerHeld);
    claimableIds = eligible
      .map((id) => Number(id))
      .filter((id) => !heldSet.has(id));
  }

  return NextResponse.json({ contract, heldIds, claimableIds });
}
