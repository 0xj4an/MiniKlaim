import { describe, expect, it } from "vitest";
import { entryStanding, REMINDER_EVERY_MS, reminderDue } from "./standing";

const set = (...ids: number[]) => new Set(ids);

describe("entryStanding", () => {
  const badgeIds = [10, 1, 34, 48];
  it("is in the draw only with every badge held", () => {
    expect(entryStanding({ badgeIds, held: set(1, 10, 34, 48), claimable: set() })).toEqual({ state: "in" });
  });
  it("asks to claim when everything missing is already earned", () => {
    expect(entryStanding({ badgeIds, held: set(1, 10), claimable: set(34, 48) })).toEqual({
      state: "claim",
      missing: 2,
    });
  });
  it("asks for a run when a badge is not earned, counting all not held", () => {
    expect(entryStanding({ badgeIds, held: set(1), claimable: set(10) })).toEqual({
      state: "missing",
      missing: 3,
    });
    expect(entryStanding({ badgeIds, held: set(), claimable: set() })).toEqual({
      state: "missing",
      missing: 4,
    });
  });
});

describe("reminderDue", () => {
  const now = 1_800_000_000_000;
  it("is due the first time and with a broken stored value", () => {
    expect(reminderDue(null, now)).toBe(true);
    expect(reminderDue("nonsense", now)).toBe(true);
  });
  it("waits out the interval", () => {
    expect(reminderDue(String(now - REMINDER_EVERY_MS + 1), now)).toBe(false);
    expect(reminderDue(String(now - REMINDER_EVERY_MS), now)).toBe(true);
  });
});
