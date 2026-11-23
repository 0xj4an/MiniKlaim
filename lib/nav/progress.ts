/**
 * Where the player is along a route.
 *
 * Pure geometry, run on every position the phone reports: which piece of the
 * line is closest, how far off it they are, how much is left and which turn
 * comes next. No map and no network, so it is tested with plain numbers.
 */

import { haversineMeters } from "@/lib/map/geo";
import type { LngLat, NavRoute, NavStep } from "./types";

/** Closer than this to the end of the line counts as having arrived. */
export const ARRIVE_METERS = 30;
/** Farther than this from the line means the player took another street. */
export const OFF_ROUTE_METERS = 60;

export type NavProgress = {
  /** Metres from the player to the nearest point of the line. */
  offRouteM: number;
  /** Metres left along the line. */
  remainingM: number;
  /** The manoeuvre ahead, or null once the last one is behind. */
  nextStep: NavStep | null;
  /** Metres along the line to that manoeuvre. */
  toNextStepM: number;
  arrived: boolean;
};

/** Cumulative metres from the start of the line to each of its points. */
export function cumulativeMeters(coords: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    out.push(out[i - 1] + haversineMeters(lat1, lng1, lat2, lng2));
  }
  return out;
}

/**
 * Nearest point on one segment, on a flat patch around the player. Street
 * segments are tens of metres long, where a flat patch is exact enough and
 * far cheaper than spherical maths on every fix.
 */
function projectOnSegment(
  lat: number,
  lng: number,
  a: LngLat,
  b: LngLat,
): { distanceM: number; fraction: number } {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ax = (a[0] - lng) * mPerDegLng;
  const ay = (a[1] - lat) * mPerDegLat;
  const bx = (b[0] - lng) * mPerDegLng;
  const by = (b[1] - lat) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const fraction =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
  const px = ax + dx * fraction;
  const py = ay + dy * fraction;
  return { distanceM: Math.hypot(px, py), fraction };
}

export function navProgress(
  route: NavRoute,
  cumulative: number[],
  position: { lat: number; lng: number },
): NavProgress {
  const { coords, steps } = route;
  let best = { distanceM: Infinity, segment: 0, fraction: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const hit = projectOnSegment(
      position.lat,
      position.lng,
      coords[i],
      coords[i + 1],
    );
    if (hit.distanceM < best.distanceM) {
      best = { distanceM: hit.distanceM, segment: i, fraction: hit.fraction };
    }
  }

  const total = cumulative[cumulative.length - 1] ?? 0;
  const segmentLength =
    (cumulative[best.segment + 1] ?? 0) - (cumulative[best.segment] ?? 0);
  const travelled =
    (cumulative[best.segment] ?? 0) + segmentLength * best.fraction;
  const remainingM = Math.max(0, total - travelled);

  // The next manoeuvre is the first one that starts ahead of the player.
  // The first step ("head north") starts at index 0 and is never "next".
  let nextStep: NavStep | null = null;
  let toNextStepM = remainingM;
  for (const step of steps) {
    const at = cumulative[step.at] ?? 0;
    if (step.at > 0 && at > travelled + 1) {
      nextStep = step;
      toNextStepM = at - travelled;
      break;
    }
  }

  const [endLng, endLat] = coords[coords.length - 1];
  const toEnd = haversineMeters(position.lat, position.lng, endLat, endLng);

  return {
    offRouteM: best.distanceM,
    remainingM,
    nextStep,
    toNextStepM,
    arrived: toEnd <= ARRIVE_METERS,
  };
}

/** "350 m" under a kilometre, "2.4 km" above. Rounded so it does not flicker. */
export function formatNavDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Whole minutes, never "0 min" for a trip that has not ended. */
export function formatNavMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}
