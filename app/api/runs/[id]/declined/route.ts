import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { setMintStatus } from "@/lib/onchain/sponsor";
import { RUN_TOKEN_HEADER, runTokenMatches } from "@/lib/onchain/sponsorRules";

const log = createLogger("api:runs:declined");

export const dynamic = "force-dynamic";

/**
 * The player closed the wallet sheet. Recorded so the retry cron leaves the
 * run alone; the player can still claim it later and pay the fee.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [run] = await db
    .select({ claimTokenHash: runs.claimTokenHash })
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (
    !runTokenMatches(run.claimTokenHash, request.headers.get(RUN_TOKEN_HEADER))
  ) {
    return NextResponse.json({ error: "not your run" }, { status: 403 });
  }
  await setMintStatus(db, id, "declined");
  log.info("run claim declined", { runId: id });
  return NextResponse.json({ ok: true });
}
