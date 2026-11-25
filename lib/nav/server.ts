/**
 * What the navigation API routes share: the key, who is asking, and one
 * guarded request to the provider.
 *
 * The key never reaches the phone. The phone asks our own origin, the same
 * way it asks for the basemap style (lib/map/basemapStyle), which also lets
 * the day's budget be counted in one place.
 */

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { spendNavCredit } from "./budget";

const log = createLogger("api:nav");

const UPSTREAM_TIMEOUT_MS = 8_000;
const NO_STORE = { "Cache-Control": "no-store" };

export function navApiKey(): string | null {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  return key ? key : null;
}

/** Enough to tell one phone from another for a per-minute limit. */
export function navClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * What a refusal from the provider means to the player.
 *
 * 400, 404 and 422 are the provider saying this request has no answer (a
 * walk of 160 km, a point in the sea): that is "no route", which the screen
 * already knows how to say. Everything else (its 5xx, a rejected key, its
 * own rate limit) is a failure on the way and stays a 502. Both used to be
 * a 502, so a route nobody could draw read as our server being down
 * (25 Nov 2026).
 */
export function upstreamRefusal(status: number) {
  return status === 400 || status === 404 || status === 422
    ? navError("nav_no_route", 422)
    : navError("nav_upstream_failed", 502);
}

export function navError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE });
}

/** "lat,lng" -> a point, or null for anything that is not one. */
export function parseLatLng(
  value: string | null,
): { lat: number; lng: number } | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * One provider request, counted against the day's budget first.
 * Returns the parsed body, or the response to send back when there is none.
 */
export async function navUpstream(
  request: Request,
  url: string,
  what: string,
): Promise<{ body: unknown } | { response: NextResponse }> {
  const budget = spendNavCredit(navClientKey(request));
  if (budget === "day_spent") {
    log.warn("nav daily budget spent", { what });
    return { response: navError("nav_unavailable", 503) };
  }
  if (budget === "client_limited") {
    return { response: navError("nav_rate_limited", 429) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // The URL carries the key, so only the status is logged.
      log.warn("nav upstream not ok", { what, status: res.status });
      return {
        response:
          what === "route"
            ? upstreamRefusal(res.status)
            : navError("nav_upstream_failed", 502),
      };
    }
    return { body: (await res.json()) as unknown };
  } catch (e) {
    log.warn("nav upstream failed", {
      what,
      message: e instanceof Error ? e.name : "unknown",
    });
    return { response: navError("nav_upstream_failed", 502) };
  } finally {
    clearTimeout(timer);
  }
}
