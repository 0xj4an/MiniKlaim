import { inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { captureBatch } from "@/lib/onchain/hexes";
import {
  mintTokensLog as log,
  signMintTokensVoucher,
  splitByToken,
  tokenlessOwnedWhere,
} from "@/lib/onchain/mintTokens";
import { MINT_TOKENS_MAX, parseMintLimit } from "@/lib/onchain/sponsorRules";

export const dynamic = "force-dynamic";

/**
 * Voucher for `mintTokens`: up to MINT_TOKENS_MAX of this wallet's recorded
 * blocks that have no token. The voucher binds the wallet as `msg.sender`, so
 * nobody else can use it, and the contract skips any hex that already has a
 * token, so a stale voucher cannot take one.
 *
 * Before signing, `ownerOf` is checked on-chain: the DB's token marker is only a
 * cache (a v1 token recaptured before the upgrade has no marker). Hexes found
 * to be tokens are marked, and one held by someone else is moved to this
 * wallet, its owner in the database, by the relayer.
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
  if (!getChain(chainKey).hexesRecords) {
    return NextResponse.json({ error: "not available on this chain" }, { status: 409 });
  }

  const limit = parseMintLimit(await request.json().catch(() => null));

  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(tokenlessOwnedWhere(lower))
    .orderBy(hexes.claimedAt)
    .limit(MINT_TOKENS_MAX * 2);
  if (rows.length === 0) {
    return NextResponse.json({ error: "nothing to mint" }, { status: 409 });
  }

  let split: Awaited<ReturnType<typeof splitByToken>>;
  try {
    split = await splitByToken(
      rows.map((r) => r.h3Id),
      chainKey,
    );
  } catch (e) {
    log.warn("ownerOf check failed", {
      player: lower,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    });
    return NextResponse.json({ error: "chain read failed" }, { status: 503 });
  }

  if (split.existing.length > 0) {
    await db
      .update(hexes)
      .set({ tokenAt: sql`now()` })
      .where(
        inArray(
          hexes.h3Id,
          split.existing.map((e) => e.h3),
        ),
      );
    const drift = split.existing
      .filter((e) => e.owner.toLowerCase() !== lower)
      .map((e) => e.h3);
    if (drift.length > 0) {
      // The token sits with a previous owner. Recording it to this wallet moves it.
      const moved = await captureBatch(lower as Address, drift, chainKey);
      log.warn("token owner drift repaired", {
        player: lower,
        count: drift.length,
        ok: moved.ok,
        txHash: moved.ok === true ? moved.txHash : undefined,
      });
    }
  }

  // The client may ask for a smaller batch: the player pays the fee and it
  // grows with the count, so a wallet that cannot afford everything mints a
  // slice instead. Anything outside 1..MINT_TOKENS_MAX falls back to the max.
  const batch = split.tokenless.slice(0, limit ?? MINT_TOKENS_MAX);
  if (batch.length === 0) {
    return NextResponse.json({ error: "nothing to mint" }, { status: 409 });
  }
  const voucher = await signMintTokensVoucher(lower as Address, batch, chainKey);
  if (!voucher) {
    return NextResponse.json({ error: "voucher unavailable" }, { status: 503 });
  }
  log.info("mint voucher issued", { player: lower, count: batch.length, chainKey });
  return NextResponse.json(voucher);
}
