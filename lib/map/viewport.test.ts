import { describe, expect, it } from "vitest";
import { metersPerPixel } from "./mercator";
import { viewportFromCenter } from "./viewport";

const MEDELLIN: [number, number] = [-75.5636, 6.2518];
const size = { width: 400, height: 800 };

describe("viewportFromCenter", () => {
  it("keeps the centre it was given", () => {
    const v = viewportFromCenter(MEDELLIN, 16, size);
    expect(v.centerLng).toBe(MEDELLIN[0]);
    expect(v.centerLat).toBe(MEDELLIN[1]);
  });

  it("brackets the centre on all four sides", () => {
    const v = viewportFromCenter(MEDELLIN, 16, size);
    expect(v.bounds.west).toBeLessThan(MEDELLIN[0]);
    expect(v.bounds.east).toBeGreaterThan(MEDELLIN[0]);
    expect(v.bounds.south).toBeLessThan(MEDELLIN[1]);
    expect(v.bounds.north).toBeGreaterThan(MEDELLIN[1]);
  });

  it("spans the pixels the canvas actually has", () => {
    const zoom = 16;
    const v = viewportFromCenter(MEDELLIN, zoom, size);
    const mpp = metersPerPixel(MEDELLIN[1], zoom);
    const heightM = (v.bounds.north - v.bounds.south) * 111320;
    expect(heightM).toBeCloseTo(size.height * mpp, 0);
  });

  it("reaches the corner, not the edge, since the disk query takes a radius", () => {
    const v = viewportFromCenter(MEDELLIN, 16, size);
    const mpp = metersPerPixel(MEDELLIN[1], 16);
    const halfW = (size.width / 2) * mpp;
    const halfH = (size.height / 2) * mpp;
    expect(v.radiusM).toBeGreaterThan(Math.max(halfW, halfH));
    expect(v.radiusM).toBeCloseTo(Math.hypot(halfW, halfH), 6);
  });

  it("covers less ground as it zooms in", () => {
    const near = viewportFromCenter(MEDELLIN, 18, size);
    const far = viewportFromCenter(MEDELLIN, 14, size);
    expect(near.radiusM).toBeLessThan(far.radiusM);
  });

  it("spans the same longitude at any latitude, as Mercator requires", () => {
    // A screen of fixed pixel width covers the same longitude range anywhere,
    // which is why the ground distance it covers shrinks toward the poles.
    const equator = viewportFromCenter([0, 0], 16, size);
    const north = viewportFromCenter([0, 60], 16, size);
    const span = (v: ReturnType<typeof viewportFromCenter>) => v.bounds.east - v.bounds.west;
    expect(span(north)).toBeCloseTo(span(equator), 9);
    expect(north.radiusM).toBeLessThan(equator.radiusM);
  });

  it("stays finite at the pole instead of spanning the world", () => {
    const v = viewportFromCenter([0, 89.9], 16, size);
    expect(Number.isFinite(v.bounds.east)).toBe(true);
    expect(v.bounds.east - v.bounds.west).toBeLessThan(360);
  });
});
