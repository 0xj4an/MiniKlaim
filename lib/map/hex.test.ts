import { describe, expect, test } from "vitest";
import { latLngToCell } from "h3-js";
import { interpolateHexIds } from "./hex";

// H3 res 12 = ~9.4 m edge, ~19 m diameter. All fixture points are around
// Medellín so the meters-per-degree factor stays consistent with production
// use. Distances are back-of-the-envelope, computed against the equator
// approximation used by the function itself.

const MDE_LAT = 6.2529;
const MDE_LNG = -75.5646;
const RES = 12;

describe("interpolateHexIds", () => {
  test("returns empty for identical from/to", () => {
    expect(interpolateHexIds(MDE_LAT, MDE_LNG, MDE_LAT, MDE_LNG, RES)).toEqual(
      [],
    );
  });

  test("returns empty for sub-step movement inside the same cell", () => {
    // ~1m north — well below the 5m default step, stays in the same cell.
    const tinyLat = MDE_LAT + 0.000009;
    expect(interpolateHexIds(MDE_LAT, MDE_LNG, tinyLat, MDE_LNG, RES)).toEqual(
      [],
    );
  });

  test("returns a single endpoint cell for one-hex movement", () => {
    // ~25m east: crosses out of the starting cell into exactly the next.
    const nextLng = MDE_LNG + 0.000225;
    const out = interpolateHexIds(MDE_LAT, MDE_LNG, MDE_LAT, nextLng, RES);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[out.length - 1]).toBe(latLngToCell(MDE_LAT, nextLng, RES));
    // The starting cell must never appear in the output.
    expect(out).not.toContain(latLngToCell(MDE_LAT, MDE_LNG, RES));
  });

  test("captures a chain of cells across a ~200m dash (fast-run speed)", () => {
    // ~200m north (roughly 0.0018 deg lat). At res 12 (~19m diameter) this
    // should walk ~10 cells.
    const farLat = MDE_LAT + 0.0018;
    const out = interpolateHexIds(MDE_LAT, MDE_LNG, farLat, MDE_LNG, RES);
    expect(out.length).toBeGreaterThan(5);
    expect(out.length).toBeLessThan(20);
    // Ordered path: no duplicates.
    expect(new Set(out).size).toBe(out.length);
    // Endpoint is the last element.
    expect(out[out.length - 1]).toBe(latLngToCell(farLat, MDE_LNG, RES));
  });

  test("caps at 500 samples for absurd segments (runaway guard)", () => {
    // ~2.5 km east of MDE. Would produce ~500+ raw samples if uncapped.
    const wayLng = MDE_LNG + 0.0225;
    const out = interpolateHexIds(MDE_LAT, MDE_LNG, MDE_LAT, wayLng, RES);
    // Unique H3 cells returned is bounded by the step count (500),
    // typically fewer after dedup. The important property is: no throw,
    // finite output.
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.length).toBeGreaterThan(0);
  });

  test("stepMeters override changes sampling density", () => {
    const farLat = MDE_LAT + 0.0009; // ~100 m
    const dense = interpolateHexIds(
      MDE_LAT,
      MDE_LNG,
      farLat,
      MDE_LNG,
      RES,
      1,
    );
    const sparse = interpolateHexIds(
      MDE_LAT,
      MDE_LNG,
      farLat,
      MDE_LNG,
      RES,
      50,
    );
    // Fewer samples => at most as many unique cells (usually fewer).
    expect(sparse.length).toBeLessThanOrEqual(dense.length);
    // Both agree on the endpoint.
    expect(dense[dense.length - 1]).toBe(latLngToCell(farLat, MDE_LNG, RES));
    expect(sparse[sparse.length - 1]).toBe(latLngToCell(farLat, MDE_LNG, RES));
  });
});
