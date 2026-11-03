/**
 * How hard to ask the browser for a position, and what to do when it does
 * not arrive.
 *
 * The first fix asked for high accuracy with a 10 second timeout and gave up.
 * High accuracy means the GPS chip, which indoors, in a dense city, or on a
 * cheap phone can take far longer than that, while the network fix from cell
 * towers and wifi usually returns in under a second. On a timeout the run
 * screen set `geoStatus` to "timeout", and Start is enabled only on
 * "granted", so the player was locked out of the game entirely.
 *
 * A player sent a screenshot of exactly this: "GPS didn't arrive. You can't
 * play without it", Start greyed out, and behind the banner the map drawn
 * and centred on their own blocks. Over seven days 201 different people
 * tapped that banner's Try again button, 596 times.
 *
 * So a first fix that times out now falls back to a coarse one before
 * refusing. A coarse fix is good enough to begin: the capture grid is about
 * 10 m across, the watch that follows sharpens within seconds, and a block
 * is only credited once a fix is actually inside it. Starting a few hundred
 * metres vague beats not starting.
 */

/** GPS first: the accurate fix, when the chip can produce one in time. */
export const FINE_FIX: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 60_000,
  timeout: 10_000,
};

/**
 * Towers and wifi. A longer timeout because this is the last attempt, and a
 * five minute `maximumAge` because a fix the browser already has is worth
 * more than another wait.
 */
export const COARSE_FIX: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 300_000,
  timeout: 20_000,
};

/** The codes the Geolocation API defines, named. */
export const GEO_CODE = {
  permissionDenied: 1,
  positionUnavailable: 2,
  timeout: 3,
} as const;

/**
 * The options for the next attempt, or null to stop asking.
 *
 * A denial is final: the browser will not prompt again and retrying only
 * spins. A timeout or an unavailable position is worth one coarse attempt,
 * because both can mean the GPS chip specifically, with the network provider
 * still able to answer.
 */
export function nextFixAttempt(
  code: number,
  previous: PositionOptions,
): PositionOptions | null {
  if (code === GEO_CODE.permissionDenied) return null;
  // Already coarse: there is nothing weaker left to try.
  if (!previous.enableHighAccuracy) return null;
  if (code === GEO_CODE.timeout || code === GEO_CODE.positionUnavailable) {
    return COARSE_FIX;
  }
  return null;
}
