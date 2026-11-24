/**
 * Geoapify, the provider behind place search and routes.
 *
 * Chosen because its free plan allows a commercial app (with attribution) and
 * its data is OpenStreetMap, the same streets the basemap draws, so a route
 * lies on the roads the player sees. Everything provider-specific lives in
 * this file: swapping it for a self-hosted engine means rewriting these four
 * functions and nothing else.
 *
 * The request builders and the parsers are pure, so they are tested without
 * a key or a network.
 */

import type { LngLat, NavMode, NavPlace, NavRoute, NavStep } from "./types";

const BASE = "https://api.geoapify.com/v1";

/** How far from the player a destination may be and still be listed. */
export const SEARCH_RADIUS_METERS = 150_000;

/** Languages Geoapify writes turn instructions in; anything else gets English. */
const ROUTE_LANGS = new Set(["en", "es", "pt", "fr", "de", "it"]);

export function navLang(locale: string | null | undefined): string {
  const short = (locale ?? "").slice(0, 2).toLowerCase();
  return ROUTE_LANGS.has(short) ? short : "en";
}

export function searchUrl(input: {
  text: string;
  near?: { lat: number; lng: number } | null;
  lang: string;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    text: input.text,
    format: "json",
    limit: "5",
    lang: input.lang,
    apiKey: input.apiKey,
  });
  // A ranking hint: "Parque Lleras" should find the one nearest the player
  // first.
  if (input.near) {
    params.set("bias", `proximity:${input.near.lng},${input.near.lat}`);
    // And a wide fence. Without it a common word ("parque") filled the list
    // with places in other cities, hundreds of kilometres from the player.
    params.set(
      "filter",
      `circle:${input.near.lng},${input.near.lat},${SEARCH_RADIUS_METERS}`,
    );
  }
  return `${BASE}/geocode/autocomplete?${params}`;
}

export function routeUrl(input: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  mode: NavMode;
  lang: string;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    // Geoapify takes latitude first here, unlike everywhere else.
    waypoints: `${input.from.lat},${input.from.lng}|${input.to.lat},${input.to.lng}`,
    mode: input.mode,
    lang: input.lang,
    format: "geojson",
    apiKey: input.apiKey,
  });
  return `${BASE}/routing?${params}`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Two rows this close with the same name are one place listed twice. */
const SAME_PLACE_METERS = 300;

function roughMeters(a: NavPlace, b: NavPlace): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Autocomplete answer (format=json) -> the places worth showing.
 *
 * A named place (a park, a mall) carries its name in `name`, and for some of
 * them `address_line1` is only the city: "Parque Lleras" came back with
 * "Medellín" as its first line. So the name wins when there is one, and the
 * full address goes underneath.
 */
export function parsePlaces(body: unknown): NavPlace[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const places: NavPlace[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const lat = num(r.lat);
    const lng = num(r.lon);
    if (lat === null || lng === null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const name = str(r.name);
    const line1 = str(r.address_line1);
    const title = name || line1 || str(r.formatted);
    if (!title) continue;
    const detail =
      name && name !== line1 ? str(r.formatted) : str(r.address_line2);
    const place: NavPlace = {
      title,
      detail: detail === title ? "" : detail,
      lat,
      lng,
    };
    const twin = places.some(
      (seen) =>
        seen.title.toLowerCase() === title.toLowerCase() &&
        roughMeters(seen, place) < SAME_PLACE_METERS,
    );
    if (!twin) places.push(place);
  }
  return places;
}

/**
 * Routing answer (format=geojson) -> one line and its turn list.
 *
 * Geoapify returns a MultiLineString with one line per leg and step indexes
 * that count from the start of their own leg. A trip here has a single leg,
 * but the legs are joined and the indexes shifted anyway, so a provider
 * change that adds a stop does not silently point turns at the wrong corner.
 */
export function parseRoute(body: unknown): NavRoute | null {
  const feature = (body as { features?: unknown[] } | null)?.features?.[0] as
    | {
        geometry?: { type?: string; coordinates?: unknown };
        properties?: Record<string, unknown>;
      }
    | undefined;
  if (!feature?.geometry || !feature.properties) return null;

  const raw = feature.geometry.coordinates;
  const lines: unknown[] =
    feature.geometry.type === "LineString"
      ? [raw]
      : Array.isArray(raw)
        ? raw
        : [];

  const coords: LngLat[] = [];
  const legOffsets: number[] = [];
  for (const line of lines) {
    legOffsets.push(coords.length);
    if (!Array.isArray(line)) continue;
    for (const point of line) {
      if (!Array.isArray(point)) continue;
      const lng = num(point[0]);
      const lat = num(point[1]);
      if (lng === null || lat === null) continue;
      coords.push([lng, lat]);
    }
  }
  if (coords.length < 2) return null;

  const steps: NavStep[] = [];
  const legs = feature.properties.legs;
  if (Array.isArray(legs)) {
    legs.forEach((leg, legIndex) => {
      const legSteps = (leg as { steps?: unknown } | null)?.steps;
      if (!Array.isArray(legSteps)) return;
      const offset = legOffsets[legIndex] ?? 0;
      for (const step of legSteps) {
        if (!step || typeof step !== "object") continue;
        const s = step as Record<string, unknown>;
        const text = str(
          (s.instruction as { text?: unknown } | undefined)?.text,
        );
        const from = num(s.from_index);
        if (!text || from === null) continue;
        steps.push({
          text,
          at: Math.min(coords.length - 1, Math.max(0, offset + from)),
          distanceM: Math.max(0, num(s.distance) ?? 0),
        });
      }
    });
  }

  return {
    coords,
    distanceM: Math.max(0, num(feature.properties.distance) ?? 0),
    durationS: Math.max(0, num(feature.properties.time) ?? 0),
    steps,
  };
}
