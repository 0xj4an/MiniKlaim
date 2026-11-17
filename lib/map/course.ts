import { haversineMeters } from "@/lib/map/geo";

export type LatLng = { lat: number; lng: number };

/** Which way is up on the run map. */
export type MapOrientation = "north" | "heading";

const ORIENTATION_KEY = "run_map_orientation";

export function readOrientation(): MapOrientation {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === "heading"
      ? "heading"
      : "north";
  } catch {
    return "north";
  }
}

export function writeOrientation(mode: MapOrientation): void {
  try {
    localStorage.setItem(ORIENTATION_KEY, mode);
  } catch {
    // Private mode or a full disk: the choice lasts for this visit only.
  }
}

/** Compass bearing from one point to another, 0 to 360, 0 being north. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const rad = Math.PI / 180;
  const phi1 = from.lat * rad;
  const phi2 = to.lat * rad;
  const dLng = (to.lng - from.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return ((Math.atan2(y, x) / rad) % 360 + 360) % 360;
}

/**
 * How far the player has to move before the map believes a new direction.
 * A fix wanders a few metres while standing still, and a bearing taken
 * between two of those spins the map on the spot.
 */
export const COURSE_MIN_MOVE_M = 12;

/** The speed, in m/s, above which the phone's own heading is trusted. */
const HEADING_MIN_SPEED = 1;

export type CourseState = {
  /** Where the last direction was measured from. */
  anchor: LatLng | null;
  /** Direction of travel, 0 to 360, or null before the player has moved. */
  course: number | null;
};

/**
 * The direction of travel after one more fix.
 *
 * The phone's own heading is used when it reports one at walking speed or
 * above. Many Android webviews never do, so the fallback is the bearing
 * between fixes, taken only once the player is clear of GPS wander.
 */
export function nextCourse(
  state: CourseState,
  fix: LatLng & { heading?: number | null; speed?: number | null },
): CourseState {
  const { heading, speed } = fix;
  const here = { lat: fix.lat, lng: fix.lng };
  if (
    typeof heading === "number" &&
    Number.isFinite(heading) &&
    typeof speed === "number" &&
    speed >= HEADING_MIN_SPEED
  ) {
    return { anchor: here, course: ((heading % 360) + 360) % 360 };
  }
  if (!state.anchor) return { anchor: here, course: state.course };
  const moved = haversineMeters(
    state.anchor.lat,
    state.anchor.lng,
    here.lat,
    here.lng,
  );
  if (moved < COURSE_MIN_MOVE_M) return state;
  return { anchor: here, course: bearingDegrees(state.anchor, here) };
}
