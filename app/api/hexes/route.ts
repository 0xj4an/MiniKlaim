import { eq, inArray } from "drizzle-orm";
import { gridDisk, isValidCell } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";
import { jsonBody, packJson, type PackedJson } from "@/lib/http/json-body";
import { createLogger } from "@/lib/logger";
import { addressesForPlayer } from "@/lib/players";
import { groupByOwner } from "@/lib/map/worldHexes";
import { isHexStrengthEnabled, strengthSql } from "@/lib/runs/hexStrength";

const log = createLogger("api:hexes");

export const dynamic = "force-dynamic";

// Caps the disk so a client cannot ask for a continental IN-list.
const MAX_DISK = 60;

// The world list is ~24 MB of JSON as flat rows (~1.2 MB gzipped) at 230k
// hexes; `?fmt=owners` groups it by owner (~4 MB, ~0.8 MB gzipped), which is
// what the app asks for. The flat shape stays for old clients. Pages are
// compressed by Next; this route handler is not, so the body is packed here.
// One shared copy for a minute: community can lag a fresh claim by that long.
const WORLD_TTL_MS = 60_000;
const WORLD_CACHE = "public, max-age=60";
const SCOPED_CACHE = "private, no-cache";

type WorldShape = "flat" | "owners";
const worldCache = new Map<WorldShape, { packed: PackedJson; at: number }>();
const worldInflight = new Map<WorldShape, Promise<PackedJson>>();

async function worldPacked(
  shape: WorldShape,
  load: () => Promise<PackedJson>,
): Promise<PackedJson> {
  const now = Date.now();
  const cached = worldCache.get(shape);
  if (cached && now - cached.at < WORLD_TTL_MS) return cached.packed;
  let inflight = worldInflight.get(shape);
  if (!inflight) {
    inflight = load()
      .then((packed) => {
        worldCache.set(shape, { packed, at: Date.now() });
        return packed;
      })
      .finally(() => {
        worldInflight.delete(shape);
      });
    worldInflight.set(shape, inflight);
  }
  return inflight;
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
  // Scoped lists (run map, own territory) carry each block's level. The world
  // list does not: ~250k more numbers for a map that does not draw levels.
  const scoped = isHexStrengthEnabled()
    ? db
        .select({
          h3: hexes.h3Id,
          owner: hexes.ownerAddress,
          ownerUsername: users.username,
          strength: strengthSql(hexes.baseStrength, hexes.damage, hexes.reinforcedAt),
        })
        .from(hexes)
        .leftJoin(users, eq(hexes.ownerAddress, users.address))
    : base;

  // Territory asks for one player, including every linked wallet. The world
  // map omits `owner` and still receives every claim.
  if (owner) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    const linked = await addressesForPlayer(owner);
    const rows = await scoped.where(inArray(hexes.ownerAddress, linked));
    log.info("hexes fetched", { count: rows.length, scoped: "owner" });
    return jsonBody(request, packJson({ hexes: rows }), SCOPED_CACHE);
  }

  // No `near`: the world map needs every claim. The run screen passes a
  // res-12 cell so a walk does not download the whole table.
  if (!near) {
    const shape: WorldShape = url.searchParams.get("fmt") === "owners" ? "owners" : "flat";
    const packed = await worldPacked(shape, async () => {
      const rows = await base;
      log.info("hexes fetched", { count: rows.length, scoped: "all", shape });
      return packJson(shape === "owners" ? { owners: groupByOwner(rows) } : { hexes: rows });
    });
    return jsonBody(request, packed, WORLD_CACHE);
  }

  if (!isValidCell(near)) {
    return NextResponse.json({ error: "invalid h3" }, { status: 400 });
  }

  const rows = await scoped.where(inArray(hexes.h3Id, gridDisk(near, k)));
  log.info("hexes fetched", { count: rows.length, scoped: "near", k });
  return jsonBody(request, packJson({ hexes: rows }), SCOPED_CACHE);
}
