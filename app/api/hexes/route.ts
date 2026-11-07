import { eq, inArray } from "drizzle-orm";
import { gridDisk, isValidCell } from "h3-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";
import { jsonBody, packJson } from "@/lib/http/json-body";
import { createLogger } from "@/lib/logger";
import { addressesForPlayer } from "@/lib/players";
import { isHexStrengthEnabled, strengthSql } from "@/lib/runs/hexStrength";
import { parseThinRes } from "@/lib/map/worldThin";
import {
  thinnedWorldList,
  worldList,
  type WorldShape,
} from "@/lib/map/worldList";

const log = createLogger("api:hexes");

export const dynamic = "force-dynamic";

// Caps the disk so a client cannot ask for a continental IN-list.
const MAX_DISK = 60;

// Three shapes of the same world, measured against production on 7 Nov 2026
// at 337k hexes:
//
//   ?res=2          22 KB    0.43 s   what the app asks for at world zoom
//   ?res=3          43 KB    0.29 s
//   ?res=4          73 KB    1.08 s
//   ?fmt=owners    6.8 MB    0.44 s   grouped by owner, what the app asks for
//                                     once it needs every claim
//   ?fmt=flat     37.5 MB    8.82 s   one row per hex, owner repeated
//
// The flat shape is the default no longer. A single request for it pulled
// 37.5 MB and held the process for almost nine seconds, which is enough to
// make everyone else's request time out: it is the best candidate for
// MINIKLAIM-19 (26 events, 12 players) and for the uptime alerts that fire
// with no deploy to explain them.
//
// Nothing of ours ever asked for it. All five call sites pass `owner=`,
// `near=&k=`, `fmt=owners` or `res=`, and `git log -p` on lib/map/worldCache
// shows the client has used `fmt=owners` for as long as the file has existed.
// An older comment here claimed the flat shape stayed "for old clients"; the
// history does not support that there were any. So it now has to be asked
// for by name, and a bare request gets the grouped shape: the same claims,
// 5.5x smaller and 20x faster.
//
// Pages are compressed by Next; this route handler is not, so the body is
// packed in lib/map/worldList, which also owns the shared cache and warm-up.
const WORLD_CACHE = "public, max-age=300";
const SCOPED_CACHE = "private, no-cache";

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
          strength: strengthSql(
            hexes.baseStrength,
            hexes.damage,
            hexes.reinforcedAt,
          ),
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

  // The world view at its usual zoom draws one dot per parent cell, so it
  // asks for the list already thinned: roughly two thousand rows instead of
  // 303,000. The browser used to download all of them, 5.8 MB raw and about
  // 1 MB on the wire, and throw almost all of it away. The full list is
  // still served without `res`, for the zoom where polygons are drawn.
  const thinRes = parseThinRes(url.searchParams.get("res"));
  if (!near && thinRes !== null) {
    return jsonBody(request, await thinnedWorldList(thinRes), WORLD_CACHE);
  }

  // No `near`: the world map needs every claim. The run screen passes a
  // res-12 cell so a walk does not download the whole table.
  if (!near) {
    const shape: WorldShape =
      url.searchParams.get("fmt") === "flat" ? "flat" : "owners";
    if (shape === "flat")
      log.warn("flat world list requested", {
        ua: request.headers.get("user-agent")?.slice(0, 80) ?? null,
      });
    return jsonBody(request, await worldList(shape), WORLD_CACHE);
  }

  if (!isValidCell(near)) {
    return NextResponse.json({ error: "invalid h3" }, { status: 400 });
  }

  const rows = await scoped.where(inArray(hexes.h3Id, gridDisk(near, k)));
  log.info("hexes fetched", { count: rows.length, scoped: "near", k });
  return jsonBody(request, packJson({ hexes: rows }), SCOPED_CACHE);
}
