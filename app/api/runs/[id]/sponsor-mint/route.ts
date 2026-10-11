import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { parseChainKey } from "@/lib/onchain/chains";
import {
  playerCanPay,
  setMintStatus,
  sponsorRunHexes,
} from "@/lib/onchain/sponsor";
import { RUN_TOKEN_HEADER, runTokenMatches } from "@/lib/onchain/sponsorRules";

const log = createLogger("api:runs:sponsor-mint");

export const dynamic = "force-dynamic";

// One sponsor attempt per run at a time (single-replica web service).
const inFlight = new Set<string>();

/**
 * Relayer-mint this run's hexes. The server decides, not the client:
 *   - the caller must hold the run token issued when the run started;
 *   - the run must be finished;
 *   - a player who can pay their own claim (CELO or a fee stablecoin) is
 *     refused with 402 and the run is marked `sponsor_denied`;
 *   - the relayer mints at most the wallet's daily allowance.
 * A failure on our side marks the run `sponsor_failed`, which the retry cron
 * picks up. Nothing else is retried.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const chainKey = parseChainKey(
    new URL(request.url).searchParams.get("chain"),
  );

  const [run] = await db
    .select({
      userAddress: runs.userAddress,
      endedAt: runs.endedAt,
      claimTokenHash: runs.claimTokenHash,
    })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (
    !runTokenMatches(run.claimTokenHash, request.headers.get(RUN_TOKEN_HEADER))
  ) {
    log.warn("sponsor refused: bad run token", { runId: id });
    return NextResponse.json({ error: "not your run" }, { status: 403 });
  }
  if (!run.endedAt) {
    return NextResponse.json({ error: "run not finished" }, { status: 409 });
  }
  if (inFlight.has(id)) {
    return NextResponse.json({ error: "already in progress" }, { status: 409 });
  }

  inFlight.add(id);
  try {
    const player = run.userAddress as Address;
    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)::int` })
      .from(hexes)
      .where(and(eq(hexes.runId, id), isNull(hexes.mintedAt)));
    if (pending === 0) {
      return NextResponse.json({ ok: true, minted: 0 });
    }

    const pay = await playerCanPay(player, pending, 0, chainKey);
    if (pay.canPay) {
      await setMintStatus(db, id, "sponsor_denied");
      log.warn("sponsor refused: player can pay", {
        runId: id,
        player,
        pending,
        via: pay.via,
      });
      return NextResponse.json(
        { error: "player can pay", reason: "player_can_pay", via: pay.via },
        { status: 402 },
      );
    }

    const result = await sponsorRunHexes(db, { runId: id, player, chainKey });
    if (result.status === "sponsor_failed") {
      return NextResponse.json(
        {
          error: "mint failed",
          reason: result.error?.slice(0, 200) || "error",
          minted: result.minted,
        },
        { status: 503 },
      );
    }
    if (result.status === "sponsor_capped" && result.minted === 0) {
      return NextResponse.json(
        { error: "daily limit", reason: "daily_cap", left: result.left },
        { status: 429 },
      );
    }
    log.info("sponsor mint done", { runId: id, ...result });
    return NextResponse.json({
      ok: true,
      minted: result.minted,
      left: result.left,
      capped: result.status === "sponsor_capped",
      txHash: result.txHash,
    });
  } finally {
    inFlight.delete(id);
  }
}
