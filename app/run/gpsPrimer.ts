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

/**
 * What the browser already decided about location, without asking. The
 * explainer exists to prepare a player for the prompt, so it is only worth
 * showing to someone who will actually see one.
 *
 * - `granted`: MiniPay cleared our flag but not the permission; explaining
 *   again is noise.
 * - `denied`: there is no prompt left to prepare for. The explainer's button
 *   calls geolocation, the browser refuses silently, and the player is stuck
 *   on a screen that looks like it should work. Going straight to the banner
 *   tells them to fix it in the phone's settings, which is the only way back.
 *
 * Not every WebView implements this, and some throw on the descriptor rather
 * than rejecting, so anything unexpected reads as "unknown" and the old
 * behaviour stands.
 */
export type GeoPermission = "granted" | "denied" | "prompt" | "unknown";

type PermissionsLike = {
  query: (d: { name: "geolocation" }) => Promise<{ state: string }>;
};

export async function readGeolocationPermission(
  permissions?: PermissionsLike | null,
): Promise<GeoPermission> {
  const api =
    permissions ??
    (typeof navigator !== "undefined"
      ? (navigator as unknown as { permissions?: PermissionsLike }).permissions
      : null);
  if (!api || typeof api.query !== "function") return "unknown";
  try {
    const { state } = await api.query({ name: "geolocation" });
    return state === "granted" || state === "denied" || state === "prompt"
      ? state
      : "unknown";
  } catch {
    return "unknown";
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
