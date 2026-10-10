import { describe, expect, test } from "vitest";
import { moveMode } from "./moveMode";

describe("move mode", () => {
  test("a tap is not a trip", () => {
    expect(moveMode(10, 5)).toBeNull();
    expect(moveMode(0, 600)).toBeNull();
    expect(moveMode(500, 10)).toBeNull();
  });

  test("walk, bike, car, and the 123 km/h run", () => {
    expect(moveMode(500, 600)).toBe("foot");
    expect(moveMode(2000, 400)).toBe("bike");
    expect(moveMode(5000, 300)).toBe("car");
    expect(moveMode(2225, 65)).toBe("plane");
  });
});
