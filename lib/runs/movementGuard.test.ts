import { describe, expect, it } from "vitest";
import { gridDisk, latLngToCell } from "h3-js";
import {
  checkChain,
  hexDistanceMeters,
  airborneStep,
  type AirState,
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
  const surcin = latLngToCell(44.8, 20.28, 12);
  const at = new Date("2026-10-13T15:25:00Z");

  it("allows a new run after a flight (13 Oct: Belgrade to Partizánske, 40 min)", () => {
    const partizanske = latLngToCell(48.63, 18.38, 12);
    const now = new Date(at.getTime() + 40 * 60_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: partizanske })).toBe(true);
  });

  it("rejects a jump no plane could make (Belgrade to Bogotá in an hour)", () => {
    const bogota = latLngToCell(4.71, -74.07, 12);
    const now = new Date(at.getTime() + 60 * 60_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: bogota })).toBe(false);
  });

  it("allows a nearby start right away", () => {
    const now = new Date(at.getTime() + 30_000);
    expect(reachableFromPrevious({ prevH3: surcin, prevAt: at, now, firstH3: surcin })).toBe(true);
  });

  it("allows anything when there is no previous capture", () => {
    const now = new Date(at.getTime() + 1000);
    expect(reachableFromPrevious({ prevH3: null, prevAt: null, now, firstH3: surcin })).toBe(true);
  });
});

describe("fast travel", () => {
  // A straight line of hexes north, ~one hex apart, claimed in one batch.
  const line = (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(latLngToCell(59 + i * 0.00015, 17, 12));
    return Array.from(new Set(out));
  };
  const at = new Date("2026-10-13T20:00:00Z");

  it("accepts a car at 110 km/h on a highway", () => {
    const hexes = line(200); // ~3.3 km
    const now = new Date(at.getTime() + 120_000);
    const res = checkChain({ lastH3: hexes[0], lastAt: at, now, hexes: hexes.slice(1) });
    expect(res.rejected).toHaveLength(0);
  });

  it("accepts a train at 170 km/h on a straight track", () => {
    const hexes = line(200); // ~3.3 km
    const now = new Date(at.getTime() + 70_000);
    const res = checkChain({ lastH3: hexes[0], lastAt: at, now, hexes: hexes.slice(1) });
    expect(res.rejected).toHaveLength(0);
  });

  it("rejects faster than a plane", () => {
    const hexes = line(200); // ~3.3 km in 5 s = ~2,400 km/h
    const now = new Date(at.getTime() + 5_000);
    const res = checkChain({ lastH3: hexes[0], lastAt: at, now, hexes: hexes.slice(1) });
    expect(res.rejected.length).toBeGreaterThan(0);
  });

  it("rejects a fast zigzag cloud even within plane speed", () => {
    // 40 hexes around one spot in 2 s. Plane speed would allow ~840 m of
    // path, but the path is not straight, so only road speed counts.
    const centre = latLngToCell(59, 17, 12);
    const cloud = gridDisk(centre, 4).slice(1, 41);
    const now = new Date(at.getTime() + 2_000);
    const res = checkChain({ lastH3: centre, lastAt: at, now, hexes: cloud });
    expect(res.accepted.length).toBeLessThanOrEqual(15);
    expect(res.rejected.length).toBeGreaterThan(25);
  });
});

describe("airborneStep", () => {
  const at = new Date("2026-10-18T03:40:00Z");
  const sec = (s: number) => new Date(at.getTime() + s * 1000);
  // A point `km` east of Medellín's centre along a straight line.
  const east = (km: number) => latLngToCell(6.2442, -75.5812 + km / 110.6, RES);
  const none: AirState = { anchorH3: null, anchorAt: null, airborne: false };

  /** Feed batches (seconds since start, km travelled) and return the states. */
  function ride(batches: Array<[number, number]>) {
    let state = none;
    return batches.map(([s, km]) => {
      state = airborneStep({ state, endH3: east(km), now: sec(s) });
      return state;
    });
  }

  it("the first batch anchors the window and captures", () => {
    const res = airborneStep({ state: none, endH3: east(0), now: at });
    expect(res.airborne).toBe(false);
    expect(res.anchorH3).toBe(east(0));
  });

  it("a car at 60 km/h whose GPS fixes arrive in bursts still captures (18 Oct)", () => {
    // Batches land 1.2 s apart by server clock but carry ~15 s of driving.
    // Per-batch speed read this as 823 km/h; over the window it is ~60.
    const batches: Array<[number, number]> = [];
    let km = 0;
    for (let s = 0; s <= 300; s += 16) {
      batches.push([s, km]);
      batches.push([s + 1.2, km + 0.27]);
      km += 0.27;
    }
    expect(ride(batches).every((st) => !st.airborne)).toBe(true);
  });

  it("a car at 130 km/h on the highway captures", () => {
    const states = ride(Array.from({ length: 80 }, (_, i) => [i * 2.5, (i * 2.5 * 130) / 3600]));
    expect(states.every((st) => !st.airborne)).toBe(true);
  });

  it("a train at 200 km/h captures", () => {
    const states = ride(Array.from({ length: 80 }, (_, i) => [i * 2.5, (i * 2.5 * 200) / 3600]));
    expect(states.every((st) => !st.airborne)).toBe(true);
  });

  it("a plane at cruise is airborne once the window fills, and stays so", () => {
    const states = ride(Array.from({ length: 80 }, (_, i) => [i * 2.5, (i * 2.5 * 800) / 3600]));
    const firstAir = states.findIndex((st) => st.airborne);
    // Detected within the first 30 s window (12 batches of 2.5 s).
    expect(firstAir).toBeGreaterThan(0);
    expect(firstAir).toBeLessThanOrEqual(12);
    expect(states.slice(firstAir).every((st) => st.airborne)).toBe(true);
  });

  it("a GPS jump of a few hundred metres does not ground a walk", () => {
    const batches: Array<[number, number]> = Array.from({ length: 40 }, (_, i) => [i * 2.5, (i * 2.5 * 5) / 3600]);
    batches.splice(20, 0, [50.1, 0.5]); // one fix 400 m off
    expect(ride(batches).every((st) => !st.airborne)).toBe(true);
  });

  it("moves the anchor once the window passes the reset", () => {
    const states = ride([[0, 0], [95, 1]]);
    expect(states[1].anchorH3).toBe(east(1));
  });

  it("holds the decision between measurements", () => {
    const held = airborneStep({
      state: { anchorH3: east(0), anchorAt: at, airborne: true },
      endH3: east(0.1),
      now: sec(5),
    });
    expect(held.airborne).toBe(true);
    expect(held.kmh).toBeNull();
  });

  it("measures sustained path speed for the run's label", () => {
    let state: AirState = none;
    state = airborneStep({ state, endH3: east(0), now: sec(0), pathMeters: 0 });
    const next = airborneStep({ state, endH3: east(0.5), now: sec(36), pathMeters: 520 });
    expect(next.pathKmh).toBeCloseTo(52, 0);
    expect(next.airborne).toBe(false);
  });
});
