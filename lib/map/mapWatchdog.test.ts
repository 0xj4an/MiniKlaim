import { describe, expect, it } from "vitest";
import { isStalled, MAP_STALL_MS, stalledStage } from "./mapWatchdog";

describe("isStalled", () => {
  it("leaves a map alone while it is still within the budget", () => {
    // On the throttled runs a map was interactive inside 2 s, so these are
    // ordinary, not stuck.
    expect(isStalled(0, 1_000)).toBe(false);
    expect(isStalled(0, MAP_STALL_MS - 1)).toBe(false);
  });

  it("reports a map still blank at the threshold", () => {
    expect(isStalled(0, MAP_STALL_MS)).toBe(true);
    expect(isStalled(0, MAP_STALL_MS + 60_000)).toBe(true);
  });

  it("does not report a clock that went backwards", () => {
    // Phones adjust their clock mid-session; a negative age is not a stall.
    expect(isStalled(10_000, 0)).toBe(false);
  });
});

describe("stalledStage", () => {
  it("blames the step after the last one that completed", () => {
    expect(stalledStage("import")).toBe("construct");
    expect(stalledStage("construct")).toBe("style");
    expect(stalledStage("style")).toBe("draw");
    expect(stalledStage("draw")).toBe("draw");
  });

  it("blames the import when nothing completed at all", () => {
    // Nothing happened, so the bundle never arrived: the case a player on a
    // weak connection actually hits.
    expect(stalledStage(null)).toBe("import");
  });
});
