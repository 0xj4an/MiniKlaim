import { NextResponse } from "next/server";
import { navLang, parsePlaces, searchUrl } from "@/lib/nav/geoapify";
import {
  navApiKey,
  navError,
  navUpstream,
  parseLatLng,
} from "@/lib/nav/server";
import type { NavPlace } from "@/lib/nav/types";

export const dynamic = "force-dynamic";

/**
 * Place search for a run's destination.
 *
 * Every provider request costs one credit of a small daily budget, so the
 * same question is answered from memory for a while: two players looking for
 * the same mall in the same city spend one credit between them.
 */

const MIN_CHARS = 3;
const MAX_CHARS = 80;
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { places: NavPlace[]; at: number }>();

export async function GET(request: Request) {
  const key = navApiKey();
  if (!key) return navError("nav_unavailable", 503);

  const params = new URL(request.url).searchParams;
  const text = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (text.length < MIN_CHARS || text.length > MAX_CHARS) {
    return navError("nav_bad_query", 400);
  }
  const near = parseLatLng(params.get("near"));
  const lang = navLang(params.get("lang"));

  // About 1 km: close enough that the ranking is the same, coarse enough
  // that neighbours share an entry.
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : "-";
  const cacheKey = `${lang}|${nearKey}|${text.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(
      { places: hit.places },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const got = await navUpstream(
    request,
    searchUrl({ text, near, lang, apiKey: key }),
    "search",
  );
  if ("response" in got) return got.response;

  const places = parsePlaces(got.body);
  cache.set(cacheKey, { places, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return NextResponse.json(
    { places },
    { headers: { "Cache-Control": "no-store" } },
  );
}
