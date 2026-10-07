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
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1),
    100,
  );

  const linked = await addressesForPlayer(lower);

  const addressList = sql.join(
    linked.map((a) => sql`${a}`),
    sql`, `,
  );

  const rows = await db.execute(sql`
    SELECT
      h.h3_id AS "h3Id",
      h.claimed_at AS "claimedAt",
      h.country,
      h.city,
      r.hexes_claimed AS "runHexes"
    FROM hexes h
    LEFT JOIN runs r ON h.run_id = r.id
    WHERE h.owner_address IN (${addressList})
    ORDER BY h.claimed_at DESC
    LIMIT ${limit}
  `);

  return NextResponse.json({ hexes: rows });
}
