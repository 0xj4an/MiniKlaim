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
 * Format speed as `X.X km/h` from duration (ms) + distance (m). Universal unit
 * (matches speedometers) instead of runner-jargon pace (M:SS/km). Returns
 * `-- km/h` when the signal is too noisy: distance <50m, elapsed <1s, or the
 * computed speed falls outside a plausible human range (1-50 km/h; below is
 * stopped, above is GPS jitter).
 */
export function formatSpeed(durationMs: number, distanceMeters: number): string {
  if (distanceMeters < 50 || durationMs < 1000) return "-- km/h";
  const kmh = (distanceMeters / (durationMs / 1000)) * 3.6;
  if (!Number.isFinite(kmh) || kmh < 1 || kmh > 50) return "-- km/h";
  return `${kmh.toFixed(1)} km/h`;
}
