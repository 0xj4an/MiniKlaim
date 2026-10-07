import { eq, inArray } from "drizzle-orm";
import { gridDisk, isValidCell } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";
import { jsonBody, packJson, type PackedJson } from "@/lib/http/json-body";
import { createLogger } from "@/lib/logger";
import { addressesForPlayer } from "@/lib/players";

const log = createLogger("api:hexes");

export const dynamic = "force-dynamic";

// Caps the disk so a client cannot ask for a continental IN-list.
const MAX_DISK = 60;

// The world list is ~2 MB of JSON and gzip takes it to ~100 KB. Pages are
// compressed by Next; this route handler is not, so the body is packed here.
// One shared copy for a minute: community can lag a fresh claim by that long.
const WORLD_TTL_MS = 60_000;
const WORLD_CACHE = "public, max-age=60";
const SCOPED_CACHE = "private, no-cache";

let worldCache: { packed: PackedJson; at: number } | null = null;
let worldInflight: Promise<PackedJson> | null = null;

async function worldPacked(
  load: () => Promise<PackedJson>,
): Promise<PackedJson> {
  const now = Date.now();
  if (worldCache && now - worldCache.at < WORLD_TTL_MS) return worldCache.packed;
  if (!worldInflight) {
    worldInflight = load()
      .then((packed) => {
        worldCache = { packed, at: Date.now() };
        return packed;
      })
      .finally(() => {
        worldInflight = null;
      });
  }
  return worldInflight;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const near = url.searchParams.get("near");
  const owner = url.searchParams.get("owner");
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

  // Territory asks for one player, including every linked wallet. The world
  // map omits `owner` and still receives every claim.
  if (owner) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    const linked = await addressesForPlayer(owner);
    const rows = await base.where(inArray(hexes.ownerAddress, linked));
    log.info("hexes fetched", { count: rows.length, scoped: "owner" });
    return jsonBody(request, packJson({ hexes: rows }), SCOPED_CACHE);
  }

  // No `near`: the world map needs every claim. The run screen passes a
  // res-12 cell so a walk does not download the whole table.
  if (!near) {
    const packed = await worldPacked(async () => {
      const rows = await base;
      log.info("hexes fetched", { count: rows.length, scoped: "all" });
      return packJson({ hexes: rows });
    });
    return jsonBody(request, packed, WORLD_CACHE);
  }

  if (!isValidCell(near)) {
    return NextResponse.json({ error: "invalid h3" }, { status: 400 });
  }

  const rows = await base.where(inArray(hexes.h3Id, gridDisk(near, k)));
  log.info("hexes fetched", { count: rows.length, scoped: "near", k });
  return jsonBody(request, packJson({ hexes: rows }), SCOPED_CACHE);
}
