import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { activeHints } from "@/lib/drops/detect";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:drops:active");

export const dynamic = "force-dynamic";

/**
 * Open treasures as hints: the res-8 cell, the spot name, the prize and the
 * close date. Never the block: detection and anti-cheat run on the server.
 */
export async function GET() {
  if (!isTreasuresEnabled()) return NextResponse.json({ drops: [] });
  try {
    const rows = await activeHints(db, new Date());
    return NextResponse.json(
      { drops: rows },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (e) {
    log.error("active drops failed", {
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json({ drops: [] }, { status: 500 });
  }
}
