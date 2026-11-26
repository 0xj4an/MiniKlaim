import { describe, expect, it } from "vitest";
import {
  computeBestStreak,
  computeStreak,
  daysToNextRestDay,
  isValidTimeZone,
  localDay,
  nextStreakBadge,
  streakState,
} from "./streakMath";

const NOW = Date.parse("2026-10-23T15:00:00Z");

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-10-23", "2026-10-22", "2026-10-21"], NOW)).toBe(
      3,
    );
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
    const days = [
      "2026-10-01",
      "2026-10-10",
      "2026-10-02",
      "2026-10-03",
      "2026-10-11",
    ];
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
  const days = [
    "2026-10-24",
    "2026-10-23",
    "2026-10-22",
    "2026-10-21",
    "2026-10-20",
    "2026-10-19",
  ];

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
    expect(
      computeStreak(["2026-10-25", "2026-10-24"], jkt, "Asia/Jakarta"),
    ).toBe(2);
  });
});

describe("localDay / isValidTimeZone", () => {
  it("formats the calendar day in the zone", () => {
    expect(
      localDay(Date.parse("2026-10-25T02:30:00Z"), "America/Mexico_City"),
    ).toBe("2026-10-24");
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

describe("legacy IANA aliases", () => {
  it("buckets days in a zone Postgres does not carry", () => {
    // The whole reason the bucketing left SQL. `Asia/Calcutta` is a legacy
    // alias: ICU accepts it, `pg_timezone_names` has no row for it, and the
    // P65 fallback therefore counted these players in UTC.
    expect(localDay(Date.parse("2026-11-06T19:00:00Z"), "Asia/Calcutta")).toBe(
      "2026-11-07",
    );
    expect(localDay(Date.parse("2026-11-06T19:00:00Z"), "Asia/Kolkata")).toBe(
      "2026-11-07",
    );
    // Same instant in UTC is the previous day: that one day of difference is
    // what put a hole in 0xj4an's run days on 7 Nov 2026 and reset a real
    // eleven-day streak to 1.
    expect(localDay(Date.parse("2026-11-06T19:00:00Z"), "UTC")).toBe(
      "2026-11-06",
    );
  });

  it("keeps a streak whole in the player's zone that UTC would break", () => {
    // His actual qualifying days, as the database returns them, bucketed in
    // each zone. Kolkata runs unbroken; UTC drops 6 Nov.
    const kolkata = [
      "2026-11-07",
      "2026-11-06",
      "2026-11-05",
      "2026-11-04",
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
      "2026-10-31",
      "2026-10-30",
      "2026-10-29",
      "2026-10-28",
    ];
    const utc = [
      "2026-11-07",
      "2026-11-05",
      "2026-11-04",
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
      "2026-10-31",
      "2026-10-30",
      "2026-10-29",
      "2026-10-28",
    ];
    const now = Date.parse("2026-11-07T06:00:00Z");
    expect(computeStreak(kolkata, now, "Asia/Calcutta")).toBe(11);
    expect(computeStreak(utc, now, "UTC")).toBe(1);
  });

  it("falls back to UTC only for a zone no runtime understands", () => {
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true);
    expect(isValidTimeZone("America/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

/** `count` consecutive days ending on `last` (yyyy-mm-dd), newest first. */
function daysEnding(last: string, count: number): string[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - i * 86_400_000).toISOString().slice(0, 10),
  );
}

describe("rest days", () => {
  it("keeps 0xj4an's streak over the Monday he missed", () => {
    // 26 Oct to 15 Nov 2026 played, 16 Nov missed, 17 Nov played at 04:08 in
    // Bogota. Strict counting showed 1.
    const played = daysEnding("2026-11-15", 21);
    const beforePlaying = Date.parse("2026-11-17T08:00:00Z");
    expect(streakState(played, beforePlaying, "America/Bogota")).toEqual({
      current: 21,
      best: 21,
      restDays: 1,
      restDaysCovering: 1,
    });
    const afterPlaying = Date.parse("2026-11-17T09:10:00Z");
    expect(streakState(["2026-11-17", ...played], afterPlaying, "America/Bogota")).toEqual({
      current: 22,
      best: 22,
      restDays: 1,
      restDaysCovering: 0,
    });
  });

  it("gives none in the first week: seven days still have to be seven in a row", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const week = daysEnding("2026-11-08", 7);
    expect(streakState(week, now)).toMatchObject({ current: 0, best: 7, restDays: 0 });
    // Six days, a gap, then one more: the gap is not covered.
    expect(computeBestStreak(["2026-11-10", ...daysEnding("2026-11-08", 6)])).toBe(6);
  });

  it("earns one every ten days played in a row", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(streakState(daysEnding("2026-11-10", 9), now).restDays).toBe(0);
    expect(streakState(daysEnding("2026-11-10", 10), now).restDays).toBe(1);
    expect(streakState(daysEnding("2026-11-10", 29), now).restDays).toBe(2);
  });

  it("holds three at most", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(streakState(daysEnding("2026-11-10", 30), now).restDays).toBe(3);
    expect(streakState(daysEnding("2026-11-10", 65), now).restDays).toBe(3);
  });

  it("counts the days played, not the rest days", () => {
    // Ten days, one missed, five more.
    const days = [...daysEnding("2026-11-16", 5), ...daysEnding("2026-11-10", 10)];
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(streakState(days, now)).toEqual({
      current: 15,
      best: 15,
      restDays: 0,
      restDaysCovering: 0,
    });
  });

  it("ends when the days missed outnumber the rest days held", () => {
    // Ten days earn one rest day; two days missed in a row is one too many.
    const days = [...daysEnding("2026-11-16", 4), ...daysEnding("2026-11-10", 10)];
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(streakState(days, now)).toMatchObject({ current: 4, best: 10, restDays: 0 });
  });

  it("covers a long weekend with three, and no more", () => {
    const month = daysEnding("2026-11-10", 30);
    expect(streakState(month, Date.parse("2026-11-14T12:00:00Z"))).toMatchObject({
      current: 30,
      restDays: 0,
      restDaysCovering: 3,
    });
    expect(streakState(month, Date.parse("2026-11-15T12:00:00Z"))).toMatchObject({
      current: 0,
      best: 30,
      restDays: 0,
    });
  });

  it("does not count today as missed while it is not over", () => {
    const ten = daysEnding("2026-11-09", 10);
    expect(streakState(ten, Date.parse("2026-11-10T23:00:00Z"))).toMatchObject({
      current: 10,
      restDays: 1,
      restDaysCovering: 0,
    });
  });

  it("says how far the next rest day is", () => {
    expect(daysToNextRestDay(1)).toBe(9);
    expect(daysToNextRestDay(9)).toBe(1);
    expect(daysToNextRestDay(10)).toBe(10);
    expect(daysToNextRestDay(22)).toBe(8);
  });
});

describe("zone formatters are built once", () => {
  it("gives the same days as a fresh formatter, across zones and an invalid one", () => {
    const now = Date.UTC(2026, 10, 26, 4, 30);
    for (const tz of ["America/Bogota", "Asia/Tokyo", "UTC", "Europe/Madrid"]) {
      const fresh = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
      expect(localDay(now, tz)).toBe(fresh);
      expect(localDay(now, tz)).toBe(fresh);
    }
    expect(localDay(now, "Not/AZone")).toBe(localDay(now, "UTC"));
    expect(localDay(now, null)).toBe(localDay(now, "UTC"));
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("America/Bogota")).toBe(true);
    expect(isValidTimeZone("x".repeat(65))).toBe(false);
  });
});
