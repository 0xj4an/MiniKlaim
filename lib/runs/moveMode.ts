export type MoveMode = "foot" | "bike" | "car" | "plane";

const LABEL_KEY = {
  foot: "run.move.foot",
  bike: "run.move.bike",
  car: "run.move.car",
  plane: "run.move.plane",
} as const;

export function moveModeLabelKey(mode: MoveMode) {
  return LABEL_KEY[mode];
}

// Session average, meters over the whole run, stops included.
// Under 30m or 20s there is nothing to call a trip.
// 100 km/h and up is a plane. 123 km/h lands here.
const MIN_METERS = 30;
const MIN_SECONDS = 20;

export function moveMode(
  distanceMeters: number,
  durationSec: number,
): MoveMode | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec)) return null;
  if (distanceMeters < MIN_METERS || durationSec < MIN_SECONDS) return null;
  const kmh = (distanceMeters / durationSec) * 3.6;
  if (kmh >= 100) return "plane";
  if (kmh >= 40) return "car";
  if (kmh >= 15) return "bike";
  return "foot";
}
