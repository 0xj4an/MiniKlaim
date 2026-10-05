import { eq, inArray } from "drizzle-orm";
import { gridDisk, isValidCell } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:hexes");

export const dynamic = "force-dynamic";

// Caps the disk so a client cannot ask for a continental IN-list.
const MAX_DISK = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const near = url.searchParams.get("near");
  const kRaw = Number(url.searchParams.get("k") ?? "50");
  const k = Number.isFinite(kRaw)
    ? Math.min(MAX_DISK, Math.max(1, Math.floor(kRaw)))
    : 50;

  const base = db
    .select({
      h3: hexes.h3Id,
      owner: hexes.ownerAddress,
      ownerUsername: users.username,
    })
    .from(hexes)
    .leftJoin(users, eq(hexes.ownerAddress, users.address));

  // No `near`: world and territory maps still need every claim. The run
  // screen passes a res-12 cell so a walk does not download the whole table.
  if (!near) {
    const rows = await base;
    log.info("hexes fetched", { count: rows.length, scoped: false });
    return NextResponse.json({ hexes: rows });
  }

  if (!isValidCell(near)) {
    return NextResponse.json({ error: "invalid h3" }, { status: 400 });
  }

  const rows = await base.where(inArray(hexes.h3Id, gridDisk(near, k)));
  log.info("hexes fetched", { count: rows.length, scoped: true, k });
  return NextResponse.json({ hexes: rows });
}
