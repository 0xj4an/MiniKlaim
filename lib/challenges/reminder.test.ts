import { describe, expect, it } from "vitest";
import { challengeReminder, REMINDER_SNOOZE_MS } from "./reminder";

const closesAt = "2026-11-23T00:00:00.000Z";
const now = new Date("2026-11-21T20:00:00.000Z").getTime();
const challenge = { id: "w46", badgeIds: [10, 1, 34, 48], closesAt };
const player = (held: number[], claimable: number[] = [], entered = true) => ({
  entered,
  held,
  claimable,
});

describe("challengeReminder", () => {
  it("reminds an entrant who has earned badges but not claimed them", () => {
    const r = challengeReminder({ challenge, player: player([1], [10, 34]) }, now, null);
    expect(r).toMatchObject({ missing: [10, 34, 48], claimable: [10, 34], action: "claim" });
  });

  it("sends an entrant with nothing earned to run", () => {
    const r = challengeReminder({ challenge, player: player([]) }, now, null);
    expect(r).toMatchObject({ missing: [10, 1, 34, 48], claimable: [], action: "run" });
  });

  it("says nothing to someone who holds them all, did not enter, or has no challenge", () => {
    expect(challengeReminder({ challenge, player: player([10, 1, 34, 48]) }, now, null)).toBeNull();
    expect(challengeReminder({ challenge, player: player([], [], false) }, now, null)).toBeNull();
    expect(challengeReminder({ challenge: null, player: player([]) }, now, null)).toBeNull();
    expect(challengeReminder({ challenge }, now, null)).toBeNull();
  });

  it("says nothing once the week is closed", () => {
    const after = new Date(closesAt).getTime();
    expect(challengeReminder({ challenge, player: player([]) }, after, null)).toBeNull();
  });

  it("stays away after a dismissal, then comes back", () => {
    const input = { challenge, player: player([]) };
    expect(challengeReminder(input, now, now - 60_000)).toBeNull();
    expect(challengeReminder(input, now, now - REMINDER_SNOOZE_MS)).not.toBeNull();
  });
});
