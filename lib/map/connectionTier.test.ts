import { describe, expect, it } from "vitest";
import { isSlowConnection } from "./connectionTier";

describe("isSlowConnection", () => {
  it("sends 2g and slow-2g to the canvas", () => {
    // 290 KB of MapLibre on these links is the case that went from never
    // loading to never loading.
    expect(isSlowConnection({ effectiveType: "slow-2g" })).toBe(true);
    expect(isSlowConnection({ effectiveType: "2g" })).toBe(true);
  });

  it("leaves 3g and better on the real map", () => {
    // Measured: slow 3G finishes /run in 17 s. Slow, but a map, and taking
    // the basemap away from this group would be a downgrade for most players.
    expect(isSlowConnection({ effectiveType: "3g" })).toBe(false);
    expect(isSlowConnection({ effectiveType: "4g" })).toBe(false);
  });

  it("honours Data Saver whatever the speed says", () => {
    expect(isSlowConnection({ effectiveType: "4g", saveData: true })).toBe(
      true,
    );
  });

  it("uses downlink only when it is a real number above zero", () => {
    expect(isSlowConnection({ downlink: 0.05 })).toBe(true);
    expect(isSlowConnection({ downlink: 1.5 })).toBe(false);
    // Some browsers report 0 for "unknown", which is not a dead link.
    expect(isSlowConnection({ downlink: 0 })).toBe(false);
    expect(isSlowConnection({ downlink: Number.NaN })).toBe(false);
  });

  it("assumes a usable connection when the browser says nothing", () => {
    // Safari and Firefox do not implement the API, which is most of iOS. The
    // default has to be the full map, or every iPhone would get the canvas.
    expect(isSlowConnection(null)).toBe(false);
    expect(isSlowConnection({})).toBe(false);
  });
});
