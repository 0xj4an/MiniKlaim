import { describe, expect, it, test } from "vitest";
import { moveMode, moveModeIcon, runMoveMode } from "./moveMode";

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

describe("runMoveMode", () => {
  it("prefers the stored mode", () => {
    expect(
      runMoveMode({
        moveMode: "car",
        distanceMeters: 10,
        startedAt: "2026-10-12T00:00:00Z",
        endedAt: "2026-10-12T00:10:00Z",
      }),
    ).toBe("car");
  });
  it("computes from totals when nothing is stored", () => {
    expect(
      runMoveMode({
        moveMode: null,
        distanceMeters: 34062,
        startedAt: "2026-10-12T03:58:01Z",
        endedAt: "2026-10-12T04:43:46Z",
      }),
    ).toBe("car");
  });
  it("is null for a run still going", () => {
    expect(
      runMoveMode({
        distanceMeters: 500,
        startedAt: "2026-10-12T00:00:00Z",
        endedAt: null,
      }),
    ).toBeNull();
  });
  it("has an icon per mode", () => {
    expect(moveModeIcon("foot")).toBe("🚶");
    expect(moveModeIcon("car")).toBe("🚗");
  });
});
