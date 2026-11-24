/**
 * Shapes shared by the navigation API routes and the run screen.
 *
 * Navigation is an optional extra on a run: the player picks a place, the
 * route is drawn on the same map and the blocks are captured exactly as on
 * any other run. Nothing here knows about hexes.
 */

export type LngLat = [lng: number, lat: number];

export type NavPlace = {
  /** What the player reads first: a name, or the street and number. */
  title: string;
  /** The rest of the address, when there is one. */
  detail: string;
  lat: number;
  lng: number;
};

export type NavStep = {
  /** Sentence in the player's language ("Turn right onto Carrera 43A"). */
  text: string;
  /** Index into `coords` where this manoeuvre happens. */
  at: number;
  /** Metres covered by this step. */
  distanceM: number;
};

export type NavRoute = {
  coords: LngLat[];
  distanceM: number;
  durationS: number;
  steps: NavStep[];
};

/** How the player moves, as far as a road router is concerned. */
export type NavMode = "walk" | "bicycle" | "drive";

export function isNavMode(value: unknown): value is NavMode {
  return value === "walk" || value === "bicycle" || value === "drive";
}
