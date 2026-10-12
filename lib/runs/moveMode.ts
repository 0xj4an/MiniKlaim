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
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec))
    return null;
  if (distanceMeters < MIN_METERS || durationSec < MIN_SECONDS) return null;
  const kmh = (distanceMeters / durationSec) * 3.6;
  if (kmh >= 100) return "plane";
  if (kmh >= 40) return "car";
  if (kmh >= 15) return "bike";
  return "foot";
}

const ICON: Record<MoveMode, string> = {
  foot: "🚶",
  bike: "🚲",
  car: "🚗",
  plane: "✈️",
};

export function moveModeIcon(mode: MoveMode): string {
  return ICON[mode];
}

/** Stored mode when the run has one, else computed from its totals. */
export function runMoveMode(run: {
  moveMode?: string | null;
  distanceMeters: number;
  startedAt: string | Date;
  endedAt: string | Date | null;
}): MoveMode | null {
  if (run.moveMode && run.moveMode in ICON) return run.moveMode as MoveMode;
  if (!run.endedAt) return null;
  const sec =
    (new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) /
    1000;
  return moveMode(run.distanceMeters, sec);
}
