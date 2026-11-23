import { describe, expect, it } from "vitest";
import { BADGE_IDS } from "@/lib/onchain/badges";
import { badgeProgress, BADGE_RULES, eligibleFromStats, type BadgeStats } from "@/lib/onchain/badgeRules";

const zero: BadgeStats = {
  totalRuns: 0,
  hexesOwned: 0,
  bestRunHexes: 0,
  bestRunDistance: 0,
  lifetimeDistance: 0,
  cityCount: 0,
  conquests: 0,
  countryCount: 0,
  streak: 0,
};

describe("badge rules", () => {
  it("covers each badge once", () => {
    const names = BADGE_RULES.map(([b]) => b);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives nothing for no activity", () => {
    expect(eligibleFromStats(zero)).toEqual([]);
  });

  it("qualifies at the threshold, not below", () => {
    expect(eligibleFromStats({ ...zero, hexesOwned: 4 })).toEqual([BADGE_IDS.firstBlock]);
    expect(eligibleFromStats({ ...zero, hexesOwned: 5 })).toEqual([BADGE_IDS.firstBlock, BADGE_IDS.fiveBlocks]);
    expect(eligibleFromStats({ ...zero, streak: 3 })).toContain(BADGE_IDS.threeDays);
  });

  it("reports progress toward the challenge badges, capped at the target", () => {
    const ids = [2, 16, 26, 43];
    const p = badgeProgress({ ...zero, hexesOwned: 22, bestRunHexes: 3, streak: 1, conquests: 0 }, ids);
    expect(p.map((x) => [x.id, x.have, x.need])).toEqual([
      [2, 5, 5],
      [16, 3, 5],
      [26, 1, 3],
      [43, 0, 1],
    ]);
  });

  it("skips badges with no stat rule", () => {
    expect(badgeProgress(zero, [9999])).toEqual([]);
  });
});
