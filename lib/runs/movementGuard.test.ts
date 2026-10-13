import { describe, expect, it } from "vitest";
import { gridDisk, latLngToCell } from "h3-js";
import {
  checkChain,
  hexDistanceMeters,
  pathFitsReported,
  reachableFromPrevious,
} from "@/lib/runs/movementGuard";

const RES = 12;
// A walk east along a street in Medellín, one hex per ~20 m.
const walk = Array.from({ length: 30 }, (_, i) =>
  latLngToCell(6.2442, -75.5812 + i * 0.00018, RES),
).filter((h, i, a) => a.indexOf(h) === i);
const t0 = new Date("2026-10-13T10:00:00Z");
const after = (s: number) => new Date(t0.getTime() + s * 1000);

describe("checkChain", () => {
  it("accepts a walk at walking speed", () => {
    const meters = walk
      .slice(1)
      .reduce((m, h, i) => m + hexDistanceMeters(walk[i], h), 0);
    // ~1.4 m/s
    const r = checkChain({ lastH3: walk[0], lastAt: t0, now: after(meters / 1.4), hexes: walk.slice(1) });
    expect(r.rejected).toEqual([]);
    expect(r.endH3).toBe(walk[walk.length - 1]);
  });

  it("accepts a car at 120 km/h", () => {
    const meters = hexDistanceMeters(walk[0], walk[walk.length - 1]);
    const r = checkChain({ lastH3: walk[0], lastAt: t0, now: after(meters / 33), hexes: walk.slice(1) });
    expect(r.rejected).toEqual([]);
  });

  it("rejects hexes claimed without the time to reach them", () => {
    const far = latLngToCell(6.2442, -75.55, RES); // ~3.5 km east
    const r = checkChain({ lastH3: walk[0], lastAt: t0, now: after(5), hexes: [walk[1], far, walk[2]] });
    expect(r.accepted).toEqual([walk[1]]);
    expect(r.rejected).toEqual([far, walk[2]]);
    expect(r.endH3).toBe(walk[1]);
  });

  it("rejects a cloud of hexes around a player standing still", () => {
    const cloud = gridDisk(walk[0], 6).slice(1, 60);
    const r = checkChain({ lastH3: walk[0], lastAt: t0, now: after(1), hexes: cloud });
    expect(r.accepted.length).toBeLessThanOrEqual(12);
    expect(r.rejected.length).toBeGreaterThan(45);
  });

  it("lets the first hex of a run anchor anywhere", () => {
    const r = checkChain({ lastH3: null, lastAt: t0, now: after(1), hexes: [walk[5]] });
    expect(r.accepted).toEqual([walk[5]]);
  });

  it("rejects invalid cells", () => {
    const r = checkChain({ lastH3: null, lastAt: t0, now: after(1), hexes: ["nope"] });
    expect(r.rejected).toEqual(["nope"]);
  });
});

describe("pathFitsReported", () => {
  it("allows the hex path to run longer than the GPS path within limits", () => {
    expect(pathFitsReported(1500, 1000)).toBe(true);
    expect(pathFitsReported(250, 0)).toBe(true);
  });
  it("rejects a path of blocks with almost no reported movement", () => {
    // 13 Oct: 122 blocks with 2 m reported.
    expect(pathFitsReported(2400, 2)).toBe(false);
  });
});

describe("reachableFromPrevious", () => {
  // Real case, 13 Oct: Surčin (Belgrade) at 15:25, then Vrdnik 58 km away 2 min later.
  const surcin = latLngToCell(44.8, 20.28, 12);
  const vrdnik = latLngToCell(45.12, 19.79, 12);
  const at = new Date("2026-10-13T15:25:00Z");

  it("rejects a new run that starts far beyond road speed from the last one", () => {
    const now = new Date(at.getTime() + 2 * 60_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: vrdnik })).toBe(false);
  });

  it("allows the same place after enough time to drive there", () => {
    const now = new Date(at.getTime() + 60 * 60_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: vrdnik })).toBe(true);
  });

  it("allows a nearby start right away", () => {
    const now = new Date(at.getTime() + 30_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: surcin })).toBe(true);
  });

  it("allows anything when there is no previous capture", () => {
    expect(reachableFromPrevious({ prevH3: null, prevAt: null, now: at, firstH3: vrdnik })).toBe(true);
  });
});
