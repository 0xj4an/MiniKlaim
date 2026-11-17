import { describe, expect, it } from "vitest";
import {
  BACKOFF_DEFAULT_S,
  backoffSeconds,
  mapRunProps,
  newMapRunStats,
  noteZoom,
} from "./refreshBackoff";

describe("backoffSeconds", () => {
  it("waits as long as the server asks", () => {
    expect(backoffSeconds(429, "37")).toBe(37);
    expect(backoffSeconds(429, " 12 ")).toBe(12);
  });

  it("falls back when the header is missing or is not a number", () => {
    expect(backoffSeconds(429, null)).toBe(BACKOFF_DEFAULT_S);
    expect(backoffSeconds(429, "soon")).toBe(BACKOFF_DEFAULT_S);
    expect(backoffSeconds(429, "0")).toBe(BACKOFF_DEFAULT_S);
    expect(backoffSeconds(504, null)).toBe(BACKOFF_DEFAULT_S);
  });

  it("never stops the map for less than 5 s or more than a minute", () => {
    expect(backoffSeconds(429, "1")).toBe(5);
    expect(backoffSeconds(429, "86400")).toBe(60);
  });

  it("backs off from a restarting server too", () => {
    for (const status of [502, 503, 504]) {
      expect(backoffSeconds(status, null)).toBe(BACKOFF_DEFAULT_S);
    }
  });

  it("does not back off from an answer that is not about load", () => {
    for (const status of [400, 401, 403, 404, 500]) {
      expect(backoffSeconds(status, "30")).toBeNull();
    }
  });
});

describe("map run stats", () => {
  it("keeps the furthest and the closest zoom", () => {
    const stats = newMapRunStats();
    for (const z of [17, 9.26, 14, 18.04]) noteZoom(stats, z);
    noteZoom(stats, NaN);
    expect(stats.minZoom).toBe(9.26);
    expect(stats.maxZoom).toBe(18.04);
  });

  it("leaves the zooms out of the event when the map never moved", () => {
    const props = mapRunProps(newMapRunStats());
    expect("map_min_zoom" in props).toBe(false);
    expect("map_max_zoom" in props).toBe(false);
    expect(props.map_dot_paints).toBe(0);
  });

  it("rounds what it sends", () => {
    const stats = newMapRunStats();
    noteZoom(stats, 9.26);
    stats.slowestPaintMs = 41.7;
    const props = mapRunProps(stats);
    expect(props.map_min_zoom).toBe(9.3);
    expect(props.map_slowest_paint_ms).toBe(42);
  });
});
