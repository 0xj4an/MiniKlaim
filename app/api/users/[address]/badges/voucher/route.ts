import { NextResponse } from "next/server";
import type { Address } from "viem";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { signBadgeVoucher } from "@/lib/onchain/badgeVoucher";

const log = createLogger("api:badges:voucher");

export const dynamic = "force-dynamic";

/**
 * Issue an EIP-712 voucher so the player can submit `claimBadges` from their own
 * wallet (on-chain msg.sender = player, for attribution). Authorizes exactly the
 * badges the player currently qualifies for. The contract skips already-held
 * badges, so the same voucher is safe to re-submit.
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
  const badgeIds = await computeEligibleBadgeIds(lower as Address);
  if (badgeIds.length === 0) {
    return NextResponse.json({ error: "no eligible badges" }, { status: 409 });
  }

  const result = await signBadgeVoucher(lower as Address, badgeIds, chainKey);
  if (result.ok !== true) {
    log.warn("badge voucher not issued", { player: lower, reason: result.reason });
    return NextResponse.json(
      { error: "voucher unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json(result.voucher);
}
