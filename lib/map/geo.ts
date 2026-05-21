/**
 * Great-circle distance between two lat/lng points in meters.
 * Haversine formula. Sufficient accuracy for run distances (<100km).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Format a running pace as `M:SS/km` from duration (ms) + distance (m).
 * Returns `--/km` when distance is below 50m (signal-to-noise too low for
 * a meaningful pace; jitter would dominate).
 */
export function formatPace(durationMs: number, distanceMeters: number): string {
  if (distanceMeters < 50) return "--/km";
  const secondsPerKm = (durationMs / 1000 / distanceMeters) * 1000;
  // Pace above 30 min/km is walking-or-stopped territory; clamp display.
  if (!Number.isFinite(secondsPerKm) || secondsPerKm > 30 * 60) return "--/km";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
