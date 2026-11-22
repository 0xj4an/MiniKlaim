import { describe, expect, test } from "vitest";
import { countdownLabel } from "./countdown";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe("countdownLabel", () => {
  test("days and hours", () => {
    expect(countdownLabel(2 * D + 4 * H + 30 * MIN)).toBe("2 d 4 h");
    expect(countdownLabel(3 * D + 10 * MIN)).toBe("3 d");
  });
  test("hours and minutes", () => {
    expect(countdownLabel(10 * H + 13 * MIN + 40_000)).toBe("10 h 13 min");
    expect(countdownLabel(5 * H)).toBe("5 h");
  });
  test("minutes and the last minute", () => {
    expect(countdownLabel(12 * MIN + 59_000)).toBe("12 min");
    expect(countdownLabel(30_000)).toBe("< 1 min");
  });
  test("past the deadline", () => {
    expect(countdownLabel(0)).toBeNull();
    expect(countdownLabel(-5 * MIN)).toBeNull();
  });
});
