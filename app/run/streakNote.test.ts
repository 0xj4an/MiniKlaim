import { describe, expect, it } from "vitest";
import { computeStreak } from "@/lib/runs/streakMath";

/**
 * What the run summary should say, as a function of the two things it knows.
 * Kept as a pure decision so the case that actually happened is pinned:
 * a seven-day streak and a run that captured nothing.
 */
function noteFor(streak: number, countedThisRun: boolean) {
  if (streak === 0) return "start";
  if (!countedThisRun) return "alive";
  return "counted";
}

describe("what the run summary tells a player about their streak", () => {
  it("does not tell a player with a live streak to start one", () => {
    // 2 Nov 2026: two runs on a plane recorded nothing, and `streak_shown`
    // fired with streak 7 and counted false. The screen said "start a
    // streak", which reads as having lost seven days.
    expect(noteFor(7, false)).toBe("alive");
    expect(noteFor(7, false)).not.toBe("start");
  });

  it("still invites a player with no streak to start one", () => {
    expect(noteFor(0, false)).toBe("start");
    expect(noteFor(0, true)).toBe("start");
  });

  it("celebrates a run that counted", () => {
    expect(noteFor(7, true)).toBe("counted");
    expect(noteFor(1, true)).toBe("counted");
  });
});

describe("the streak itself survives a day that has not counted yet", () => {
  const DAYS = [
    "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29",
    "2026-10-28", "2026-10-27", "2026-10-26",
  ];

  it("counts seven days when today has no qualifying run yet", () => {
    const earlyToday = Date.parse("2026-11-02T07:00:00Z"); // 02:00 in Nassau
    expect(computeStreak(DAYS, earlyToday, "America/Nassau")).toBe(7);
  });

  it("breaks only once a whole day has passed with nothing", () => {
    const dayAfter = Date.parse("2026-11-03T18:00:00Z");
    expect(computeStreak(DAYS, dayAfter, "America/Nassau")).toBe(0);
  });
});
