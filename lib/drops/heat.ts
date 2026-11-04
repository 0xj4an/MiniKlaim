import { UNITS, cellToLatLng, greatCircleDistance } from "h3-js";

/**
 * Hot/cold signal while running. Coarse on purpose: a level, never a distance
 * or a direction, and the hottest level still spans a few blocks so it does
 * not point at the cell. Computed from the run's last guard-accepted block,
 * never from a coordinate the client sends.
 */
export type HeatLevel = 0 | 1 | 2 | 3;

/** Upper bound in metres for each level: 3 hot, 2 warm, 1 cold, beyond is 0. */
export const HEAT_METERS = { hot: 60, warm: 200, cold: 600 } as const;

export function heatLevel(meters: number): HeatLevel {
  if (!Number.isFinite(meters)) return 0;
  if (meters <= HEAT_METERS.hot) return 3;
  if (meters <= HEAT_METERS.warm) return 2;
  if (meters <= HEAT_METERS.cold) return 1;
  return 0;
}

/**
 * How far the phone's own cell may be from the run's last accepted block and
 * still be used. Re-walking blocks already sent this run sends no batch, so
 * without the phone's cell the signal would freeze. The cap keeps the
 * endpoint from being a remote oracle: you can only ask about where your run
 * already is.
 */
export const HEAT_CLIENT_MAX_M = 300;

/** The cell to judge heat from: the phone's, when it is near the run's last accepted block. */
export function heatOrigin(lastAccepted: string, phoneCell: string | null): string {
  if (!phoneCell) return lastAccepted;
  try {
    return cellMeters(lastAccepted, phoneCell) <= HEAT_CLIENT_MAX_M ? phoneCell : lastAccepted;
  } catch {
    return lastAccepted;
  }
}

export function cellMeters(a: string, b: string): number {
  return greatCircleDistance(cellToLatLng(a), cellToLatLng(b), UNITS.m);
}

/** The nearest drop to `fromH3` and its heat level, or null when none is in range. */
export function heatFor<T extends { h3: string }>(
  fromH3: string,
  drops: readonly T[],
): { drop: T; level: Exclude<HeatLevel, 0> } | null {
  let best: { drop: T; meters: number } | null = null;
  for (const drop of drops) {
    const meters = cellMeters(fromH3, drop.h3);
    if (!best || meters < best.meters) best = { drop, meters };
  }
  if (!best) return null;
  const level = heatLevel(best.meters);
  return level === 0 ? null : { drop: best.drop, level };
}
