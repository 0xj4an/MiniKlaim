import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs, users } from "@/lib/db/schema";
import { fillMissingCities } from "@/lib/geo/fillCities";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    50,
  );

  const rows = await db
    .select({
      id: runs.id,
      address: runs.userAddress,
      username: users.username,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
      country: sql<string | null>`(
        SELECT country
        FROM hexes h
        WHERE h.run_id = ${runs.id} AND h.country IS NOT NULL
        GROUP BY country
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )`.as("country"),
      city: sql<string | null>`(
        SELECT city
        FROM hexes h
        WHERE h.run_id = ${runs.id} AND h.city IS NOT NULL
        GROUP BY city
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )`.as("city"),
    })
    .from(runs)
    .leftJoin(users, eq(runs.userAddress, users.address))
    .where(isNotNull(runs.endedAt))
    .orderBy(desc(runs.endedAt))
    .limit(limit);

  const missing = rows.filter((row) => !row.city).map((row) => row.id);
  if (missing.length > 0) {
    const filled = await fillMissingCities({ runIds: missing });
    for (const row of rows) {
      if (!row.city) row.city = filled.get(row.id) ?? null;
    }
  }

  return NextResponse.json({ activity: rows });
}
