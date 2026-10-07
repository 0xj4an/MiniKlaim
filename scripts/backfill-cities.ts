#!/usr/bin/env tsx

import { db } from "../lib/db/index.js";
import { hexes } from "../lib/db/schema.js";
import { cityForHex } from "../lib/geo/city.js";
import { sql } from "drizzle-orm";

const BATCH_SIZE = 1000;
const DELAY_MS = 100;

async function backfillCities() {
  console.log("Starting city backfill...");

  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  while (true) {
    const rows = await db.execute(sql`
      SELECT h3_id, country
      FROM hexes
      WHERE city IS NULL AND country IS NOT NULL
      ORDER BY claimed_at DESC
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `);

    if (rows.length === 0) {
      break;
    }

    console.log(`Processing batch at offset ${offset} (${rows.length} rows)...`);

    for (const row of rows) {
      const h3Id = (row as { h3_id: string; country: string }).h3_id;
      const country = (row as { h3_id: string; country: string }).country;

      try {
        const city = cityForHex(h3Id, country);
        
        if (city) {
          await db
            .update(hexes)
            .set({ city })
            .where(sql`h3_id = ${h3Id}`);
          totalUpdated++;
        }
      } catch (e) {
        console.error(`Failed to process hex ${h3Id}:`, e);
      }

      totalProcessed++;
      
      if (totalProcessed % 100 === 0) {
        console.log(`  Processed: ${totalProcessed}, Updated: ${totalUpdated}`);
      }
    }

    offset += rows.length;

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log("\nBackfill complete!");
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Success rate: ${((totalUpdated / totalProcessed) * 100).toFixed(1)}%`);
}

backfillCities()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
