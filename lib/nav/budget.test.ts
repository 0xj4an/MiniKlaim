import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_BUDGET,
  navCreditsLeft,
  resetNavBudget,
  spendNavCredit,
} from "./budget";

const DAY1 = Date.UTC(2026, 10, 23, 12, 0, 0);

describe("nav budget", () => {
  beforeEach(() => resetNavBudget());

  it("stays under the provider's free 3000 a day", () => {
    expect(DAILY_BUDGET).toBeLessThan(3000);
  });

  it("limits one phone per minute and frees it a minute later", () => {
    for (let i = 0; i < 20; i++)
      expect(spendNavCredit("a", DAY1 + i)).toBe("ok");
    expect(spendNavCredit("a", DAY1 + 30)).toBe("client_limited");
    // A refused request spends nothing.
    expect(navCreditsLeft(DAY1 + 30)).toBe(DAILY_BUDGET - 20);
    expect(spendNavCredit("b", DAY1 + 30)).toBe("ok");
    expect(spendNavCredit("a", DAY1 + 61_000)).toBe("ok");
  });

  it("stops everyone once the day is spent and starts again the next day", () => {
    for (let i = 0; i < DAILY_BUDGET; i++) {
      expect(spendNavCredit(`c${i}`, DAY1)).toBe("ok");
    }
    expect(spendNavCredit("late", DAY1)).toBe("day_spent");
    expect(navCreditsLeft(DAY1)).toBe(0);
    const nextDay = DAY1 + 24 * 60 * 60 * 1000;
    expect(navCreditsLeft(nextDay)).toBe(DAILY_BUDGET);
    expect(spendNavCredit("late", nextDay)).toBe("ok");
  });
});
