import { NextResponse } from "next/server";
import type { Address } from "viem";
import {
  badgesContractAddress,
  onchainBadgeIdsHeld,
} from "@/lib/onchain/badges";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const contract = badgesContractAddress();
  if (!contract) {
    return NextResponse.json({ contract: null, heldIds: [] });
  }

  const heldIds = await onchainBadgeIdsHeld(lower as Address);
  return NextResponse.json({ contract, heldIds });
}
