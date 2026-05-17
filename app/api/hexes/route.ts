import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:hexes");

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      h3: hexes.h3Id,
      owner: hexes.ownerAddress,
      claimedAt: hexes.claimedAt,
    })
    .from(hexes);

  log.info("hexes fetched", { count: rows.length });

  return NextResponse.json({ hexes: rows });
}
