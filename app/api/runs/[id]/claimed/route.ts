import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { settledByClaimTx } from "@/lib/onchain/claimProof";
import { claimRouterAddress } from "@/lib/onchain/claimRouterAbi";
import { hexesPublicClient } from "@/lib/onchain/hexes";

const log = createLogger("api:runs:claimed");

export const dynamic = "force-dynamic";

/**
 * Persist the on-chain mint reference after the player submitted their own
 * `claimRun` or `claimAll` tx. Everything is read from the chain: the tx must
 * have succeeded, been sent by the run's player to our Hexes contract or
 * router, and only the blocks it names that belong to this run are marked.
 * A forged call (any hash, or someone else's tx) changes nothing, so it can
 * no longer take a run's blocks out of the settle queues.
 *
 * On a chain whose Hexes contract still mints (v1) the hexes are now tokens
 * too; on v2 they are only recorded.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    txHash?: string;
  } | null;
  const txHash = body?.txHash;

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }

  const [run] = await db
    .select({ userAddress: runs.userAddress })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const chain = getChain(chainKey);
  // The client posts right after sending, so the tx may still be pending.
  const client = hexesPublicClient(chainKey);
  const receipt = await client
    .waitForTransactionReceipt({ hash: txHash as Hex, timeout: 60_000 })
    .catch(() => null);
  const tx = receipt
    ? await client.getTransaction({ hash: txHash as Hex }).catch(() => null)
    : null;
  if (!receipt || !tx) {
    // Not settled here: the blocks stay queued and the relayer or the
    // backlog settle them.
    log.warn("claim tx not found", { runId: id, txHash });
    return NextResponse.json({ error: "receipt not found" }, { status: 404 });
  }

  const settled = settledByClaimTx({
    player: run.userAddress,
    status: receipt.status,
    from: receipt.from,
    to: receipt.to,
    input: tx.input,
    hexesAddress: chain.hexesAddress,
    routerAddress: claimRouterAddress(chainKey),
  });
  if (!settled) {
    log.warn("claimed refused: not a claim by this run's player", {
      runId: id,
      txHash,
      player: run.userAddress,
      from: receipt.from,
      to: receipt.to,
      status: receipt.status,
    });
    return NextResponse.json({ error: "not a claim by this run's player" }, { status: 400 });
  }
  if (settled.length === 0) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  const mintsTokens = !chain.hexesRecords;
  const marked = await db
    .update(hexes)
    .set({
      mintedAt: sql`now()`,
      mintTxHash: txHash,
      ...(mintsTokens ? { tokenAt: sql`now()` } : {}),
    })
    .where(
      and(
        eq(hexes.runId, id),
        inArray(hexes.h3Id, settled),
        isNull(hexes.mintedAt),
      ),
    )
    .returning({ h3Id: hexes.h3Id });
  if (marked.length > 0) {
    await db
      .update(runs)
      .set({ mintStatus: "claimed", mintStatusAt: sql`now()` })
      .where(eq(runs.id, id));
  }

  log.info("player claim recorded", { runId: id, txHash, marked: marked.length });
  return NextResponse.json({ ok: true, marked: marked.length });
}
