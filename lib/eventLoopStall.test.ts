import { describe, expect, test } from "vitest";
import { STALL_WARN_MS, gcWindow, stallReport } from "@/lib/eventLoopStall";

const ms = (n: number) => n * 1e6;

describe("stallReport", () => {
  test("says nothing about an ordinary window", () => {
    expect(stallReport({ max: ms(40), p99: ms(25), mean: ms(21) })).toBeNull();
  });

  test("reports a window where the process froze", () => {
    expect(stallReport({ max: ms(4_200), p99: ms(310), mean: ms(24.4) })).toEqual({
      maxMs: 4200,
      p99Ms: 310,
      meanMs: 24,
    });
  });

  test("starts exactly at the threshold", () => {
    expect(stallReport({ max: ms(STALL_WARN_MS - 1), p99: 0, mean: 0 })).toBeNull();
    expect(stallReport({ max: ms(STALL_WARN_MS), p99: 0, mean: 0 })).not.toBeNull();
  });

  // An empty histogram reports NaN for mean and percentiles.
  test("does not log NaN from an empty window", () => {
    expect(stallReport({ max: Number.NaN, p99: Number.NaN, mean: Number.NaN })).toBeNull();
    expect(stallReport({ max: ms(2_000), p99: Number.NaN, mean: Number.NaN })).toEqual({
      maxMs: 2000,
      p99Ms: 0,
      meanMs: 0,
    });
  });
});

describe("gcWindow", () => {
  test("keeps the longest collection and its kind, and starts over when read", () => {
    const w = gcWindow();
    w.add(12.4, 1);
    w.add(1830.2, 2);
    w.add(40, 4);
    expect(w.take()).toEqual({ maxMs: 1830, totalMs: 1883, kind: "major", count: 3 });
    expect(w.take()).toEqual({ maxMs: 0, totalMs: 0, kind: "none", count: 0 });
  });

  test("names a kind it does not know instead of dropping it", () => {
    const w = gcWindow();
    w.add(5, 64);
    expect(w.take().kind).toBe("other");
  });
});
