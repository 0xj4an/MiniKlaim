/**
 * localStorage-backed cache of the player's last known lat/lng. Used to
 * center the map before the first geolocation fix arrives so the initial
 * paint doesn't jump from a world-view to the player's actual location.
 */

const POS_CACHE_KEY = "miniklaim.lastPos";

export function readCachedPosition(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number };
    if (
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return parsed;
    }
  } catch {
    // corrupted cache; ignore
  }
  return null;
}

export function writeCachedPosition(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_CACHE_KEY, JSON.stringify({ lat, lng }));
  } catch {
    // quota exceeded or storage disabled; ignore
  }
}
