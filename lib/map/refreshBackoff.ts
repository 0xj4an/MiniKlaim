/**
 * How long the run map stops asking for blocks after the server refuses.
 *
 * It did not stop at all. A 429 only paused the refresh a pan triggers, and
 * the one after each saved batch kept going, every 2.5 s, each answer another
 * 429 that kept the limit closed: 71 refusals in one minute for one player on
 * 16 Nov 2026, 29 for another on 14 Nov. The limit is per IP, and a phone
 * carrier puts many players behind one, so two phones in one car closed it
 * for each other for a quarter of an hour.
 *
 * The server says how long to wait in Retry-After. That is used when it is
 * there, kept between 5 s and 60 s so a missing or absurd header cannot stop
 * the map for good. A status that is not about load returns null: the next
 * refresh may try again.
 */
export const BACKOFF_DEFAULT_S = 20;
const BACKOFF_MIN_S = 5;
const BACKOFF_MAX_S = 60;

export function backoffSeconds(
  status: number,
  retryAfter: string | null,
): number | null {
  // 429 is the rate limit. 502, 503 and 504 are the server restarting or
  // out of room, and asking again at once is what keeps it there.
  if (status !== 429 && status !== 502 && status !== 503 && status !== 504) {
    return null;
  }
  const asked = retryAfter === null ? NaN : Number(retryAfter.trim());
  if (!Number.isFinite(asked) || asked <= 0) return BACKOFF_DEFAULT_S;
  return Math.min(BACKOFF_MAX_S, Math.max(BACKOFF_MIN_S, Math.ceil(asked)));
}

/**
 * How often the refresh after a saved batch may go to the server.
 *
 * The answer to a claim already says, block by block, who owns it now, and
 * the map is patched from it. The download only adds what other players did
 * nearby, which does not need to be 24 requests a minute.
 */
export const CLAIMED_REFRESH_MIN_MS = 10_000;

/**
 * What the map did during a run, sent with `run_finished`.
 *
 * A player reported that zoomed out the blocks did not load, and there was
 * nothing to look at afterwards: no event said how far out they went, whether
 * dots were drawn, or whether a refresh failed. These are counts, so one
 * event per run answers it.
 */
export type MapRunStats = {
  minZoom: number | null;
  maxZoom: number | null;
  /** Paints made as dots (zoomed out). */
  dotPaints: number;
  /** Requests for blocks that reached the server. */
  refreshes: number;
  refreshErrors: number;
  backoffs: number;
  /** Refreshes answered from the phone because the server asked to wait. */
  skipped: number;
  /** Times the player dragged the map away from themselves. */
  followBreaks: number;
  /** Times the camera turned to a new direction of travel. */
  turns: number;
  /** The slowest paint, in ms. */
  slowestPaintMs: number;
};

export function newMapRunStats(): MapRunStats {
  return {
    minZoom: null,
    maxZoom: null,
    dotPaints: 0,
    refreshes: 0,
    refreshErrors: 0,
    backoffs: 0,
    skipped: 0,
    followBreaks: 0,
    turns: 0,
    slowestPaintMs: 0,
  };
}

export function noteZoom(stats: MapRunStats, zoom: number): void {
  if (!Number.isFinite(zoom)) return;
  if (stats.minZoom === null || zoom < stats.minZoom) stats.minZoom = zoom;
  if (stats.maxZoom === null || zoom > stats.maxZoom) stats.maxZoom = zoom;
}

/** The stats as event properties: rounded, and without the empty zooms. */
export function mapRunProps(stats: MapRunStats): {
  map_min_zoom?: number;
  map_max_zoom?: number;
  map_dot_paints: number;
  map_refreshes: number;
  map_refresh_errors: number;
  map_backoffs: number;
  map_refreshes_skipped: number;
  map_follow_breaks: number;
  map_turns: number;
  map_slowest_paint_ms: number;
} {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...(stats.minZoom !== null ? { map_min_zoom: round1(stats.minZoom) } : {}),
    ...(stats.maxZoom !== null ? { map_max_zoom: round1(stats.maxZoom) } : {}),
    map_dot_paints: stats.dotPaints,
    map_refreshes: stats.refreshes,
    map_refresh_errors: stats.refreshErrors,
    map_backoffs: stats.backoffs,
    map_refreshes_skipped: stats.skipped,
    map_follow_breaks: stats.followBreaks,
    map_turns: stats.turns,
    map_slowest_paint_ms: Math.round(stats.slowestPaintMs),
  };
}
