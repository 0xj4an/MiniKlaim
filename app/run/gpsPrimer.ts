import type { GeoStatus } from "./GeoStatusBanner";
import { readCachedPosition } from "./positionCache";

/**
 * Set once the player has been through the location explainer (or this
 * device has already produced a GPS fix). From then on /run asks for
 * location straight away, as before.
 */
const GPS_ASKED_KEY = "miniklaim.gpsAsked";

/**
 * True when this device has never shown the explainer and never got a fix.
 * First-time players then read why location is needed before the browser
 * prompt appears: 729 people denied it cold, and a denial in MiniPay can only
 * be undone from the phone settings.
 */
export function shouldExplainGps(): boolean {
  if (typeof window === "undefined") return false;
  if (readCachedPosition()) return false;
  try {
    return window.localStorage.getItem(GPS_ASKED_KEY) === null;
  } catch {
    // Storage blocked: explaining every visit beats a cold prompt.
    return true;
  }
}

export function markGpsAsked(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GPS_ASKED_KEY, "1");
  } catch {
    // Private mode: the explainer shows again next visit.
  }
}

/** Geolocation error codes, named (the constants live on the error object). */
export const GEO_ERROR = {
  permissionDenied: 1,
  positionUnavailable: 2,
  timeout: 3,
} as const;

/**
 * The banner state a geolocation failure should leave behind.
 *
 * `firstFix` is false once the run has had a position: from then on the watch
 * recovers from POSITION_UNAVAILABLE and TIMEOUT on its own, so the UI keeps
 * whatever it was showing (null) instead of flashing an error.
 *
 * Before this existed, POSITION_UNAVAILABLE was unhandled and the page stayed
 * on "requesting": no banner, no retry button, no event, and no way to start a
 * run. That is what a phone reports when location is off at the OS level, and
 * it reached support on 26 Oct ("Can't start a run", nothing after the player
 * allowed the prompt).
 */
export function geoStatusForError(
  code: number,
  firstFix: boolean,
): GeoStatus | null {
  if (code === GEO_ERROR.permissionDenied) return "denied";
  if (!firstFix) return null;
  if (code === GEO_ERROR.timeout) return "timeout";
  if (code === GEO_ERROR.positionUnavailable) return "unavailable";
  return null;
}
