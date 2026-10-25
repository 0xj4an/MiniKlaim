export const MOVE_MODES = [
  "foot",
  "bike",
  "moto",
  "car",
  "bus",
  "train",
  "plane",
  "boat",
  "horse",
] as const;

export type MoveMode = (typeof MOVE_MODES)[number];

export function isMoveMode(value: unknown): value is MoveMode {
  return typeof value === "string" && (MOVE_MODES as readonly string[]).includes(value);
}

const LABEL_KEY = {
  foot: "run.move.foot",
  bike: "run.move.bike",
  moto: "run.move.moto",
  car: "run.move.car",
  bus: "run.move.bus",
  train: "run.move.train",
  plane: "run.move.plane",
  horse: "run.move.horse",
  boat: "run.move.boat",
} as const;

export function moveModeLabelKey(mode: MoveMode) {
  return LABEL_KEY[mode];
}

// Session average, meters over the whole run, stops included.
// Under 30m or 20s there is nothing to call a trip.
// Over road speed (130 km/h) is a train; 300 km/h and up is a plane.
// Labels only: fast travel is allowed, and watched (see the finish route).
const MIN_METERS = 30;
const MIN_SECONDS = 20;

export function moveMode(
  distanceMeters: number,
  durationSec: number,
): MoveMode | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSec))
    return null;
  if (distanceMeters < MIN_METERS || durationSec < MIN_SECONDS) return null;
  return modeForKmh((distanceMeters / durationSec) * 3.6);
}

/** The label a speed alone implies, with the thresholds above. */
export function modeForKmh(kmh: number): MoveMode {
  if (kmh >= 300) return "plane";
  if (kmh >= 130) return "train";
  if (kmh >= 40) return "car";
  if (kmh >= 15) return "bike";
  return "foot";
}

/**
 * Sustained speed (a 30 s or longer window) no bike or runner holds. A car
 * in city traffic averages bike speed with its stops, but it does reach this
 * between lights (20 Oct: a 7-minute drive averaged 14.7 km/h).
 */
export const MOTOR_SUSTAINED_KMH = 45;

/**
 * Fastest believable sustained speed (30 s or longer window) for each
 * declared mode, km/h. Realistic, not legal: what the vehicle does on a good
 * day on the roads where MiniKlaim is played, with room on top.
 *
 * - foot 25: elite marathon pace is ~21; see FOOT_MAX_SUSTAINED_KMH.
 * - bike 60: a long descent; nobody pedals 60 on the flat for 30 s.
 * - horse 70: a racehorse gallop.
 * - bus 140: intercity coaches on a toll road.
 * - moto, car 160: a fast driver on an empty expressway (Lagos-Ibadan,
 *   Jakarta toll roads, Ruta del Sol, Swedish motorways). Legal limits in the
 *   player countries are 80-120. Of 265 motor runs to 25 Oct, 5 went past
 *   160 sustained (259-324 km/h) and every one was a GPS jump; no real drive
 *   averaged more than 123 over a whole run.
 * - boat 120: a speedboat.
 * - train 250: a fast train; above that is a plane (CAPTURE_MAX_KMH).
 *
 * Above its ceiling a run keeps moving but its blocks are not captured
 * (claim route, tooFastForMode), and at finish it is relabelled by speed
 * (finalMoveMode). A run with no pick gets the car ceiling.
 */
export const DECLARED_MAX_KMH: Record<MoveMode, number> = {
  foot: 25,
  horse: 70,
  bike: 60,
  moto: 160,
  car: 160,
  bus: 140,
  boat: 120,
  train: 250,
  plane: Number.POSITIVE_INFINITY,
};

/** Ceiling applied while capturing when the player picked nothing. */
export const UNDECLARED_MAX_KMH = DECLARED_MAX_KMH.car;

/**
 * Sustained speed (a 30 s or longer window, along the server hex path) no
 * walker or runner holds. An elite marathon pace is about 21 km/h, and the
 * hex path reads a little longer than the real walk. Over 14 days of runs
 * declared on foot (to 25 Oct), 135 stayed under 18 km/h, 4 fell between 18
 * and 25, and 25 went past it (cars, buses and one spoof at 26-440 km/h).
 * Above this a run declared on foot keeps moving, but its blocks are not
 * captured (claim route).
 */
export const FOOT_MAX_SUSTAINED_KMH = DECLARED_MAX_KMH.foot;

/**
 * True when a run moves faster over the measured window than its declared
 * mode can (DECLARED_MAX_KMH; UNDECLARED_MAX_KMH with no pick). Trains and
 * planes are left to the airborne check. Null speed means no measurement yet.
 */
export function tooFastForMode(
  declared: string | null | undefined,
  sustainedKmh: number | null | undefined,
): boolean {
  if (typeof sustainedKmh !== "number" || !Number.isFinite(sustainedKmh)) return false;
  if (declared === "train" || declared === "plane") return false;
  const ceiling = isMoveMode(declared) ? DECLARED_MAX_KMH[declared] : UNDECLARED_MAX_KMH;
  return sustainedKmh > ceiling;
}

/** Kept for callers that only ask about runs declared on foot. */
export function tooFastOnFoot(
  declared: string | null | undefined,
  sustainedKmh: number | null | undefined,
): boolean {
  return declared === "foot" && tooFastForMode(declared, sustainedKmh);
}

/**
 * The run's label. The player's own pick wins when speed can believe it.
 * When it cannot (someone "on foot" at 60 km/h, or on a plane declared as a
 * walk) the run is labelled by its speed instead and the finish route logs
 * the mismatch: the label feeds the public stats and the fast-travel watch,
 * so a wrong pick must not hide a train or a plane. With no pick, the session
 * average is refined by the best sustained speed: a slow average with a
 * motor-speed stretch is a car, not a bike.
 */
export function finalMoveMode(params: {
  declared: string | null | undefined;
  distanceMeters: number;
  durationSec: number;
  maxSustainedKmh: number | null | undefined;
}): { mode: MoveMode | null; mismatch: boolean } {
  const computed = moveMode(params.distanceMeters, params.durationSec);
  const sustained = Math.max(0, params.maxSustainedKmh ?? 0);
  if (isMoveMode(params.declared)) {
    const avg =
      params.durationSec > 0 ? (params.distanceMeters / params.durationSec) * 3.6 : 0;
    const ceiling = DECLARED_MAX_KMH[params.declared];
    const peak = Math.max(avg, sustained);
    if (peak <= ceiling) return { mode: params.declared, mismatch: false };
    return { mode: modeForKmh(peak), mismatch: true };
  }
  if ((computed === "foot" || computed === "bike") && sustained >= MOTOR_SUSTAINED_KMH) {
    return { mode: "car", mismatch: false };
  }
  return { mode: computed, mismatch: false };
}

const ICON: Record<MoveMode, string> = {
  foot: "🚶",
  bike: "🚲",
  moto: "🏍️",
  car: "🚗",
  bus: "🚌",
  train: "🚆",
  plane: "✈️",
  // Shown as a unicorn on purpose.
  horse: "🦄",
  boat: "⛵",
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
  if (isMoveMode(run.moveMode)) return run.moveMode;
  if (!run.endedAt) return null;
  const sec =
    (new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) /
    1000;
  return moveMode(run.distanceMeters, sec);
}
