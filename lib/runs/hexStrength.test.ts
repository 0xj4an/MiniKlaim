import { describe, expect, it } from "vitest";
import {
  DECAY_DAYS,
  MAX_STRENGTH,
  effectiveStrength,
  planHexAction,
  playerKey,
} from "@/lib/runs/hexStrength";

const NOW = new Date("2026-10-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const monthsAgo = (m: number) => daysAgo(m * DECAY_DAYS);

describe("effectiveStrength", () => {
  it.each([
    // base, damage, months, expected
    [10, 0, 0, 10],
    [10, 0, 3, 7],
    [10, 0, 12, 1],
    [3, 2, 0, 1],
    [3, 2, 1, 1],
    [5, 1, 2, 2],
    [1, 0, 50, 1],
  ])("base %i damage %i after %i months -> %i", (base, damage, months, expected) => {
    expect(
      effectiveStrength({ baseStrength: base, damage, reinforcedAt: monthsAgo(months) }, NOW),
    ).toBe(expected);
  });

  it("loses the first level only after a full 30 days", () => {
    const state = (d: number) => ({ baseStrength: 4, damage: 0, reinforcedAt: daysAgo(d) });
    expect(effectiveStrength(state(29.9), NOW)).toBe(4);
    expect(effectiveStrength(state(30), NOW)).toBe(3);
    expect(effectiveStrength(state(59.9), NOW)).toBe(3);
    expect(effectiveStrength(state(60), NOW)).toBe(2);
  });

  it("never returns 0 or more than the cap, even with bad rows", () => {
    expect(effectiveStrength({ baseStrength: 2, damage: 5, reinforcedAt: NOW }, NOW)).toBe(1);
    expect(effectiveStrength({ baseStrength: 40, damage: 0, reinforcedAt: NOW }, NOW)).toBe(
      MAX_STRENGTH,
    );
    expect(
      effectiveStrength({ baseStrength: 3, damage: 0, reinforcedAt: daysAgo(-5) }, NOW),
    ).toBe(3);
  });
});

describe("planHexAction", () => {
  it("captures a free block at level 1", () => {
    expect(planHexAction(null, NOW)).toEqual({ action: "new", strength: 1 });
  });

  it("owner pass reinforces by one", () => {
    expect(
      planHexAction({ baseStrength: 1, damage: 0, reinforcedAt: NOW, ownedByActor: true }, NOW),
    ).toEqual({ action: "reinforce", strength: 2, baseStrength: 2 });
  });

  it("reinforce stops at the cap but still counts as a visit", () => {
    expect(
      planHexAction({ baseStrength: 10, damage: 0, reinforcedAt: NOW, ownedByActor: true }, NOW),
    ).toEqual({ action: "reinforce", strength: 10, baseStrength: 10 });
  });

  it("owner visit folds damage and decay into the new base", () => {
    // base 6, 2 attacks, 1 month without visits: 6 - 2 = 4, minus 1 = 3, plus 1 = 4.
    expect(
      planHexAction(
        { baseStrength: 6, damage: 2, reinforcedAt: monthsAgo(1), ownedByActor: true },
        NOW,
      ),
    ).toEqual({ action: "reinforce", strength: 4, baseStrength: 4 });
  });

  it("attack lowers a block above level 1", () => {
    expect(
      planHexAction({ baseStrength: 3, damage: 0, reinforcedAt: NOW, ownedByActor: false }, NOW),
    ).toEqual({ action: "attack", strength: 2 });
  });

  it("attack on level 1 captures, and the block stays at level 1", () => {
    expect(
      planHexAction({ baseStrength: 3, damage: 2, reinforcedAt: NOW, ownedByActor: false }, NOW),
    ).toEqual({ action: "capture", strength: 1 });
  });

  it("decay alone brings a block to 1, then one attack takes it", () => {
    const abandoned = { baseStrength: 10, damage: 0, reinforcedAt: monthsAgo(9), ownedByActor: false };
    expect(planHexAction(abandoned, NOW)).toEqual({ action: "capture", strength: 1 });
  });

  it("a level-10 block needs ten attacks", () => {
    let damage = 0;
    for (let i = 0; i < 9; i += 1) {
      const plan = planHexAction(
        { baseStrength: 10, damage, reinforcedAt: NOW, ownedByActor: false },
        NOW,
      );
      expect(plan.action).toBe("attack");
      damage += 1;
    }
    expect(
      planHexAction({ baseStrength: 10, damage, reinforcedAt: NOW, ownedByActor: false }, NOW)
        .action,
    ).toBe("capture");
  });

  it("an attack never breaks damage < base", () => {
    for (let base = 1; base <= 10; base += 1) {
      for (let damage = 0; damage < base; damage += 1) {
        for (const months of [0, 1, 3, 12]) {
          const plan = planHexAction(
            { baseStrength: base, damage, reinforcedAt: monthsAgo(months), ownedByActor: false },
            NOW,
          );
          if (plan.action === "attack") expect(damage + 1).toBeLessThan(base);
        }
      }
    }
  });
});

describe("playerKey", () => {
  it("is the lowest lowercased address", () => {
    expect(playerKey(["0xBB", "0xaa", "0xCC"], "0xbb")).toBe("0xaa");
  });
  it("falls back to the run wallet", () => {
    expect(playerKey([], "0xAB")).toBe("0xab");
  });
});
