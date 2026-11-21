import { pg } from "@/lib/db";
import { packJsonText, type PackedJson } from "@/lib/http/json-body";
import { getRanking } from "@/lib/leaderboardRanking";
import { createLogger } from "@/lib/logger";
import type { ClaimedHexRow } from "@/lib/map/claimedView";
import {
  addToOwners,
  groupByOwner,
  ownersJson,
  type WorldOwnerGroup,
} from "@/lib/map/worldHexes";
import { createThinner, type WorldThinRes } from "@/lib/map/worldThin";
import { ownerNameMap } from "@/lib/ownerNames";
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

/** Rows per slice. 5,000 is 2 ms to group and 11 ms to thin. */
const WORLD_BATCH = 5_000;

/**
 * Every claim, without each block's level (the world map does not draw
 * levels, and carrying them is ~250k more numbers), handed over in slices.
 *
 * Building this list used to freeze the process. 16 Nov 2026, first night
 * of the stall log: 68 freezes in 9.3 h, 1.3 to 4.3 s each, and 24 of the
 * 28 times the full list was served a freeze sat on top of it. Measured on
 * prod with 498,906 blocks, the build was a chain of uninterrupted steps:
 * the driver turning the rows into objects (155 ms holds), grouping
 * (192 ms), JSON.stringify (135 ms), gzipSync (446 ms), and for the thinned
 * list 1,140 ms of cellToParent. On a host whose CPU is contended those
 * double or triple, and both lists rebuild every five minutes.
 *
 * A cursor makes the database hand the rows over 5,000 at a time. Each
 * slice is a network wait, so the process answers players in between, and
 * the list is never held whole in memory as half a million objects. The
 * longest hold measured this way was 40 ms.
 *
 * Raw SQL because drizzle has no cursor. The column aliases are the row
 * shape the rest of the app uses; a test reads them back.
 *
 * No join to `users`. The join made Postgres hash the whole users table on
 * every rebuild, 13.6 times an hour for each list, and held that work inside
 * the cursor: the query's worst case grew from 2.9 s to 4.1 s between 19 and
 * 21 Nov 2026 as both tables grew. Names are looked up afterwards, by
 * primary key, for the few thousand owners that actually hold blocks
 * (`namesFor`). Rows leave here with `ownerUsername: null`.
 */
async function eachWorldBatch(
  onBatch: (rows: ClaimedHexRow[]) => void,
): Promise<number> {
  let count = 0;
  const query = pg<ClaimedHexRow[]>`
    select h.h3_id as h3, h.owner_address as owner, null::text as "ownerUsername"
    from hexes h`;
  for await (const batch of query.cursor(WORLD_BATCH)) {
    onBatch(batch);
    count += batch.length;
  }
  return count;
}

/**
 * A build that takes this long is worth a line in the log. `info` is
 * dropped in production (lib/logger.ts), which is why "world list built"
 * never showed up there; a slow build logs at `warn` with its timing.
 */
const SLOW_BUILD_MS = 2_000;

function logBuild(started: number, data: Record<string, unknown>): void {
  const ms = Date.now() - started;
  if (ms >= SLOW_BUILD_MS) log.warn("world list built slowly", { ms, ...data });
  else log.info("world list built", { ms, ...data });
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
    if (shape === "owners") {
      const started = Date.now();
      const groups = new Map<string, WorldOwnerGroup>();
      const count = await eachWorldBatch((rows) => addToOwners(groups, rows));
      const names = await ownerNameMap(groups.keys());
      for (const g of groups.values()) {
        g.ownerUsername = names.get(g.owner) ?? null;
      }
      logBuild(started, { count, shape, owners: groups.size });
      return packJsonText(await ownersJson([...groups.values()]));
    }
    // One row per block. Nothing asks for it (the route logs a warning when
    // something does); written slice by slice all the same, so a scraper
    // cannot freeze the process by asking.
    // Names first here: each slice is written as text as it arrives, so
    // the name has to be known by then.
    const started = Date.now();
    const owners = await pg<{ owner: string }[]>`
      select distinct owner_address as owner from hexes`;
    const names = await ownerNameMap(owners.map((o) => o.owner));
    const slices: string[] = [];
    const count = await eachWorldBatch((rows) => {
      if (rows.length === 0) return;
      for (const r of rows) r.ownerUsername = names.get(r.owner) ?? null;
      slices.push(JSON.stringify(rows).slice(1, -1));
    });
    logBuild(started, { count, shape });
    return packJsonText(`{"hexes":[${slices.join(",")}]}`);
  });
}

export function thinnedWorldList(res: WorldThinRes): Promise<PackedJson> {
  return thinShared.get(String(res), async () => {
    // A top-ten block wins its cell: those ten colours are the only thing
    // distinguishing the world map from a grey smear.
    const started = Date.now();
    const top = await topOwners();
    const thinner = createThinner(res, (owner) =>
      top.has(owner.toLowerCase()) ? 1 : 0,
    );
    const count = await eachWorldBatch(thinner.add);
    const thinned = thinner.rows();
    const names = await ownerNameMap(thinned.map((r) => r.owner));
    for (const r of thinned) r.ownerUsername = names.get(r.owner) ?? null;
    logBuild(started, { count, thinned: thinned.length, res });
    // The header counts every captured block, not the dots drawn, so the
    // real total travels with the thinned list.
    return packJsonText(
      await ownersJson(groupByOwner(thinned), { total: count }),
    );
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
