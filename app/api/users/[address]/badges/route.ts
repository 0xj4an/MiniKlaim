import { NextResponse } from "next/server";
import type { Address } from "viem";
import { parseChainKey } from "@/lib/onchain/chains";
import {
  badgesContractAddress,
  onchainBadgeIdsHeld,
} from "@/lib/onchain/badges";

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

  const heldIds = await onchainBadgeIdsHeld(lower as Address, chainKey);
  return NextResponse.json({ contract, heldIds });
}
