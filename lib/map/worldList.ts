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
import {
  createThinner,
  WORLD_THIN_RES,
  type WorldThinRes,
} from "@/lib/map/worldThin";
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
// Fifteen minutes since 23 Nov 2026 (it was five): every rebuild reads all
// of `hexes` and takes 5 to 10 s, and 22 of 22 rebuilds in 48 h were slow.
// The world view is a far zoom of 600k blocks: a quarter of an hour of lag
// there is invisible, and it is a third of the database work.
export const WORLD_TTL_MS = 15 * 60_000;

export type WorldShape = "flat" | "owners";

const worldShared = createSharedCache<PackedJson>(WORLD_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

/**
 * The grouped list and every thinned list, from one read of the table.
 *
 * Each list used to read all of `hexes` on its own: the grouped list and
 * the three thinned resolutions, every five minutes each. First timings
 * (21 Nov 2026, 592,641 blocks, slow builds logged for the first time):
 * 3.2 s for the grouped list and 4.2 to 7.3 s for each thinned one, so up
 * to four full reads and about 20 s of work per five minutes for data that
 * is the same rows every time.
 *
 * One read now feeds all of them. The coarser thinned lists are thinned
 * from the finest one instead of from the table: the winner of a cell is
 * the best of its children's winners (highest rank, then lowest id, a total
 * order), so thinning 900 winners gives the same answer as thinning 600k
 * rows.
 */
type WorldScan = {
  owners: PackedJson;
  thin: Record<WorldThinRes, PackedJson>;
};

const scanShared = createSharedCache<WorldScan>(WORLD_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

/** Finest first: each coarser list is thinned from the one before it. */
const THIN_FINE_TO_COARSE = [...WORLD_THIN_RES].sort((a, b) => b - a);

function worldScan(): Promise<WorldScan> {
  return scanShared.get("scan", async () => {
    const started = Date.now();
    const cpuStart = process.cpuUsage();
    const read: ReadTiming = { waitMs: 0, workMs: 0, maxHoldMs: 0 };
    // A top-ten block wins its cell: those ten colours are the only thing
    // distinguishing the world map from a grey smear.
    const top = await topOwners();
    const rank = (owner: string) => (top.has(owner.toLowerCase()) ? 1 : 0);
    const groups = new Map<string, WorldOwnerGroup>();
    const finest = createThinner(THIN_FINE_TO_COARSE[0], rank);
    const count = await eachWorldBatch((rows) => {
      addToOwners(groups, rows);
      finest.add(rows);
    }, read);
    const readDone = Date.now();
    const names = await ownerNameMap(groups.keys());
    for (const g of groups.values()) {
      g.ownerUsername = names.get(g.owner) ?? null;
    }
    const owners = packJsonText(await ownersJson([...groups.values()]));

    const thin = {} as Record<WorldThinRes, PackedJson>;
    let rows = finest.rows();
    for (const res of THIN_FINE_TO_COARSE) {
      if (res !== THIN_FINE_TO_COARSE[0]) {
        const coarser = createThinner(res, rank);
        coarser.add(rows);
        rows = coarser.rows();
      }
      for (const r of rows) r.ownerUsername = names.get(r.owner) ?? null;
      // The header counts every captured block, not the dots drawn, so the
      // real total travels with the thinned list.
      thin[res] = packJsonText(
        await ownersJson(groupByOwner(rows), { total: count }),
      );
    }
    // Where the seconds went (25 Nov 2026: builds of 8 s at the median and
    // 43 s at worst, with freezes of 1 to 6 s beside them, on a host at load
    // 15 on 8 cores). waitMs is waiting for Postgres, workMs is this process
    // working on the rows, tailMs is everything after the read, maxHoldMs is
    // the longest it went without letting anything else run, and cpuMs is
    // the CPU it was actually given: a build far longer than its cpuMs plus
    // waitMs was waiting for a core, not for us.
    const cpu = process.cpuUsage(cpuStart);
    logBuild(started, {
      count,
      owners: groups.size,
      waitMs: Math.round(read.waitMs),
      workMs: Math.round(read.workMs),
      tailMs: Date.now() - readDone,
      maxHoldMs: Math.round(read.maxHoldMs),
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    });
    return { owners, thin };
  });
}

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
type ReadTiming = { waitMs: number; workMs: number; maxHoldMs: number };

async function eachWorldBatch(
  onBatch: (rows: ClaimedHexRow[]) => void,
  timing?: ReadTiming,
): Promise<number> {
  let count = 0;
  let mark = performance.now();
  const query = pg<ClaimedHexRow[]>`
    select h.h3_id as h3, h.owner_address as owner, null::text as "ownerUsername"
    from hexes h`;
  for await (const batch of query.cursor(WORLD_BATCH)) {
    const got = performance.now();
    onBatch(batch);
    count += batch.length;
    if (timing) {
      const done = performance.now();
      timing.waitMs += got - mark;
      timing.workMs += done - got;
      if (done - got > timing.maxHoldMs) timing.maxHoldMs = done - got;
      mark = done;
    }
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
  if (shape === "owners") return worldScan().then((scan) => scan.owners);
  return worldShared.get(shape, async () => {
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
  return worldScan().then((scan) => scan.thin[res]);
}

/**
 * Fill the caches at startup, so the first player after a deploy is served
 * from memory instead of paying the 2.6 s build.
 *
 * One read of the table builds the grouped list and every thinned
 * resolution (see `worldScan`), so there is nothing to order or to choose.
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
  // One build fills the grouped list and every thinned one.
  try {
    await worldScan();
  } catch (e) {
    log.warn("world list warm incomplete", {
      ms: Date.now() - started,
      message: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  log.warn("world list warm", { ms: Date.now() - started });
}
