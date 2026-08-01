import { and, count, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";

/**
 * Anti-spoof / anti-bot guards for hex captures. Server-side, single choke
 * point for all `/api/runs/[id]/claim` requests. See docs/tasks/IMPROVEMENTS.md
 * P1.1 for the original spec + threshold rationale.
 *
 * Client-side accuracy filtering exists in `app/run/page.tsx` for UX, but the
 * server is the source of truth for game integrity: without these checks a
 * bot with a spoofed geolocation could farm the leaderboard and mint NFTs
 * from thin air.
 */

/** Reject GPS samples worse than this (meters). Typical urban GPS is 5-20m. */
export const ACCURACY_MAX_METERS = 30;

/** Cap distance for a single hex capture (meters). A hex is ~13m across;
 *  200m implies GPS teleport or very long straight-line "run". */
export const DISTANCE_MAX_PER_CAPTURE = 200;

/** Max distinct hex captures in a rolling 60-second window per run. Allows
 *  fast running (~4 sec/hex avg = 3.25 m/s = 12 km/h) with margin. Sprinters
 *  briefly exceed this; the min-interval check below is the finer guard. */
export const HEX_RATE_LIMIT_PER_MIN = 15;

/** Minimum seconds between two consecutive hex captures. World-class sprint
 *  = 10 m/s = 1.3 sec/hex; 2 sec allows real sprinters, catches obvious bots. */
export const MIN_SECONDS_BETWEEN_HEX = 2;

/** Overall run avg speed cap at finish (m/s). Faster than fastest marathoner
 *  average (~5.7 m/s) but below any motorized vehicle sustained pace. */
export const RUN_AVG_SPEED_MAX_MPS = 8;

export type ClaimValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "accuracy-too-poor"
        | "distance-implausible"
        | "rate-limited"
        | "too-fast";
      detail?: string;
    };

/**
 * Validate a `/api/runs/[id]/claim` request BEFORE inserting the hex.
 * Reads recent hex activity for the run to check rate + interval.
 */
export async function validateClaim(params: {
  runId: string;
  distanceMeters: number;
  accuracy?: number | null;
}): Promise<ClaimValidationResult> {
  const { runId, distanceMeters, accuracy } = params;

  if (
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy > ACCURACY_MAX_METERS
  ) {
    return {
      ok: false,
      reason: "accuracy-too-poor",
      detail: `accuracy ${accuracy}m > ${ACCURACY_MAX_METERS}m`,
    };
  }

  if (distanceMeters > DISTANCE_MAX_PER_CAPTURE) {
    return {
      ok: false,
      reason: "distance-implausible",
      detail: `distance ${distanceMeters}m > ${DISTANCE_MAX_PER_CAPTURE}m for one hex`,
    };
  }

  // Rate limit: count hex captures in the last 60 seconds for this run.
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ c: count() })
    .from(hexes)
    .where(and(eq(hexes.runId, runId), gt(hexes.claimedAt, oneMinuteAgo)));
  const recentCount = recent?.c ?? 0;
  if (recentCount >= HEX_RATE_LIMIT_PER_MIN) {
    return {
      ok: false,
      reason: "rate-limited",
      detail: `${recentCount} hexes in last 60s (max ${HEX_RATE_LIMIT_PER_MIN})`,
    };
  }

  // Interval: check last capture time.
  const [last] = await db
    .select({ claimedAt: hexes.claimedAt })
    .from(hexes)
    .where(eq(hexes.runId, runId))
    .orderBy(desc(hexes.claimedAt))
    .limit(1);
  if (last) {
    const secondsSinceLast = (Date.now() - last.claimedAt.getTime()) / 1000;
    if (secondsSinceLast < MIN_SECONDS_BETWEEN_HEX) {
      return {
        ok: false,
        reason: "too-fast",
        detail: `${secondsSinceLast.toFixed(2)}s since last hex (min ${MIN_SECONDS_BETWEEN_HEX}s)`,
      };
    }
  }

  return { ok: true };
}

export type FinishValidationResult =
  | { ok: true }
  | { ok: false; reason: "too-fast"; detail: string };

/**
 * Sanity-check a run at `/finish` time. Reject if the overall average speed
 * from start to finish exceeds a plausible human runner pace. This catches
 * long GPS teleport bursts that individually passed per-capture checks but
 * summed to something impossible.
 */
export async function validateFinish(runId: string): Promise<FinishValidationResult> {
  const [row] = await db
    .select({
      startedAt: runs.startedAt,
      distanceMeters: runs.distanceMeters,
    })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!row) return { ok: true }; // handled by caller (404 elsewhere)

  const durationSec = (Date.now() - row.startedAt.getTime()) / 1000;
  if (durationSec <= 0) return { ok: true };
  const avgMps = row.distanceMeters / durationSec;
  if (avgMps > RUN_AVG_SPEED_MAX_MPS) {
    return {
      ok: false,
      reason: "too-fast",
      detail: `${avgMps.toFixed(2)} m/s over ${durationSec.toFixed(0)}s (max ${RUN_AVG_SPEED_MAX_MPS} m/s)`,
    };
  }
  return { ok: true };
}
