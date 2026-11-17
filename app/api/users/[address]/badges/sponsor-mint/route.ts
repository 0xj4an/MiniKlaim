import {
  FEE_NATIVE_ONLY_HEADER,
  FEE_SHORTFALL_HEADER,
} from "@/lib/onchain/sponsorHeaders";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { claimableBadgeIds } from "@/lib/onchain/claimableBadges";
import { addressesForPlayer } from "@/lib/players";
import { mintBadgesBatch } from "@/lib/onchain/badges";
import {
  checkRelayerBalance,
  playerCanPay,
  recordSponsored,
  sponsoredLast24h,
} from "@/lib/onchain/sponsor";
import {
  dailyBadgeCap,
  RUN_TOKEN_HEADER,
  runTokenMatches,
} from "@/lib/onchain/sponsorRules";

const log = createLogger("api:badges:sponsor-mint");

export const dynamic = "force-dynamic";

/**
 * Relayer-mint eligible badges the player does not already hold on any
 * linked wallet. The caller proves it is the player's client with the token
 * of one of the player's runs (`?runId=` plus the run token header). Refused
 * when the player can pay, and limited to `dailyBadgeCap` badges per wallet a
 * day: a player with more pending gets that many now and the rest later.
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
  const runId = url.searchParams.get("runId");
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: "runId required" }, { status: 403 });
  }
  const [run] = await db
    .select({
      userAddress: runs.userAddress,
      claimTokenHash: runs.claimTokenHash,
    })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (
    !run ||
    run.userAddress.toLowerCase() !== lower ||
    !runTokenMatches(run.claimTokenHash, request.headers.get(RUN_TOKEN_HEADER))
  ) {
    log.warn("badge sponsor refused: bad run token", { player: lower, runId });
    return NextResponse.json({ error: "not your run" }, { status: 403 });
  }

  // The same computation the player's own voucher uses, so the sponsored and
  // paid paths cannot drift apart again.
  const candidates = await claimableBadgeIds(lower as Address, chainKey);
  if (candidates.length === 0) {
    return NextResponse.json({ minted: [] });
  }

  const shortfall = request.headers.get(FEE_SHORTFALL_HEADER) === "1";
  // Outside MiniPay a stablecoin balance cannot pay a fee, so it must
  // not count as the player being able to pay.
  const nativeOnly = request.headers.get(FEE_NATIVE_ONLY_HEADER) === "1";
  const pay = shortfall
    ? { canPay: false as const, via: undefined }
    : await playerCanPay(lower as Address, 0, candidates.length, chainKey, {
        nativeOnly,
      });
  if (pay.canPay) {
    log.warn("badge sponsor refused: player can pay", {
      player: lower,
      via: pay.via,
    });
    return NextResponse.json(
      { error: "player can pay", reason: "player_can_pay", via: pay.via },
      { status: 402 },
    );
  }
  // Per player, across every linked wallet.
  const allowance =
    dailyBadgeCap() - (await sponsoredLast24h(db, await addressesForPlayer(lower), "badges"));
  if (allowance <= 0) {
    log.warn("badge sponsor refused: daily cap", { player: lower });
    return NextResponse.json(
      { error: "daily limit", reason: "daily_cap" },
      { status: 429 },
    );
  }
  const batch = candidates.slice(0, allowance);

  const result = await mintBadgesBatch(lower as Address, batch, chainKey);
  if (result.ok !== true) {
    log.warn("badge sponsor mint not done", {
      player: lower,
      reason: result.reason,
    });
    void checkRelayerBalance(chainKey);
    return NextResponse.json(
      { error: "mint unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  await recordSponsored(db, {
    address: lower,
    runId,
    kind: "badges",
    count: result.minted.length,
    txHash: result.txHash,
  });
  void checkRelayerBalance(chainKey);
  return NextResponse.json({
    txHash: result.txHash,
    minted: result.minted.map((b) => b.toString()),
    // Badges still pending past today's allowance.
    remaining: candidates.length - batch.length,
  });
}
