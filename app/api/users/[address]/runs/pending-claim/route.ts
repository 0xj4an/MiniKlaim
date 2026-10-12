import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:runs:pendingClaim");

export const dynamic = "force-dynamic";

/**
 * Finished runs whose hexes were never minted on-chain. Server is the source
 * of truth via `hexes.minted_at`; the client uses this to surface a claim
 * retry when a run was interrupted between Finish and the mint tx (typically
 * poor signal at end of run). Voucher endpoint is idempotent per run so
 * retries are safe.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  // `minted_at IS NULL` is the unminted marker. The previous filter also
  // required `mint_tx_hash NOT LIKE ...`, which is NULL for every unminted
  // row, so this endpoint never returned anything.
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.started_at AS "startedAt",
      r.ended_at AS "endedAt",
      r.hexes_claimed AS "hexesClaimed",
      r.distance_meters AS "distanceMeters",
      r.move_mode AS "moveMode",
      (
        SELECT COUNT(*)::int FROM hexes h
        WHERE h.run_id = r.id AND h.minted_at IS NULL
      ) AS "pendingHexes",
      r.pending_offers AS "offers"
    FROM runs r
    WHERE r.user_address = ${lower}
      AND r.ended_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM hexes h
        WHERE h.run_id = r.id AND h.minted_at IS NULL
      )
    ORDER BY r.ended_at DESC
    LIMIT 20
  `);

  log.debug("pending claim runs", {
    address: lower,
    count: Array.isArray(rows) ? rows.length : 0,
  });
  return NextResponse.json({ runs: rows });
}
