import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { db } from "@/lib/db";
import { challenges } from "@/lib/db/schema";
import { challengeDepositAddress, checkEntryTx, recordEntry } from "@/lib/challenges/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:challenges:entries");

export const dynamic = "force-dynamic";

/**
 * Register a paid entry from its tx hash. The chain is the only source: the
 * transfer, its sender, amount, recipient and time are read from the receipt.
 * 202 while the tx is not mined yet, so the client retries.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { txHash?: string };
  const txHash = (body.txHash ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }
  const deposit = challengeDepositAddress();
  if (!deposit) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const [c] = await db.select().from(challenges).where(eq(challenges.id, id)).limit(1);
  if (!c) return NextResponse.json({ error: "unknown challenge" }, { status: 404 });
  try {
    const check = await checkEntryTx(c, txHash as Hex, deposit);
    if ("reason" in check) {
      const status = check.reason === "pending" ? 202 : 422;
      return NextResponse.json({ ok: false, reason: check.reason }, { status });
    }
    const outcome = await recordEntry(db, c, txHash as Hex, check);
    return NextResponse.json({ ok: true, outcome, player: check.player });
  } catch (e) {
    log.error("entry check failed", {
      id,
      txHash,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json({ ok: false, reason: "error" }, { status: 502 });
  }
}
