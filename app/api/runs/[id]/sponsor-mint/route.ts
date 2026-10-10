import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import {
  CAPTURE_CHUNK,
  captureBatch,
  chunkIds,
  hexesPublicClient,
} from "@/lib/onchain/hexes";

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
    .where(and(eq(hexes.runId, id), isNull(hexes.mintedAt)));
  const ids = rows.map((r) => r.h3Id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, minted: 0 });
  }

  const client = hexesPublicClient(chainKey);
  let minted = 0;
  let txHash: string | null = null;
  for (const chunk of chunkIds(ids, CAPTURE_CHUNK)) {
    const result = await captureBatch(run.userAddress as Address, chunk, chainKey);
    if (result.ok !== true) {
      log.warn("sponsor mint failed", {
        runId: id,
        minted,
        reason: result.reason,
        error: result.error?.slice(0, 180),
      });
      return NextResponse.json(
        { error: "mint failed", minted, reason: result.error || result.reason },
        { status: 503 },
      );
    }
    const receipt = await client.waitForTransactionReceipt({
      hash: result.txHash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      log.warn("sponsor mint reverted", { runId: id, minted, txHash: result.txHash });
      return NextResponse.json(
        { error: "mint failed", minted, txHash: result.txHash },
        { status: 503 },
      );
    }
    await db
      .update(hexes)
      .set({ mintedAt: sql`now()`, mintTxHash: result.txHash })
      .where(inArray(hexes.h3Id, chunk));
    minted += chunk.length;
    txHash = result.txHash;
  }

  log.info("sponsor mint done", { runId: id, count: minted, txHash });
  return NextResponse.json({ ok: true, minted, txHash });
}
