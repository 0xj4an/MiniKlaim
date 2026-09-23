import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { onchainBadgeIdsHeld } from "@/lib/onchain/badges";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { parseChainKey } from "@/lib/onchain/chains";
import { signClaimAllVoucher } from "@/lib/onchain/claimAllVoucher";

const log = createLogger("api:runs:claimAllVoucher");

export const dynamic = "force-dynamic";

/**
 * Issue the single EIP-712 voucher that settles a whole run through
 * MiniKlaimClaimRouter: this run's hexes plus every badge the player has earned
 * but does not hold yet, in one `claimAll` tx and therefore one wallet approval.
 *
 * MiniPay exposes a plain EIP-1193 provider with no EIP-5792, so bundling has to
 * happen in a contract rather than in the wallet.
 *
 * Returns 409 when there is nothing to settle and 503 when the router is not
 * deployed on this chain; the client falls back to the two-tx path on 503.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const chainKey = parseChainKey(
    new URL(request.url).searchParams.get("chain"),
  );

  const [run] = await db
    .select({ userAddress: runs.userAddress })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const player = run.userAddress as Address;

  const hexRows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(eq(hexes.runId, id));
  const h3Ids = hexRows.map((r) => r.h3Id);

  // Only badges this wallet does not already hold. `mintBatch` would skip the
  // rest anyway, but leaving them out keeps the tx cheap and the voucher's
  // (run, badge set) nonce meaningful.
  const eligible = await computeEligibleBadgeIds(player);
  const held = new Set(await onchainBadgeIdsHeld(player, chainKey));
  const badgeIds = eligible.filter((b) => !held.has(Number(b)));

  if (h3Ids.length === 0 && badgeIds.length === 0) {
    return NextResponse.json({ error: "nothing to claim" }, { status: 409 });
  }

  const result = await signClaimAllVoucher(
    player,
    h3Ids,
    badgeIds,
    id,
    chainKey,
  );
  if (result.ok !== true) {
    log.warn("claimAll voucher not issued", {
      runId: id,
      reason: result.reason,
    });
    return NextResponse.json(
      { error: "voucher unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json(result.voucher);
}
