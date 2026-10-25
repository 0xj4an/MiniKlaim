import { describe, expect, it, test } from "vitest";
import {
  FOOT_MAX_SUSTAINED_KMH,
  finalMoveMode,
  moveMode,
  moveModeIcon,
  runMoveMode,
  tooFastOnFoot,
  tooFastForMode,
  DECLARED_MAX_KMH,
} from "./moveMode";

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

describe("tooFastOnFoot", () => {
  it("lets a fast runner through", () => {
    expect(tooFastOnFoot("foot", 7)).toBe(false);
    expect(tooFastOnFoot("foot", 21)).toBe(false);
    expect(tooFastOnFoot("foot", FOOT_MAX_SUSTAINED_KMH)).toBe(false);
  });
  it("stops a vehicle declared on foot", () => {
    // tebza, 22 Oct: 715 blocks "on foot" with a 73 km/h stretch.
    expect(tooFastOnFoot("foot", 73)).toBe(true);
    // kandie, 25 Oct: 442 km/h over the window.
    expect(tooFastOnFoot("foot", 442)).toBe(true);
    expect(tooFastOnFoot("foot", 26)).toBe(true);
  });
  it("applies only to foot, and only with a measurement", () => {
    expect(tooFastOnFoot("bike", 40)).toBe(false);
    expect(tooFastOnFoot("car", 120)).toBe(false);
    expect(tooFastOnFoot(null, 80)).toBe(false);
    expect(tooFastOnFoot("foot", null)).toBe(false);
    expect(tooFastOnFoot("foot", Number.NaN)).toBe(false);
  });
});

describe("finalMoveMode", () => {
  it("keeps the player's pick", () => {
    expect(finalMoveMode({ declared: "car", distanceMeters: 1802, durationSec: 441, maxSustainedKmh: 30 })).toEqual({ mode: "car", mismatch: false });
    expect(finalMoveMode({ declared: "horse", distanceMeters: 5000, durationSec: 1800, maxSustainedKmh: 20 })).toEqual({ mode: "horse", mismatch: false });
  });
  it("relabels a pick speed cannot believe by its speed, and flags it", () => {
    // 60 km/h average "on foot": a car, logged for review.
    expect(finalMoveMode({ declared: "foot", distanceMeters: 20000, durationSec: 1200, maxSustainedKmh: 70 })).toEqual({ mode: "car", mismatch: true });
    // kandie, 25 Oct: 3.9 km in one minute declared as a walk (229 km/h) reads as a train.
    expect(finalMoveMode({ declared: "foot", distanceMeters: 3866, durationSec: 61, maxSustainedKmh: 0 })).toEqual({ mode: "train", mismatch: true });
    // A flight declared as a walk still reaches the fast-travel watch.
    expect(finalMoveMode({ declared: "foot", distanceMeters: 400000, durationSec: 3600, maxSustainedKmh: 0 })).toEqual({ mode: "plane", mismatch: true });
    // A sustained motor stretch inside a short "walk" is a car, not a walk.
    expect(finalMoveMode({ declared: "foot", distanceMeters: 1000, durationSec: 600, maxSustainedKmh: 50 })).toEqual({ mode: "car", mismatch: true });
  });
  it("keeps a believable pick even when the average is low", () => {
    expect(finalMoveMode({ declared: "bus", distanceMeters: 7300, durationSec: 4440, maxSustainedKmh: 38 })).toEqual({ mode: "bus", mismatch: false });
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

describe("tooFastForMode", () => {
  it("lets realistic vehicle speeds through", () => {
    expect(tooFastForMode("car", 120)).toBe(false);
    // celovibe (156) and princessvalue (141), 21 and 25 Oct: fast, kept.
    expect(tooFastForMode("car", 156)).toBe(false);
    expect(tooFastForMode("car", DECLARED_MAX_KMH.car)).toBe(false);
    expect(tooFastForMode("bus", 137)).toBe(false);
    expect(tooFastForMode("moto", 200)).toBe(false);
    expect(tooFastForMode("bike", 39)).toBe(false);
    expect(tooFastForMode(null, 107)).toBe(false);
  });
  it("stops the GPS jumps seen in motor runs to 25 Oct", () => {
    // famoh, car, 299 km/h window inside a 96.8 km drive at 40 km/h.
    expect(tooFastForMode("car", 299)).toBe(true);
    // dilly, car, 269; duinsxl, bus, 324; dynamic and chief, moto, 266 and 259.
    expect(tooFastForMode("car", 269)).toBe(true);
    expect(tooFastForMode("bus", 324)).toBe(true);
    expect(tooFastForMode("moto", 266)).toBe(true);
    expect(tooFastForMode("moto", 259)).toBe(true);
    // No pick: the car ceiling applies.
    expect(tooFastForMode(null, 221)).toBe(true);
    expect(tooFastForMode(undefined, 200)).toBe(false);
  });
  it("leaves trains and planes to the airborne check", () => {
    expect(tooFastForMode("train", 240)).toBe(false);
    expect(tooFastForMode("train", 400)).toBe(false);
    expect(tooFastForMode("plane", 900)).toBe(false);
  });
  it("keeps the on-foot rule", () => {
    expect(tooFastForMode("foot", 25)).toBe(false);
    expect(tooFastForMode("foot", 26)).toBe(true);
    expect(tooFastOnFoot("car", 300)).toBe(false);
  });
});
