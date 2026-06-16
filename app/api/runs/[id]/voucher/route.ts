import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { signClaimVoucher } from "@/lib/onchain/voucher";

const log = createLogger("api:runs:voucher");

export const dynamic = "force-dynamic";

/**
 * Issue an EIP-712 voucher so the player can submit `claimRun` from their own
 * wallet (making them the on-chain msg.sender). The voucher authorizes exactly
 * the hexes this run captured. Idempotent: same run -> same nonce + signature.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [run] = await db
    .select({ userAddress: runs.userAddress })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(eq(hexes.runId, id));
  const h3Ids = rows.map((r) => r.h3Id);

  if (h3Ids.length === 0) {
    return NextResponse.json({ error: "no hexes in run" }, { status: 409 });
  }

  const result = await signClaimVoucher(
    run.userAddress as Address,
    h3Ids,
    id,
  );
  if (result.ok !== true) {
    log.warn("voucher not issued", { runId: id, reason: result.reason });
    return NextResponse.json(
      { error: "voucher unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json(result.voucher);
}
