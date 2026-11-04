import { describe, expect, it } from "vitest";
import { DROP_ELIGIBLE_MODES } from "@/lib/drops/config";
import { judgeFind, type FindState } from "@/lib/drops/rules";

const T0 = new Date("2026-11-05T10:00:00Z");
const START = new Date("2026-11-05T08:00:00Z");
const rules = { maxAccuracyM: 20, minDwellSeconds: 10, minNearBatches: 2, earlyFindMinutes: 10 };
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const find = (over: Partial<FindState> = {}): FindState => ({
  firstNearAt: T0,
  lastNearAt: at(20),
  nearBatches: 3,
  crossedAt: at(8),
  accuracyM: 8,
  ...over,
});

const judge = (f: FindState, declaredMode: Parameters<typeof judgeFind>[1]["declaredMode"] = "foot", startsAt = START) =>
  judgeFind(f, { declaredMode, eligibleModes: DROP_ELIGIBLE_MODES, dropStartsAt: startsAt, rules });

describe("judgeFind", () => {
  it("wins a clean walk past the block", () => {
    expect(judge(find())).toEqual({ review: "ok" });
    expect(judge(find(), "bike")).toEqual({ review: "ok" });
  });

  it("waits while the block was not crossed", () => {
    expect(judge(find({ crossedAt: null, accuracyM: null }))).toEqual({ review: "pending" });
  });

  it("waits until the dwell window is long enough", () => {
    expect(judge(find({ lastNearAt: at(9) }))).toEqual({ review: "pending" });
    expect(judge(find({ nearBatches: 1 }))).toEqual({ review: "pending" });
  });

  it("rejects poor accuracy at the block", () => {
    expect(judge(find({ accuracyM: 35 }))).toEqual({ review: "rejected", reason: "accuracy:35" });
  });

  it("rejects motor modes outright", () => {
    expect(judge(find(), "car")).toEqual({ review: "rejected", reason: "mode:car" });
    expect(judge(find({ crossedAt: null }), "plane")).toEqual({ review: "rejected", reason: "mode:plane" });
  });

  it("flags an undeclared mode, a missing accuracy and an early find", () => {
    expect(judge(find(), null)).toEqual({ review: "flagged", reason: "mode:undeclared" });
    expect(judge(find({ accuracyM: null }))).toEqual({ review: "flagged", reason: "no-accuracy" });
    expect(judge(find(), "foot", new Date(T0.getTime() - 5 * 60_000))).toEqual({
      review: "flagged",
      reason: "early-find",
    });
  });
});
