import { describe, expect, it } from "vitest";
import { stolenSplit } from "./stolenSplit";

// The real strings, so the test reads as what the player sees.
const en: Record<string, string> = {
  "run.tally.split": "Blocks: {s} stolen + {f} with no owner",
  "run.tally.allStolen": "Blocks: all {n} stolen from others",
  "run.tally.allStolen.one": "Block: stolen from another player",
};
const t = (key: string) => en[key] ?? key;

describe("stolenSplit", () => {
  it("says nothing when no block was stolen", () => {
    expect(stolenSplit(t, 12, 0)).toBeNull();
  });

  it("accounts for every block: the stolen ones and the rest", () => {
    expect(stolenSplit(t, 44, 40)).toBe("Blocks: 40 stolen + 4 with no owner");
  });

  it("does not print a zero when every block was stolen", () => {
    expect(stolenSplit(t, 7, 7)).toBe("Blocks: all 7 stolen from others");
    expect(stolenSplit(t, 1, 1)).toBe("Block: stolen from another player");
  });

  it("never goes negative if the counters land out of order", () => {
    expect(stolenSplit(t, 3, 5)).toBe("Blocks: all 5 stolen from others");
  });
});
