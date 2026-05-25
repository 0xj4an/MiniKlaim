import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { BADGE_IDS, mintBadgesBatch } from "@/lib/onchain/badges";
import { captureBatch } from "@/lib/onchain/hexes";

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

  // Fire on-chain capture batch in the background. We don't await it because
  // we don't want the client to wait for Celo confirmation; the player's UI
  // shows the run summary instantly. The mint resolves over the next ~5s.
  void mintRunHexes(updated.id, updated.userAddress as Address);
  void mintEligibleBadges(updated.userAddress as Address);

  return NextResponse.json(updated);
}

async function mintRunHexes(runId: string, player: Address) {
  // Pick up every hex captured in THIS run that hasn't been minted yet.
  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(and(eq(hexes.runId, runId), isNull(hexes.mintedAt)));

  const ids = rows.map((r) => r.h3Id);
  if (ids.length === 0) {
    log.info("no hexes to mint for run", { runId });
    return;
  }

  const result = await captureBatch(player, ids);
  if (result.ok !== true) {
    log.warn("on-chain mint not done", {
      runId,
      count: ids.length,
      reason: result.reason,
    });
    return;
  }

  // Mark the hexes as minted with the tx hash. The chain may still be
  // confirming; we treat broadcast as good enough for UI purposes.
  await db
    .update(hexes)
    .set({ mintedAt: sql`now()`, mintTxHash: result.txHash })
    .where(and(eq(hexes.runId, runId), isNull(hexes.mintedAt)));

  log.info("on-chain mint queued", {
    runId,
    count: ids.length,
    txHash: result.txHash,
  });
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
