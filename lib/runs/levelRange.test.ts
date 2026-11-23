import { describe, expect, it } from "vitest";
import { levelRange, levelRangeLabel } from "./levelRange";

describe("levelRange", () => {
  it("spans the levels it is given", () => {
    expect(levelRange([3, 1, 2])).toEqual({ min: 1, max: 3 });
  });

  it("is one level when they are all the same", () => {
    expect(levelRange([4, 4])).toEqual({ min: 4, max: 4 });
  });

  it("is null with no blocks", () => {
    expect(levelRange([])).toBeNull();
  });

  it("ignores levels the server did not send", () => {
    expect(levelRange([0, Number.NaN, 2])).toEqual({ min: 2, max: 2 });
    expect(levelRange([0])).toBeNull();
  });
});

describe("levelRangeLabel", () => {
  it("prints one number for one level", () => {
    expect(levelRangeLabel({ min: 3, max: 3 })).toBe("3");
  });

  it("prints both ends otherwise", () => {
    expect(levelRangeLabel({ min: 1, max: 3 })).toBe("1-3");
  });
});
