import { count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { BADGE_IDS, mintBadgesBatch } from "@/lib/onchain/badges";

const log = createLogger("api:runs:finish");

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [updated] = await db
    .update(runs)
    .set({ endedAt: sql`now()` })
    .where(eq(runs.id, id))
    .returning({
      id: runs.id,
      userAddress: runs.userAddress,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
    });

  if (!updated) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  log.info("run finished", {
    id: updated.id,
    hexesClaimed: updated.hexesClaimed,
  });

  // Hex minting is now driven by the client after finish: the player either
  // submits their own `claimRun` tx (POST /voucher then on-chain, recorded via
  // /claimed) so they count as a unique on-chain wallet, or falls back to the
  // sponsored relayer (POST /sponsor-mint) when they cannot pay gas. Badges stay
  // relayer-minted in the background here.
  void mintEligibleBadges(updated.userAddress as Address);

  return NextResponse.json(updated);
}

/**
 * Read the player's lifetime totals, derive every badge they currently
 * qualify for, and call the badges contract's `mintBatch`. The contract
 * skips badges the player already holds, so we can pass the full eligible
 * list every time without checking on-chain state first.
 *
 * Streak badges (3/7/14 day) are intentionally skipped here because day
 * streak computation requires a separate query; will land in a follow-up.
 */
async function mintEligibleBadges(player: Address) {
  const lower = player.toLowerCase();
  const [hexCountRow] = await db
    .select({ c: count() })
    .from(hexes)
    .where(eq(hexes.ownerAddress, lower));
  const [runCountRow] = await db
    .select({ c: count() })
    .from(runs)
    .where(eq(runs.userAddress, lower));
  const [bestRunRow] = await db
    .select({ hexesClaimed: runs.hexesClaimed })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .orderBy(desc(runs.hexesClaimed))
    .limit(1);
  const [bestDistRow] = await db
    .select({ distanceMeters: runs.distanceMeters })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .orderBy(desc(runs.distanceMeters))
    .limit(1);

  const hexesOwned = hexCountRow?.c ?? 0;
  const totalRuns = runCountRow?.c ?? 0;
  const bestRunHexes = bestRunRow?.hexesClaimed ?? 0;
  const bestRunDistance = bestDistRow?.distanceMeters ?? 0;

  const candidates: bigint[] = [];
  if (totalRuns >= 1) candidates.push(BADGE_IDS.firstSteps);
  if (hexesOwned >= 5) candidates.push(BADGE_IDS.fiveBlocks);
  if (hexesOwned >= 20) candidates.push(BADGE_IDS.mayor);
  if (hexesOwned >= 100) candidates.push(BADGE_IDS.hundred);
  if (bestRunHexes >= 5) candidates.push(BADGE_IDS.bigRun);
  if (bestRunDistance >= 10000) candidates.push(BADGE_IDS.marathon);
  if (totalRuns >= 50) candidates.push(BADGE_IDS.iron);

  if (candidates.length === 0) {
    log.info("no badge candidates", { player: lower });
    return;
  }

  const result = await mintBadgesBatch(player, candidates);
  if (result.ok !== true) {
    log.warn("badges mint not done", {
      player: lower,
      reason: result.reason,
    });
    return;
  }

  log.info("badges mint queued", {
    player: lower,
    candidates: candidates.map((b) => Number(b)),
    txHash: result.txHash,
  });
}
