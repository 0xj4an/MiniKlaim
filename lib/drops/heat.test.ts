import { gridDisk, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { cellMeters, heatFor, heatLevel, heatOrigin } from "@/lib/drops/heat";

// Test spots in Medellin, never the pilot ones: this repo is public.
const PLAZA = latLngToCell(6.2087, -75.5677, 12);
const PARK = latLngToCell(6.2518, -75.5636, 12);

describe("heat", () => {
  it("maps metres to coarse levels", () => {
    expect(heatLevel(0)).toBe(3);
    expect(heatLevel(60)).toBe(3);
    expect(heatLevel(61)).toBe(2);
    expect(heatLevel(200)).toBe(2);
    expect(heatLevel(599)).toBe(1);
    expect(heatLevel(601)).toBe(0);
    expect(heatLevel(Number.NaN)).toBe(0);
  });

  it("the hottest level covers more than the drop's own ring", () => {
    const ring2 = gridDisk(PLAZA, 2).filter((c) => cellMeters(c, PLAZA) > 20);
    for (const c of ring2) expect(heatLevel(cellMeters(c, PLAZA))).toBe(3);
  });

  it("picks the nearest drop and returns null when all are far", () => {
    const drops = [
      { h3: PARK, id: "park" },
      { h3: PLAZA, id: "plaza" },
    ];
    expect(heatFor(PLAZA, drops)).toEqual({ drop: drops[1], level: 3 });
    const far = latLngToCell(6.3, -75.6, 12);
    expect(heatFor(far, drops)).toBeNull();
    expect(heatFor(PLAZA, [])).toBeNull();
  });

  it("uses the phone's cell only near the run's last accepted block", () => {
    const near = latLngToCell(6.2087 + 150 / 111320, -75.5677, 12);
    const far = latLngToCell(6.2087 + 900 / 111320, -75.5677, 12);
    expect(heatOrigin(PLAZA, near)).toBe(near);
    expect(heatOrigin(PLAZA, far)).toBe(PLAZA);
    expect(heatOrigin(PLAZA, null)).toBe(PLAZA);
  });
});
