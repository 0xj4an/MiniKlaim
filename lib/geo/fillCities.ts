import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { cityForHex } from "./city";

const log = createLogger("geo:fillCities");

type HexRow = { h3_id: string; country: string; run_id: string | null };

/**
 * Resolves city for hexes that only have a country, and writes it back.
 * Returns the most common city per run in this batch.
 */
export async function fillMissingCities(filter: {
  runIds?: string[];
  addresses?: string[];
}): Promise<Map<string, string>> {
  const topByRun = new Map<string, string>();
  const runIds = filter.runIds?.filter(Boolean) ?? [];
  const addresses = filter.addresses?.filter(Boolean) ?? [];
  if (runIds.length === 0 && addresses.length === 0) return topByRun;

  try {
    const where =
      runIds.length > 0
        ? sql`run_id IN (${sql.join(
            runIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql`owner_address IN (${sql.join(
            addresses.map((address) => sql`${address}`),
            sql`, `,
          )})`;

    const hexRows = (await db.execute(sql`
      SELECT h3_id, country, run_id
      FROM hexes
      WHERE ${where}
        AND city IS NULL
        AND country IS NOT NULL
      ORDER BY claimed_at DESC
      LIMIT 250
    `)) as unknown as HexRow[];

    const updates: Array<{ h3: string; city: string; runId: string | null }> =
      [];
    for (const hex of hexRows) {
      const city = cityForHex(hex.h3_id, hex.country);
      if (!city) continue;
      updates.push({ h3: hex.h3_id, city, runId: hex.run_id });
    }
    if (updates.length === 0) return topByRun;

    const values = sql.join(
      updates.map((row) => sql`(${row.h3}, ${row.city})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE hexes AS h
      SET city = v.city
      FROM (VALUES ${values}) AS v(h3_id, city)
      WHERE h.h3_id = v.h3_id
        AND h.city IS NULL
    `);

    const counts = new Map<string, Map<string, number>>();
    for (const row of updates) {
      if (!row.runId) continue;
      const byCity = counts.get(row.runId) ?? new Map<string, number>();
      byCity.set(row.city, (byCity.get(row.city) ?? 0) + 1);
      counts.set(row.runId, byCity);
    }
    for (const [runId, byCity] of counts) {
      let top = "";
      let best = 0;
      for (const [city, count] of byCity) {
        if (count > best) {
          best = count;
          top = city;
        }
      }
      if (top) topByRun.set(runId, top);
    }
  } catch (e) {
    log.warn("city fill failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return topByRun;
}
