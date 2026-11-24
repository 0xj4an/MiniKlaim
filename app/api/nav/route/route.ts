import { NextResponse } from "next/server";
import { haversineMeters } from "@/lib/map/geo";
import { navLang, parseRoute, routeUrl } from "@/lib/nav/geoapify";
import {
  navApiKey,
  navError,
  navUpstream,
  parseLatLng,
} from "@/lib/nav/server";
import { isNavMode } from "@/lib/nav/types";

export const dynamic = "force-dynamic";

/**
 * The route from where the player is to the place they picked.
 *
 * Not cached: the start is the player's own position and no two are alike.
 */

/** Farther than this is a trip, not a run; it would also be a huge line to draw. */
const MAX_STRAIGHT_KM = 300;

export async function GET(request: Request) {
  const key = navApiKey();
  if (!key) return navError("nav_unavailable", 503);

  const params = new URL(request.url).searchParams;
  const from = parseLatLng(params.get("from"));
  const to = parseLatLng(params.get("to"));
  const mode = params.get("mode");
  if (!from || !to || !isNavMode(mode)) return navError("nav_bad_query", 400);

  const straightKm = haversineMeters(from.lat, from.lng, to.lat, to.lng) / 1000;
  if (straightKm > MAX_STRAIGHT_KM) return navError("nav_too_far", 422);

  const got = await navUpstream(
    request,
    routeUrl({
      from,
      to,
      mode,
      lang: navLang(params.get("lang")),
      apiKey: key,
    }),
    "route",
  );
  if ("response" in got) return got.response;

  const route = parseRoute(got.body);
  if (!route) return navError("nav_no_route", 422);
  return NextResponse.json(
    { route },
    { headers: { "Cache-Control": "no-store" } },
  );
}
