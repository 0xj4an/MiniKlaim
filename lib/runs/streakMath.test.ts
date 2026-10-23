import { describe, expect, it } from "vitest";
import { computeBestStreak, computeStreak, nextStreakBadge } from "./streakMath";

const NOW = Date.parse("2026-10-23T15:00:00Z");

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-10-23", "2026-10-22", "2026-10-21"], NOW)).toBe(3);
  });
  it("keeps a streak alive until the end of the next day", () => {
    expect(computeStreak(["2026-10-22", "2026-10-21"], NOW)).toBe(2);
  });
  it("is over after a missed day", () => {
    expect(computeStreak(["2026-10-21", "2026-10-20"], NOW)).toBe(0);
  });
});

describe("computeBestStreak", () => {
  it("finds the longest run of days anywhere, in any order", () => {
    const days = ["2026-10-01", "2026-10-10", "2026-10-02", "2026-10-03", "2026-10-11"];
    expect(computeBestStreak(days)).toBe(3);
  });
  it("ignores duplicates and handles empty input", () => {
    expect(computeBestStreak(["2026-10-05", "2026-10-05"])).toBe(1);
    expect(computeBestStreak([])).toBe(0);
  });
  it("counts across a month boundary", () => {
    expect(computeBestStreak(["2026-09-30", "2026-10-01"])).toBe(2);
  });
});

describe("nextStreakBadge", () => {
  it("returns the next badge threshold", () => {
    expect(nextStreakBadge(0)).toBe(3);
    expect(nextStreakBadge(2)).toBe(3);
    expect(nextStreakBadge(3)).toBe(7);
    expect(nextStreakBadge(365)).toBeNull();
  });
});
