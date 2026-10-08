import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { captureBatch } from "@/lib/onchain/hexes";

const log = createLogger("api:runs:sponsor-mint");

export const dynamic = "force-dynamic";

/**
 * Relayer-mint this run when the player has no fee balance. The client calls
 * this only in that case. A declined signature does not hit this route.
 * The player is not the on-chain sender, so the run does not add a unique
 * wallet. The hexes still land.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));

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
  const ids = rows.map((r) => r.h3Id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, minted: 0 });
  }

  const result = await captureBatch(run.userAddress as Address, ids, chainKey);
  if (result.ok !== true) {
    log.warn("sponsor mint failed", { runId: id, reason: result.reason });
    return NextResponse.json(
      { error: "mint failed", reason: result.reason },
      { status: 503 },
    );
  }

  await db
    .update(hexes)
    .set({ mintedAt: sql`now()`, mintTxHash: result.txHash })
    .where(eq(hexes.runId, id));

  log.info("sponsor mint done", {
    runId: id,
    count: ids.length,
    txHash: result.txHash,
  });
  return NextResponse.json({ ok: true, minted: ids.length, txHash: result.txHash });
}
