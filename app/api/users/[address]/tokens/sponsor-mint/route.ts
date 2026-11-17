import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { mintTokensForAvailable, mintTokensForBatch } from "@/lib/onchain/hexes";
import {
  mintedTo,
  mintTokensLog as log,
  splitByToken,
  tokenlessOwnedWhere,
} from "@/lib/onchain/mintTokens";
import {
  checkRelayerBalance,
  playerCanPay,
  recordSponsored,
  sponsoredLast24h,
} from "@/lib/onchain/sponsor";
import { FEE_NATIVE_ONLY_HEADER } from "@/lib/onchain/sponsorHeaders";
import {
  dailyTokenCap,
  estimateMintTokensGas,
  RUN_TOKEN_HEADER,
  runTokenMatches,
} from "@/lib/onchain/sponsorRules";

export const dynamic = "force-dynamic";

/**
 * Relayer-paid NFT mint for a player who cannot pay the fee (17 Nov 2026).
 * Up to `dailyTokenCap` NFTs per wallet a day; the player pays for more, or
 * comes back tomorrow. Same gate as the badge sponsor: `?runId=` of one of the
 * player's runs plus its `x-run-token`, so only the player's own client can
 * spend the relayer on their wallet. 402 when the player can pay, 429 past the
 * cap, 503 until the Hexes contract has `mintTokensFor`.
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
  const url = new URL(request.url);
  const chainKey = parseChainKey(url.searchParams.get("chain"));
  const { hexesAddress, hexesRecords } = getChain(chainKey);
  if (!hexesRecords) {
    return NextResponse.json({ error: "not available on this chain" }, { status: 409 });
  }

  const runId = url.searchParams.get("runId");
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "runId required" }, { status: 403 });
  }
  const [run] = await db
    .select({ userAddress: runs.userAddress, claimTokenHash: runs.claimTokenHash })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (
    !run ||
    run.userAddress.toLowerCase() !== lower ||
    !runTokenMatches(run.claimTokenHash, request.headers.get(RUN_TOKEN_HEADER))
  ) {
    log.warn("nft sponsor refused: bad run token", { player: lower, runId });
    return NextResponse.json({ error: "not your run" }, { status: 403 });
  }

  if (!(await mintTokensForAvailable(chainKey))) {
    return NextResponse.json({ error: "not available yet", reason: "not_upgraded" }, { status: 503 });
  }

  const allowance = dailyTokenCap() - (await sponsoredLast24h(db, lower, "tokens"));
  if (allowance <= 0) {
    return NextResponse.json({ error: "daily limit", reason: "daily_cap" }, { status: 429 });
  }

  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(tokenlessOwnedWhere(lower))
    .orderBy(hexes.claimedAt)
    .limit(allowance * 2);
  if (rows.length === 0) {
    return NextResponse.json({ error: "nothing to mint" }, { status: 409 });
  }
  let split: Awaited<ReturnType<typeof splitByToken>>;
  try {
    split = await splitByToken(
      rows.map((r) => r.h3Id),
      chainKey,
    );
  } catch {
    return NextResponse.json({ error: "chain read failed" }, { status: 503 });
  }
  if (split.existing.length > 0) {
    // Already tokens on-chain: the DB marker was behind. The paid voucher
    // route also moves any held by a previous owner; this one only skips them.
    await db
      .update(hexes)
      .set({ tokenAt: sql`now()` })
      .where(
        inArray(
          hexes.h3Id,
          split.existing.map((e) => e.h3),
        ),
      );
  }
  const batch = split.tokenless.slice(0, allowance);
  if (batch.length === 0) {
    return NextResponse.json({ error: "nothing to mint" }, { status: 409 });
  }

  // Free only for a player who cannot pay this mint themselves.
  const nativeOnly = request.headers.get(FEE_NATIVE_ONLY_HEADER) === "1";
  const pay = await playerCanPay(lower as Address, batch.length, 0, chainKey, {
    nativeOnly,
    gas: estimateMintTokensGas(batch.length),
  });
  if (pay.canPay) {
    return NextResponse.json(
      { error: "player can pay", reason: "player_can_pay", via: pay.via },
      { status: 402 },
    );
  }

  const result = await mintTokensForBatch(lower as Address, batch, chainKey);
  if (result.ok !== true) {
    void checkRelayerBalance(chainKey);
    return NextResponse.json({ error: "mint unavailable", reason: result.reason }, { status: 503 });
  }
  const minted = mintedTo(result.receiptLogs, hexesAddress, lower as Address);
  if (minted.length > 0) {
    await db.update(hexes).set({ tokenAt: sql`now()` }).where(inArray(hexes.h3Id, minted));
  }
  await recordSponsored(db, {
    address: lower,
    runId,
    kind: "tokens",
    count: minted.length,
    txHash: result.txHash,
  });
  void checkRelayerBalance(chainKey);
  log.info("sponsored nft mint", { player: lower, minted: minted.length, txHash: result.txHash });
  return NextResponse.json({
    txHash: result.txHash,
    minted: minted.length,
    remainingToday: Math.max(0, allowance - minted.length),
  });
}
