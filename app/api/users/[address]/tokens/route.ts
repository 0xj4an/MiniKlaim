import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { quoteMint, quoteMintGas } from "@/lib/onchain/mintFee";
import { mintPlan } from "@/lib/onchain/mintPlan";
import {
  estimateMintTokensGas,
  MINT_TOKENS_MAX,
  MINT_TOKENS_SMALL_BATCH as SMALL_BATCH,
} from "@/lib/onchain/sponsorRules";

export const dynamic = "force-dynamic";

/**
 * How many of this wallet's blocks are recorded on-chain without a token, and
 * how many are tokens. Drives "mint your blocks" in the profile. `enabled` is
 * false until the chain's Hexes contract records (v2); before that every
 * settled block is already a token.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const enabled = getChain(chainKey).hexesRecords;

  const [row] = await db
    .select({
      recorded: sql<number>`count(*) filter (where ${hexes.mintedAt} is not null and ${hexes.tokenAt} is null)::int`,
      tokens: sql<number>`count(*) filter (where ${hexes.tokenAt} is not null)::int`,
    })
    .from(hexes)
    .where(eq(hexes.ownerAddress, lower));

  const recorded = row?.recorded ?? 0;
  const nextBatch = Math.min(recorded, MINT_TOKENS_MAX);
  // The player pays this fee, so quote it before they tap. The small batch is
  // only offered when it is actually smaller than the whole lot.
  const counts = nextBatch > SMALL_BATCH ? [nextBatch, SMALL_BATCH] : [nextBatch];
  // What finishing the whole pile takes, not just the next tap. A player with
  // a big run had no way of knowing that minting is one signature per 700
  // blocks, so the third wallet popup read as a bug.
  const plan = mintPlan(recorded);
  const quotes = nextBatch > 0 ? await quoteMint(chainKey, counts) : [];
  const planQuote =
    plan.signatures > 1 ? await quoteMintGas(chainKey, plan.totalGas) : null;
  return NextResponse.json({
    enabled,
    recorded,
    tokens: row?.tokens ?? 0,
    maxPerTx: MINT_TOKENS_MAX,
    nextBatch,
    nextBatchGas: estimateMintTokensGas(nextBatch).toString(),
    smallBatch: nextBatch > SMALL_BATCH ? SMALL_BATCH : null,
    quotes,
    plan: {
      signatures: plan.signatures,
      batches: plan.batches,
      // Null when the whole pile is one signature (the quote above says it
      // already) or when the chain could not be read.
      usd: planQuote,
    },
  });
}
