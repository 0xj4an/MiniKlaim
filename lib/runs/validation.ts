/**
 * Server-side sanity checks for hex captures. The previous version enforced
 * a strict "human runner" speed envelope (rate limit per minute, min interval
 * between hexes, max avg speed at finish) which unintentionally blocked fast
 * runners, cyclists, cars, and planes. This is a casual game where any mode
 * of movement counts, so those anti-cheat guards are gone.
 *
 * What survives is UX + bug protection:
 *  - Accuracy filter: bad GPS captures the wrong hex and confuses the player.
 *  - Segment distance canary: catches NaN / integer-overflow / GPS teleport
 *    bugs, not cheaters.
 */

/** Reject GPS samples worse than this (meters). Typical urban GPS is 5-20m. */
export const ACCURACY_MAX_METERS = 30;

/** Segment sanity cap (meters). A single hex claim declaring more than this
 *  as its distance-since-last is almost certainly a GPS glitch or client bug.
 *  A commercial plane at 900 km/h moves 750m per 3-sec GPS ping — this cap
 *  is way above that. Anything higher and we assume bad data. */
export const DISTANCE_MAX_PER_CAPTURE = 10000;

export type ClaimValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "accuracy-too-poor" | "distance-implausible";
      detail?: string;
    };

/**
 * Validate a single hex capture request. Runs per-hex when the client batches
 * multiple hexes in one POST so we can accept the good ones and drop bad
 * samples individually.
 */
export function validateClaim(params: {
  distanceMeters: number;
  accuracy?: number | null;
}): ClaimValidationResult {
  const { distanceMeters, accuracy } = params;

  if (
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy > ACCURACY_MAX_METERS
  ) {
    return {
      ok: false,
      reason: "accuracy-too-poor",
      detail: `accuracy ${accuracy}m > ${ACCURACY_MAX_METERS}m`,
    };
  }

  if (distanceMeters > DISTANCE_MAX_PER_CAPTURE) {
    return {
      ok: false,
      reason: "distance-implausible",
      detail: `distance ${distanceMeters}m > ${DISTANCE_MAX_PER_CAPTURE}m for one hex`,
    };
  }

  return { ok: true };
}
