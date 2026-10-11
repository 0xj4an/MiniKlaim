import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { OFFER_COOLDOWN_HOURS } from "@/lib/onchain/sponsorRules";

const log = createLogger("api:runs:offered");

export const dynamic = "force-dynamic";

const COOLDOWN = sql.raw(`interval '${OFFER_COOLDOWN_HOURS} hours'`);

/**
 * The pending-claim prompt showed this unminted run. Counts at most one offer
 * per OFFER_COOLDOWN_HOURS so repeated focus events or reloads in one visit
 * count once. After OFFERS_BEFORE_SPONSOR offers the retry cron mints it for a
 * player with no fee balance. Calling this for someone else's run only moves
 * that owner's own hexes onto their wallet, within the daily allowance, so it
 * needs no run token.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid run" }, { status: 400 });
  }
  const rows = await db.execute<{ pending_offers: number }>(sql`
    UPDATE runs
    SET pending_offers = pending_offers + 1, pending_offered_at = now()
    WHERE id = ${id}
      AND ended_at IS NOT NULL
      AND (pending_offered_at IS NULL
        OR pending_offered_at < now() - ${COOLDOWN})
      AND EXISTS (
        SELECT 1 FROM hexes h WHERE h.run_id = runs.id AND h.minted_at IS NULL
      )
    RETURNING pending_offers
  `);
  const list = rows as unknown as Array<{ pending_offers: number }>;
  const counted = list.length > 0;
  if (counted) {
    log.info("pending run offered", {
      runId: id,
      offers: list[0].pending_offers,
    });
  }
  return NextResponse.json({
    counted,
    offers: list[0]?.pending_offers ?? null,
  });
}
