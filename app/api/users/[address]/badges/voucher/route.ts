import { NextResponse } from "next/server";
import type { Address } from "viem";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { claimableBadgeIds } from "@/lib/onchain/claimableBadges";
import { signBadgeVoucher } from "@/lib/onchain/badgeVoucher";

const log = createLogger("api:badges:voucher");

export const dynamic = "force-dynamic";

/**
 * Issue an EIP-712 voucher so the player can submit `claimBadges` from their own
 * wallet (on-chain msg.sender = player, for attribution).
 *
 * Authorizes the badges the player has earned and does not already hold. It
 * used to authorize every badge they qualified for, because the contract skips
 * the ones the wallet owns, so the result was right and the drawer was not: a
 * player offered 3 badges was asked by MiniPay to confirm 28, and paid gas for
 * all of them. Re-submitting is still safe, since the contract skips anything
 * that landed in between.
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
  const badgeIds = await claimableBadgeIds(lower as Address, chainKey);
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
