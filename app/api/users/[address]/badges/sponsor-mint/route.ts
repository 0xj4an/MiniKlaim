import { FEE_SHORTFALL_HEADER } from "@/lib/onchain/sponsorHeaders";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { mintBadgesBatch } from "@/lib/onchain/badges";
import { badgeIdsHeldByPlayer } from "@/lib/onchain/playerHeldBadges";
import {
  checkRelayerBalance,
  playerCanPay,
  recordSponsored,
  sponsoredLast24h,
} from "@/lib/onchain/sponsor";
import {
  dailyBadgeTxCap,
  RUN_TOKEN_HEADER,
  runTokenMatches,
} from "@/lib/onchain/sponsorRules";

const log = createLogger("api:badges:sponsor-mint");

export const dynamic = "force-dynamic";

/**
 * Relayer-mint eligible badges the player does not already hold on any
 * linked wallet. The caller proves it is the player's client with the token
 * of one of the player's runs (`?runId=` plus the run token header). Refused
 * when the player can pay, and limited to a few sponsored txs per wallet a day.
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

  const eligible = await computeEligibleBadgeIds(lower as Address);
  const held = new Set(await badgeIdsHeldByPlayer(lower, chainKey));
  const candidates = eligible.filter((id) => !held.has(Number(id)));
  if (candidates.length === 0) {
    return NextResponse.json({ minted: [] });
  }

  const shortfall = request.headers.get(FEE_SHORTFALL_HEADER) === "1";
  const pay = shortfall
    ? { canPay: false as const, via: undefined }
    : await playerCanPay(lower as Address, 0, candidates.length, chainKey);
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
  if ((await sponsoredLast24h(db, lower, "badges")) >= dailyBadgeTxCap()) {
    log.warn("badge sponsor refused: daily cap", { player: lower });
    return NextResponse.json(
      { error: "daily limit", reason: "daily_cap" },
      { status: 429 },
    );
  }

  const result = await mintBadgesBatch(lower as Address, candidates, chainKey);
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
  });
}
