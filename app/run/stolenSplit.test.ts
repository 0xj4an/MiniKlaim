import { describe, expect, it } from "vitest";
import { stolenSplit } from "./stolenSplit";

// The real strings, so the test reads as what the player sees.
const en: Record<string, string> = {
  "run.tally.split": "Blocks: {f} {fw} + {s} {sw}",
  "run.tally.free": "with no owner",
  "run.tally.free.one": "with no owner",
  "run.tally.stolen": "stolen",
  "run.tally.stolen.one": "stolen",
  "run.tally.allStolen": "Blocks: all {n} stolen from others",
  "run.tally.allStolen.one": "Block: stolen from another player",
};
const t = (key: string) => en[key] ?? key;
// Spanish is where the words change with the count.
const es: Record<string, string> = {
  "run.tally.split": "Cuadras: {f} {fw} + {s} {sw}",
  "run.tally.free": "sin dueño",
  "run.tally.free.one": "sin dueño",
  "run.tally.stolen": "robadas",
  "run.tally.stolen.one": "robada",
};
const tEs = (key: string) => es[key] ?? key;

describe("stolenSplit", () => {
  it("says nothing when no block was stolen", () => {
    expect(stolenSplit(t, 12, 0)).toBeNull();
  });

  it("accounts for every block: the stolen ones and the rest", () => {
    expect(stolenSplit(t, 44, 40)).toBe("Blocks: 4 with no owner + 40 stolen");
  });

  it("makes each word agree with its own count", () => {
    expect(stolenSplit(tEs, 10, 1)).toBe("Cuadras: 9 sin dueño + 1 robada");
    expect(stolenSplit(tEs, 4, 3)).toBe("Cuadras: 1 sin dueño + 3 robadas");
  });

  it("does not print a zero when every block was stolen", () => {
    expect(stolenSplit(t, 7, 7)).toBe("Blocks: all 7 stolen from others");
    expect(stolenSplit(t, 1, 1)).toBe("Block: stolen from another player");
  });

  it("never goes negative if the counters land out of order", () => {
    expect(stolenSplit(t, 3, 5)).toBe("Blocks: all 5 stolen from others");
  });
});
