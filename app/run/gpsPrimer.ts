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
