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
 * Format the overall average speed for a finished run as `X.X km/h`. Uses
 * total distance / total duration, so it's the honest lifetime pace of the
 * session. No upper cap: bikes, cars, planes, all valid modes now.
 * Returns `-- km/h` only when the signal is objectively invalid (no distance
 * yet, or non-finite math).
 */
export function formatSpeed(durationMs: number, distanceMeters: number): string {
  if (distanceMeters <= 0 || durationMs < 500) return "-- km/h";
  const kmh = (distanceMeters / (durationMs / 1000)) * 3.6;
  if (!Number.isFinite(kmh) || kmh < 0) return "-- km/h";
  return `${formatKmh(kmh)} km/h`;
}

/**
 * Rolling-window speed. Takes an ordered buffer of `{ts, cumulativeMeters}`
 * samples and computes the km/h across the samples that fall inside the last
 * `windowMs` milliseconds. This is what the live banner should show — closer
 * to a car speedometer than to session average. A stopped runner drops toward
 * 0 quickly; a plane sitting at cruise reads cruise, not the ramp-up from
 * takeoff.
 *
 * Returns `-- km/h` while we don't yet have enough recent samples.
 */
export function formatRollingSpeed(
  samples: Array<{ ts: number; cumulativeMeters: number }>,
  windowMs = 30_000,
): string {
  if (samples.length < 2) return "-- km/h";
  const now = samples[samples.length - 1].ts;
  const cutoff = now - windowMs;
  let baseline = samples[0];
  for (const s of samples) {
    if (s.ts >= cutoff) {
      baseline = s;
      break;
    }
    baseline = s;
  }
  const elapsedMs = now - baseline.ts;
  const distance = samples[samples.length - 1].cumulativeMeters - baseline.cumulativeMeters;
  if (elapsedMs < 1000 || distance < 0) return "-- km/h";
  const kmh = (distance / (elapsedMs / 1000)) * 3.6;
  if (!Number.isFinite(kmh) || kmh < 0) return "-- km/h";
  return `${formatKmh(kmh)} km/h`;
}

/**
 * Trim old samples out of a rolling buffer while returning a new appended
 * copy. Callers keep the buffer in a ref and swap it on each new GPS fix.
 * `retainMs` is generous (2x the display window) so we never accidentally
 * drop a sample the display still needs.
 */
export function appendSpeedSample(
  samples: Array<{ ts: number; cumulativeMeters: number }>,
  ts: number,
  cumulativeMeters: number,
  retainMs = 60_000,
): Array<{ ts: number; cumulativeMeters: number }> {
  const cutoff = ts - retainMs;
  const kept = samples.filter((s) => s.ts >= cutoff);
  kept.push({ ts, cumulativeMeters });
  return kept;
}

function formatKmh(kmh: number): string {
  return kmh >= 100 ? kmh.toFixed(0) : kmh.toFixed(1);
}
