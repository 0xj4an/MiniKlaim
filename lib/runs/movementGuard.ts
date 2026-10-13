import { cellToLatLng, greatCircleDistance, isValidCell } from "h3-js";

/**
 * Server-side check that a run's captures follow a path a phone could
 * actually travel. Until now the claim route trusted whatever hexes the
 * client sent, so a scripted client or a GPS spoofer could claim hundreds of
 * blocks without moving (one run on 13 Oct: 122 blocks, 2 m travelled).
 *
 * Each batch is walked in order from the last accepted capture of the run.
 * The path length (hex centre to hex centre) must fit what MAX_SPEED_KMH
 * allows in the time since that capture, plus SLACK_METERS for GPS noise and
 * the hex size. The first hex that does not fit, and every hex after it in
 * the batch, is rejected; the run's position stays at the last good hex.
 *
 * Cars and bikes stay legal (the game allows any movement); 300 km/h is
 * above any road speed and well below a GPS teleport.
 */
export const MAX_SPEED_KMH = 300;
export const SLACK_METERS = 120;
const MAX_SPEED_MPS = MAX_SPEED_KMH / 3.6;

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
  const allowed = MAX_SPEED_MPS * dtSec + SLACK_METERS;
  const accepted: string[] = [];
  const rejected: string[] = [];
  let from = params.lastH3 && isValidCell(params.lastH3) ? params.lastH3 : null;
  let meters = 0;
  let broken = false;
  for (const h of params.hexes) {
    if (broken || !isValidCell(h)) {
      rejected.push(h);
      continue;
    }
    const step = from ? hexDistanceMeters(from, h) : 0;
    if (meters + step > allowed) {
      broken = true;
      rejected.push(h);
      continue;
    }
    meters += step;
    accepted.push(h);
    from = h;
  }
  return { accepted, rejected, meters, endH3: from };
}

/**
 * A run's first capture has no position to check against inside the run,
 * so it is checked against where the player's previous run left off. Without
 * this, every new run started a fresh chain: on 13 Oct a player on a flight
 * from Belgrade north opened a new short run every few minutes and each
 * first batch landed 100+ km from the last one (600-800 km/h).
 *
 * Returns true when the first hex is reachable from the previous capture at
 * MAX_SPEED_KMH. No previous capture means nothing to check.
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
  const dtSec = Math.max(1, (now.getTime() - prevAt.getTime()) / 1000);
  return hexDistanceMeters(prevH3, firstH3) <= MAX_SPEED_MPS * dtSec + SLACK_METERS;
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
