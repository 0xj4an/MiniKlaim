import { describe, expect, it, test } from "vitest";
import { finalMoveMode, moveMode, moveModeIcon, runMoveMode } from "./moveMode";

describe("move mode", () => {
  test("a tap is not a trip", () => {
    expect(moveMode(10, 5)).toBeNull();
    expect(moveMode(0, 600)).toBeNull();
    expect(moveMode(500, 10)).toBeNull();
  });

  test("walk, bike, car, train, plane", () => {
    expect(moveMode(500, 600)).toBe("foot");
    expect(moveMode(2000, 400)).toBe("bike");
    expect(moveMode(5000, 300)).toBe("car");
    // 123 km/h is a fast car on a highway.
    expect(moveMode(2225, 65)).toBe("car");
    // 13 Oct, Gnesta to Flen: 33.9 km in 11.5 min (177 km/h).
    expect(moveMode(33885, 690)).toBe("train");
    // 400 km in 40 min (600 km/h).
    expect(moveMode(400_000, 2400)).toBe("plane");
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
    expect(moveModeIcon("train")).toBe("🚆");
  });
});

describe("finalMoveMode", () => {
  it("keeps the player's pick", () => {
    expect(finalMoveMode({ declared: "car", distanceMeters: 1802, durationSec: 441, maxSustainedKmh: 30 })).toEqual({ mode: "car", mismatch: false });
    expect(finalMoveMode({ declared: "horse", distanceMeters: 5000, durationSec: 1800, maxSustainedKmh: 20 })).toEqual({ mode: "horse", mismatch: false });
  });
  it("flags a pick speed cannot believe", () => {
    expect(finalMoveMode({ declared: "foot", distanceMeters: 20000, durationSec: 1200, maxSustainedKmh: 70 }).mismatch).toBe(true);
  });
  it("reads a slow city drive with a motor-speed stretch as a car (20 Oct)", () => {
    expect(finalMoveMode({ declared: null, distanceMeters: 1802, durationSec: 441, maxSustainedKmh: 52 }).mode).toBe("car");
  });
  it("falls back to the average with no pick and no fast stretch", () => {
    expect(finalMoveMode({ declared: undefined, distanceMeters: 2000, durationSec: 441, maxSustainedKmh: 20 }).mode).toBe("bike");
  });
  it("ignores an unknown pick", () => {
    expect(finalMoveMode({ declared: "rocket", distanceMeters: 1000, durationSec: 600, maxSustainedKmh: null }).mode).toBe("foot");
  });
});
