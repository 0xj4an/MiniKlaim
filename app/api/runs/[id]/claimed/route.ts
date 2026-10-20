import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getChain, parseChainKey } from "@/lib/onchain/chains";

const log = createLogger("api:runs:claimed");

export const dynamic = "force-dynamic";

/**
 * Persist the on-chain mint reference after the player successfully submitted
 * their own `claimRun` tx. Records the tx hash against every hex in the run.
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

  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const mintsTokens = !getChain(chainKey).hexesRecords;
  await db
    .update(hexes)
    .set({
      mintedAt: sql`now()`,
      mintTxHash: txHash,
      ...(mintsTokens ? { tokenAt: sql`now()` } : {}),
    })
    .where(eq(hexes.runId, id));
  await db
    .update(runs)
    .set({ mintStatus: "claimed", mintStatusAt: sql`now()` })
    .where(eq(runs.id, id));

  log.info("player claim recorded", { runId: id, txHash });
  return NextResponse.json({ ok: true });
}
