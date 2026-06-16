import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:runs:claimed");

export const dynamic = "force-dynamic";

/**
 * Persist the on-chain mint reference after the player successfully submitted
 * their own `claimRun` tx. Records the tx hash against every hex in the run.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    txHash?: string;
  } | null;
  const txHash = body?.txHash;

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }

  await db
    .update(hexes)
    .set({ mintedAt: sql`now()`, mintTxHash: txHash })
    .where(eq(hexes.runId, id));

  log.info("player claim recorded", { runId: id, txHash });
  return NextResponse.json({ ok: true });
}
