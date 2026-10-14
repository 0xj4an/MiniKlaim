import { cellToLatLng, greatCircleDistance, isValidCell } from "h3-js";

/**
 * Server-side check that a run's captures follow a path a phone could
 * actually travel. Until now the claim route trusted whatever hexes the
 * client sent, so a scripted client or a GPS spoofer could claim hundreds of
 * blocks without moving (one run on 13 Oct: 122 blocks, 2 m travelled).
 *
 * Each batch is walked in order from the last accepted capture of the run.
 * The path length (hex centre to hex centre) must fit what ROAD_SPEED_KMH
 * allows in the time since that capture, plus SLACK_METERS for GPS noise and
 * the hex size.
 *
 * Trains and planes are allowed (they are labelled, not blocked). A path
 * faster than road speed is accepted up to MAX_SPEED_KMH (airliner ground
 * speed with tailwind) only while it runs fairly straight: path length at
 * most STRAIGHT_RATIO times the straight-line distance covered. Real fast
 * travel is close to a line; a spoofer claiming a cloud of blocks around
 * one spot is not.
 *
 * The first hex that does not fit, and every hex after it in the batch, is
 * rejected; the run's position stays at the last good hex.
 */
export const ROAD_SPEED_KMH = 130;
export const MAX_SPEED_KMH = 1300;
export const STRAIGHT_RATIO = 1.5;
export const SLACK_METERS = 120;
const ROAD_MPS = ROAD_SPEED_KMH / 3.6;
const MAX_MPS = MAX_SPEED_KMH / 3.6;

export type ChainResult = {
  accepted: string[];
  rejected: string[];
  /** Path length of the accepted hexes, metres. */
  meters: number;
  /** Where the run is now: last accepted hex, or the previous one. */
  endH3: string | null;
};

export function hexDistanceMeters(a: string, b: string): number {
  if (a === b) return 0;
  return greatCircleDistance(cellToLatLng(a), cellToLatLng(b), "m");
}

export function checkChain(params: {
  lastH3: string | null;
  lastAt: Date;
  now: Date;
  hexes: string[];
}): ChainResult {
  const dtSec = Math.max(1, (params.now.getTime() - params.lastAt.getTime()) / 1000);
  const roadAllowed = ROAD_MPS * dtSec + SLACK_METERS;
  const maxAllowed = MAX_MPS * dtSec + SLACK_METERS;
  const accepted: string[] = [];
  const rejected: string[] = [];
  let from = params.lastH3 && isValidCell(params.lastH3) ? params.lastH3 : null;
  let origin = from;
  let meters = 0;
  let broken = false;
  for (const h of params.hexes) {
    if (broken || !isValidCell(h)) {
      rejected.push(h);
      continue;
    }
    if (!origin) origin = h;
    const step = from ? hexDistanceMeters(from, h) : 0;
    const path = meters + step;
    const fits =
      path <= roadAllowed ||
      (path <= maxAllowed &&
        path <= STRAIGHT_RATIO * hexDistanceMeters(origin, h) + SLACK_METERS);
    if (!fits) {
      broken = true;
      rejected.push(h);
      continue;
    }
    meters = path;
    accepted.push(h);
    from = h;
  }
  return { accepted, rejected, meters, endH3: from };
}

/**
 * A run's first capture has no position to check against inside the run,
 * so it is checked against where the player's previous run left off: a new
 * run cannot start further away than MAX_SPEED_KMH allows since then. This
 * stops GPS teleports between runs while letting someone who flew play on
 * landing.
 *
 * Returns true when the first hex is reachable. No previous capture means
 * nothing to check.
 */
export function reachableFromPrevious(params: {
  prevH3: string | null;
  prevAt: Date | null;
  now: Date;
  firstH3: string | undefined;
}): boolean {
  const { prevH3, prevAt, now, firstH3 } = params;
  if (!prevH3 || !prevAt || !firstH3) return true;
  if (!isValidCell(prevH3) || !isValidCell(firstH3)) return true;
  const gapSec = Math.max(1, (now.getTime() - prevAt.getTime()) / 1000);
  return hexDistanceMeters(prevH3, firstH3) <= MAX_MPS * gapSec + SLACK_METERS;
}

/**
 * The hex path of a run must roughly match the distance the phone's GPS
 * reported. Hex centres zigzag, so the path can run longer, but not by more
 * than PATH_RATIO plus PATH_SLACK_METERS. A client that submits blocks while
 * reporting it barely moved is not a phone walking around.
 */
export const PATH_RATIO = 3;
export const PATH_SLACK_METERS = 300;

export function pathFitsReported(serverMeters: number, reportedMeters: number): boolean {
  return serverMeters <= Math.max(0, reportedMeters) * PATH_RATIO + PATH_SLACK_METERS;
}
