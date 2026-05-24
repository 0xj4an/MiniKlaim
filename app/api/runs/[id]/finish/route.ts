import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
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
