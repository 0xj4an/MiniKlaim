import type { MoveMode } from "@/lib/runs/moveMode";

/**
 * Pure verdict on a pass near a treasure. No I/O, so the anti-cheat numbers
 * can be tested in one place (spec section 6).
 *
 * - pending: not decided yet (block not crossed, or the dwell window is still
 *   open). The next batch may settle it.
 * - ok: wins, if nobody won first (the one-winner index decides).
 * - flagged: held for admin review; the drop stays open meanwhile.
 * - rejected: never wins.
 */
export type FindVerdict =
  | { review: "pending" }
  | { review: "ok" }
  | { review: "flagged" | "rejected"; reason: string };

export type FindState = {
  firstNearAt: Date;
  lastNearAt: Date;
  nearBatches: number;
  crossedAt: Date | null;
  /** GPS accuracy of the fix that crossed the drop block. */
  accuracyM: number | null;
};

export function judgeFind(
  find: FindState,
  ctx: {
    declaredMode: MoveMode | null;
    eligibleModes: ReadonlySet<MoveMode>;
    dropStartsAt: Date;
    rules: {
      maxAccuracyM: number;
      minDwellSeconds: number;
      minNearBatches: number;
      earlyFindMinutes: number;
    };
  },
): FindVerdict {
  const { rules } = ctx;
  if (ctx.declaredMode && !ctx.eligibleModes.has(ctx.declaredMode)) {
    return { review: "rejected", reason: `mode:${ctx.declaredMode}` };
  }
  if (!find.crossedAt) return { review: "pending" };
  if (find.accuracyM !== null && find.accuracyM > rules.maxAccuracyM) {
    return { review: "rejected", reason: `accuracy:${find.accuracyM}` };
  }
  const dwellMs = find.lastNearAt.getTime() - find.firstNearAt.getTime();
  if (find.nearBatches < rules.minNearBatches || dwellMs < rules.minDwellSeconds * 1000) {
    return { review: "pending" };
  }
  if (find.accuracyM === null) return { review: "flagged", reason: "no-accuracy" };
  if (!ctx.declaredMode) return { review: "flagged", reason: "mode:undeclared" };
  const sinceStartMs = find.crossedAt.getTime() - ctx.dropStartsAt.getTime();
  if (sinceStartMs < rules.earlyFindMinutes * 60_000) {
    return { review: "flagged", reason: "early-find" };
  }
  return { review: "ok" };
}
