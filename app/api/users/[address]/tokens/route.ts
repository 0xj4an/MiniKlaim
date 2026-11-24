import { inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { quoteMint, quoteMintGas } from "@/lib/onchain/mintFee";
import { mintPlan } from "@/lib/onchain/mintPlan";
import { mintTokensForAvailable } from "@/lib/onchain/hexes";
import { sponsoredLast24h } from "@/lib/onchain/sponsor";
import { addressesForPlayer } from "@/lib/players";
import {
  dailyTokenCap,
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
 *
 * `others` is the same count for the player's other linked wallets. The
 * profile's block count is the player's, across every wallet, and this card
 * counted one wallet: 23,166 NFTs under "28,759 blocks" looked like 5,593
 * blocks had gone missing (0xj4an, 23 Nov 2026). Minting stays per wallet:
 * `mintTokens` gives the token to the wallet that signs.
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

  const linked = await addressesForPlayer(lower);
  const rows = await db
    .select({
      owner: hexes.ownerAddress,
      recorded: sql<number>`count(*) filter (where ${hexes.mintedAt} is not null and ${hexes.tokenAt} is null)::int`,
      tokens: sql<number>`count(*) filter (where ${hexes.tokenAt} is not null)::int`,
      // Captured, with the run not claimed yet: on no chain so far.
      unrecorded: sql<number>`count(*) filter (where ${hexes.mintedAt} is null)::int`,
    })
    .from(hexes)
    .where(inArray(hexes.ownerAddress, linked))
    .groupBy(hexes.ownerAddress);
  const row = rows.find((r) => r.owner.toLowerCase() === lower);
  const others = rows
    .filter((r) => r.owner.toLowerCase() !== lower)
    .map((r) => ({
      address: r.owner.toLowerCase(),
      recorded: r.recorded,
      tokens: r.tokens,
      unrecorded: r.unrecorded,
    }))
    .sort((a, b) => b.tokens + b.recorded - (a.tokens + a.recorded));

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
  // Free NFTs left today for a player who cannot pay (tokens/sponsor-mint).
  // Not offered until the contract has mintTokensFor.
  const sponsorAvailable =
    enabled && nextBatch > 0 && (await mintTokensForAvailable(chainKey));
  const freeToday = sponsorAvailable
    ? Math.max(
        0,
        dailyTokenCap() - (await sponsoredLast24h(db, linked, "tokens")),
      )
    : 0;
  return NextResponse.json({
    enabled,
    sponsor: { available: sponsorAvailable, freeToday },
    recorded,
    tokens: row?.tokens ?? 0,
    unrecorded: row?.unrecorded ?? 0,
    others,
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
