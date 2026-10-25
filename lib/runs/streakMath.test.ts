import { describe, expect, it } from "vitest";
import {
  computeBestStreak,
  computeStreak,
  isValidTimeZone,
  localDay,
  nextStreakBadge,
} from "./streakMath";

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

describe("computeStreak in the player's time zone", () => {
  // 2026-10-25 02:30 UTC is still 24 Oct, 20:30 in Mexico City.
  const MX_EVENING = Date.parse("2026-10-25T02:30:00Z");
  const days = ["2026-10-24", "2026-10-23", "2026-10-22", "2026-10-21", "2026-10-20", "2026-10-19"];

  it("uses local today, not UTC today", () => {
    expect(computeStreak(days, MX_EVENING, "America/Mexico_City")).toBe(6);
  });
  it("still works in UTC when no zone is known", () => {
    expect(computeStreak(["2026-10-25", "2026-10-23"], MX_EVENING)).toBe(1);
  });
  it("falls back to UTC on an invalid zone", () => {
    expect(computeStreak(["2026-10-25"], MX_EVENING, "Not/AZone")).toBe(1);
  });
  it("is ahead of UTC east of Greenwich", () => {
    // 2026-10-24 20:00 UTC is already 25 Oct, 03:00 in Jakarta.
    const jkt = Date.parse("2026-10-24T20:00:00Z");
    expect(computeStreak(["2026-10-25", "2026-10-24"], jkt, "Asia/Jakarta")).toBe(2);
  });
});

describe("localDay / isValidTimeZone", () => {
  it("formats the calendar day in the zone", () => {
    expect(localDay(Date.parse("2026-10-25T02:30:00Z"), "America/Mexico_City")).toBe("2026-10-24");
    expect(localDay(Date.parse("2026-10-25T02:30:00Z"))).toBe("2026-10-25");
  });
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});
