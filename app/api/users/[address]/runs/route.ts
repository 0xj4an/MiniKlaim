import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addressesForPlayer } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    100,
  );

  // Aggregate runs across every wallet linked to this address's player.
  // Falls back to `[lower]` when unlinked, so pre-link behavior matches.
  const linked = await addressesForPlayer(lower);

  // Each run's hexes share the same captureBatch tx hash; pick any one.
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.started_at AS "startedAt",
      r.ended_at AS "endedAt",
      r.hexes_claimed AS "hexesClaimed",
      r.distance_meters AS "distanceMeters",
      (
        SELECT mint_tx_hash
        FROM hexes h
        WHERE h.run_id = r.id AND h.mint_tx_hash IS NOT NULL
        LIMIT 1
      ) AS "mintTxHash"
    FROM runs r
    WHERE r.user_address = ANY(${linked}::text[])
    ORDER BY r.started_at DESC
    LIMIT ${limit}
  `);

  return NextResponse.json({ runs: rows });
}
