import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  isUsableStyle,
  UPSTREAM_STYLE_URL,
  type BasemapStyle,
} from "@/lib/map/basemapStyle";

const log = createLogger("api:map:style");

/**
 * The basemap style, served from our origin instead of the phone asking a
 * free third-party host directly. See lib/map/basemapStyle for why.
 *
 * What this buys, in order of how much it matters:
 *
 *   1. The last good copy survives an upstream outage. One server fetch
 *      serves every player, so when openfreemap is down the players who
 *      arrive during the outage still get a map.
 *   2. One origin on the critical path instead of two. The phone has already
 *      resolved and shaken hands with us; the style no longer costs a fresh
 *      DNS lookup and TLS handshake on a weak connection.
 *   3. A failure we can see. An upstream fetch that fails now logs on our
 *      side, where previously it was invisible: the request happened on the
 *      player's phone and we only ever saw the map not appearing.
 *
 * The tiles themselves still come from upstream, on their own host and off
 * the critical path: a tile that fails loses a square of streets, which is
 * the degradation this is all in aid of. It is the style that was fatal.
 */

const TTL_MS = 6 * 60 * 60 * 1000; // The style is a design asset; it changes rarely.
const UPSTREAM_TIMEOUT_MS = 4_000;

/**
 * An hour in the phone's own cache, a day of stale-while-revalidate on any
 * edge in between. A repeat visitor spends no request on the style at all,
 * which is the cheapest the critical path gets.
 */
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";

type Cached = { style: BasemapStyle; etag: string; fetchedAt: number };

let cached: Cached | null = null;
let inFlight: Promise<Cached | null> | null = null;

function etagFor(style: BasemapStyle): string {
  // Length plus layer count is enough to change when the style changes and
  // cheap enough to compute on every miss. The point of the ETag is 304s on
  // repeat visits, not content addressing.
  const body = JSON.stringify(style);
  return `W/"ofm-${body.length}-${style.layers.length}"`;
}

async function fetchUpstream(): Promise<Cached | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM_STYLE_URL, {
      signal: controller.signal,
      // Next would otherwise cache this in its own data cache, which would
      // hide upstream failures behind a second layer we do not control.
      cache: "no-store",
    });
    if (!res.ok) {
      log.warn("basemap style upstream not ok", { status: res.status });
      return null;
    }
    const json: unknown = await res.json();
    if (!isUsableStyle(json)) {
      log.warn("basemap style upstream unusable");
      return null;
    }
    return { style: json, etag: etagFor(json), fetchedAt: Date.now() };
  } catch (e) {
    log.warn("basemap style upstream failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One upstream fetch at a time, however many players arrive together. */
async function load(): Promise<Cached | null> {
  const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
  if (fresh) return cached;

  if (!inFlight) {
    inFlight = fetchUpstream().finally(() => {
      inFlight = null;
    });
  }
  const got = await inFlight;
  if (got) {
    cached = got;
    return got;
  }
  // Upstream is unreachable and we have a stale copy: serve it. A style from
  // six hours ago is a working map; a 503 is a white screen.
  return cached;
}

export async function GET(request: Request) {
  const entry = await load();

  if (!entry) {
    // Nothing upstream and nothing cached, which is only the case for the
    // first players after a deploy during an upstream outage. 503 rather than
    // a bare fallback body, because the client already knows how to build a
    // map with no basemap and does not need one invented here.
    return NextResponse.json(
      { error: "basemap style unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (request.headers.get("if-none-match") === entry.etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: entry.etag, "Cache-Control": CACHE },
    });
  }

  return NextResponse.json(entry.style, {
    headers: { ETag: entry.etag, "Cache-Control": CACHE },
  });
}
