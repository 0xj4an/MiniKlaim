import { NextResponse } from "next/server";
import type { Address } from "viem";
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

  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
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

  return NextResponse.json({ contract, heldIds });
}
