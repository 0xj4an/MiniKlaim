import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";
import { packJson, type PackedJson } from "@/lib/http/json-body";
import { getRanking } from "@/lib/leaderboardRanking";
import { createLogger } from "@/lib/logger";
import type { ClaimedHexRow } from "@/lib/map/claimedView";
import { groupByOwner } from "@/lib/map/worldHexes";
import { thinToParents, type WorldThinRes } from "@/lib/map/worldThin";
import { createSharedCache } from "@/lib/sharedCache";

const log = createLogger("map:worldList");

/**
 * The world list, built once and shared.
 *
 * Measured on prod: this costs 2.60 s to build and 180 ms to serve from
 * memory. Without stale-while-revalidate, one player every five minutes
 * waited the whole 2.6 s, on the endpoint whose rebuild blocks the process:
 * that is the shape of the 504s against /api/hexes and against claim
 * (MINIKLAIM-19, MINIKLAIM-17), since a blocked process makes everything
 * else late too.
 *
 * The answer can now be older than the TTL by one rebuild. For a world map
 * that is five minutes stale by design, and whose own fresh blocks are
 * merged in on the run map, that is the right trade.
 *
 * It lives here rather than in the route so that startup can fill it before
 * the first player arrives: a route module is only evaluated on its first
 * request, which is exactly the request that was paying the 2.6 s.
 */
export const WORLD_TTL_MS = 5 * 60_000;

export type WorldShape = "flat" | "owners";

const worldShared = createSharedCache<PackedJson>(WORLD_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

/** The thinned world, one entry per resolution, on the same terms. */
const thinShared = createSharedCache<PackedJson>(WORLD_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

/**
 * Every claim, without each block's level: the world map does not draw
 * levels, and carrying them is ~250k more numbers.
 */
function selectWorldRows(): Promise<ClaimedHexRow[]> {
  return db
    .select({
      h3: hexes.h3Id,
      owner: hexes.ownerAddress,
      ownerUsername: users.username,
    })
    .from(hexes)
    .leftJoin(users, eq(hexes.ownerAddress, users.address));
}

/** The ten owners the world map colours, lowercased. */
async function topOwners(): Promise<Set<string>> {
  const top = new Set<string>();
  try {
    const ranking = await getRanking();
    for (const r of ranking.rows.slice(0, 10)) top.add(r.address.toLowerCase());
  } catch {
    // Without it the map is correct, just less colourful. Not a reason to
    // fail the world view.
  }
  return top;
}

export function worldList(shape: WorldShape): Promise<PackedJson> {
  return worldShared.get(shape, async () => {
    const rows = await selectWorldRows();
    log.info("world list built", { count: rows.length, shape });
    return packJson(
      shape === "owners" ? { owners: groupByOwner(rows) } : { hexes: rows },
    );
  });
}

export function thinnedWorldList(res: WorldThinRes): Promise<PackedJson> {
  return thinShared.get(String(res), async () => {
    // A top-ten block wins its cell: those ten colours are the only thing
    // distinguishing the world map from a grey smear.
    const [top, rows] = await Promise.all([topOwners(), selectWorldRows()]);
    const thinned = thinToParents(rows, res, (owner) =>
      top.has(owner.toLowerCase()) ? 1 : 0,
    );
    log.info("world list built", {
      count: rows.length,
      thinned: thinned.length,
      res,
    });
    // The header counts every captured block, not the dots drawn, so the
    // real total travels with the thinned list.
    return packJson({ owners: groupByOwner(thinned), total: rows.length });
  });
}

/**
 * Fill the caches at startup, so the first player after a deploy is served
 * from memory instead of paying the 2.6 s build.
 *
 * Only the two lists the app actually asks for: res 2 is the world view's
 * own resolution, and `owners` is the full list the deeper zooms fetch. The
 * other resolutions are built on demand, which is cheap once warm.
 *
 * They are built one after the other, thin first, not concurrently. Measured
 * on prod: warming both at once took 9.2 s, and a player arriving inside
 * that window waits for it, because the cache is single-flight and the
 * request attaches to the build already running. Thin first means the list
 * the world map actually opens with is ready in about a third of that, and
 * the full list, which only a zoomed-in player needs, finishes behind it
 * instead of competing with it for the same database.
 *
 * Failures are logged and dropped. A cold cache is the state this is trying
 * to improve on, not a reason to refuse to boot.
 *
 * Both outcomes log at `warn`, not `info`, for the reason in lib/logger.ts:
 * production has no LOG_LEVEL, so the floor is `warn` and an `info` line is
 * dropped. This is the only evidence that the warm happened at all, and a
 * startup step you cannot see in the logs is one you cannot trust. It is one
 * line per boot.
 */
export async function warmWorldList(): Promise<void> {
  const started = Date.now();
  // Logged before the work, so the logs tell "never started" apart from
  // "started and failed". Without this line the only evidence of a failed
  // warm is a slow first request, which is what it is meant to prevent.
  log.warn("world list warm started");
  const failed: unknown[] = [];
  // Sequential and thin first: see the note above. One failure must not stop
  // the other, so each is caught on its own.
  try {
    await thinnedWorldList(2);
    log.warn("world list warm thin ready", { ms: Date.now() - started });
  } catch (e) {
    failed.push(e);
  }
  try {
    await worldList("owners");
  } catch (e) {
    failed.push(e);
  }
  if (failed.length > 0) {
    log.warn("world list warm incomplete", {
      failed: failed.length,
      ms: Date.now() - started,
      message:
        failed[0] instanceof Error ? failed[0].message : String(failed[0]),
    });
    return;
  }
  log.warn("world list warm", { ms: Date.now() - started });
}
