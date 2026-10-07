import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { cityForHex } from "@/lib/geo/city";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (providedSecret !== ADMIN_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { batchSize = 1000, maxBatches = 10 } = await request.json().catch(() => ({}));

    let totalProcessed = 0;
    let totalUpdated = 0;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const rows = await db.execute(sql`
        SELECT h3_id, country
        FROM hexes
        WHERE city IS NULL AND country IS NOT NULL
        ORDER BY claimed_at DESC
        LIMIT ${batchSize}
      `);

      if (rows.length === 0) {
        break;
      }

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
      }

      batchCount++;
      
      if (rows.length < batchSize) {
        break;
      }
    }

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      updated: totalUpdated,
      batches: batchCount,
      successRate: totalProcessed > 0 
        ? `${((totalUpdated / totalProcessed) * 100).toFixed(1)}%`
        : "0%",
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
