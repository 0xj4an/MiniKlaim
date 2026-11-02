import { describe, expect, it } from "vitest";
import {
  clampLatitude,
  metersPerPixel,
  project,
  toWorld,
  worldSize,
  zoomForSpan,
  MAX_LATITUDE,
} from "./mercator";

const size = { width: 400, height: 800 };

describe("toWorld", () => {
  it("puts the null island at the middle of the world", () => {
    const w = worldSize(0);
    expect(toWorld([0, 0], 0)).toEqual({ x: w / 2, y: w / 2 });
  });

  it("puts the antimeridian at the edges", () => {
    const w = worldSize(0);
    expect(toWorld([-180, 0], 0).x).toBeCloseTo(0, 6);
    expect(toWorld([180, 0], 0).x).toBeCloseTo(w, 6);
  });

  it("grows y downward as latitude falls", () => {
    expect(toWorld([0, 10], 4).y).toBeLessThan(toWorld([0, -10], 4).y);
  });

  it("clamps past the Mercator limit instead of returning infinity", () => {
    expect(clampLatitude(89.9)).toBe(MAX_LATITUDE);
    expect(Number.isFinite(toWorld([0, 90], 4).y)).toBe(true);
  });

  it("doubles the world with each zoom level", () => {
    expect(worldSize(1)).toBe(worldSize(0) * 2);
    expect(worldSize(10)).toBe(512 * 1024);
  });
});

describe("project", () => {
  it("draws the centre at the centre of the canvas", () => {
    const center: [number, number] = [-75.5636, 6.2518]; // Medellin
    expect(project(center, center, 15, size)).toEqual({ x: 200, y: 400 });
  });

  it("places east to the right and north above", () => {
    const center: [number, number] = [-75.5636, 6.2518];
    const east = project([-75.5536, 6.2518], center, 15, size);
    const north = project([-75.5636, 6.2618], center, 15, size);
    expect(east.x).toBeGreaterThan(200);
    expect(east.y).toBeCloseTo(400, 4);
    expect(north.y).toBeLessThan(400);
    expect(north.x).toBeCloseTo(200, 4);
  });

  it("returns points outside the canvas rather than clamping them", () => {
    // A hex half off the edge still has to be drawn, so clipping belongs to
    // the canvas and not here.
    const far = project([-74, 6.2518], [-75.5636, 6.2518], 15, size);
    expect(far.x).toBeGreaterThan(size.width);
  });
});

describe("metersPerPixel", () => {
  it("matches the known value at the equator and zoom 0", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
  });

  it("halves with every zoom level", () => {
    expect(metersPerPixel(0, 11)).toBeCloseTo(metersPerPixel(0, 10) / 2, 6);
  });

  it("shrinks away from the equator", () => {
    expect(metersPerPixel(60, 12)).toBeLessThan(metersPerPixel(0, 12));
  });
});

describe("zoomForSpan", () => {
  it("fits the span in the shorter side", () => {
    const zoom = zoomForSpan(1000, 6.25, size);
    const across = metersPerPixel(6.25, zoom) * Math.min(size.width, size.height);
    expect(across).toBeCloseTo(1000, 0);
  });

  it("zooms in for a tighter span", () => {
    expect(zoomForSpan(200, 6.25, size)).toBeGreaterThan(zoomForSpan(2000, 6.25, size));
  });

  it("stays inside the legible range", () => {
    expect(zoomForSpan(40_000_000, 0, size)).toBe(2);
    expect(zoomForSpan(0.5, 0, size)).toBe(17);
  });

  it("falls back to the closest zoom for a run that has not moved", () => {
    // A single captured hex has no span, and a zoom of Infinity would draw
    // nothing at all.
    expect(zoomForSpan(0, 6.25, size)).toBe(17);
  });
});
