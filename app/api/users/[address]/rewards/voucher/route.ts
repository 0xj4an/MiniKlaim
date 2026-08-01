import { NextResponse } from "next/server";
import type { Address } from "viem";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { parseChainKey } from "@/lib/onchain/chains";
import {
  isRewardsConfigured,
  readClaimedBadgeIds,
  readRewardAmounts,
  readRewardsPoolBalance,
} from "@/lib/onchain/rewards";
import { signRewardsVoucher } from "@/lib/onchain/rewardsVoucher";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:rewards:voucher");

export const dynamic = "force-dynamic";

/**
 * Issue an EIP-712 voucher so the player can submit `claimRewards` from their
 * own wallet on the rewards contract. Authorizes exactly the badges the
 * player earned but has not yet claimed (on-chain `claimed[player][badgeId]`).
 * Returns 503 while the contract is not yet deployed / configured, 409 when
 * the pool cannot cover the total (so the UI shows "topping up soon" instead
 * of pushing an unusable voucher).
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
  if (!isRewardsConfigured(chainKey)) {
    return NextResponse.json({ error: "not-configured" }, { status: 503 });
  }

  const player = lower as Address;
  const eligible = await computeEligibleBadgeIds(player);
  if (eligible.length === 0) {
    return NextResponse.json({ error: "no eligible badges" }, { status: 409 });
  }

  const [claimed, amounts, poolBalance] = await Promise.all([
    readClaimedBadgeIds(player, eligible, chainKey),
    readRewardAmounts(eligible, chainKey),
    readRewardsPoolBalance(chainKey),
  ]);

  const unclaimed = eligible.filter((id) => !claimed.has(Number(id)));
  const priced = unclaimed.filter((id) => (amounts.get(Number(id)) ?? 0n) > 0n);
  if (priced.length === 0) {
    return NextResponse.json({ error: "nothing to claim" }, { status: 409 });
  }
  const total = priced.reduce(
    (acc, id) => acc + (amounts.get(Number(id)) ?? 0n),
    0n,
  );
  if (poolBalance < total) {
    log.warn("rewards pool too low", {
      player: lower,
      poolBalance: poolBalance.toString(),
      total: total.toString(),
    });
    return NextResponse.json(
      { error: "pool-too-low", total: total.toString() },
      { status: 409 },
    );
  }

  const result = await signRewardsVoucher(player, priced, chainKey);
  if (result.ok !== true) {
    log.warn("rewards voucher not issued", {
      player: lower,
      reason: result.reason,
    });
    return NextResponse.json(
      { error: "voucher unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ...result.voucher,
    total: total.toString(),
  });
}
