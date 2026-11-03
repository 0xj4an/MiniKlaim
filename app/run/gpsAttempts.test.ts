import { describe, expect, it } from "vitest";
import { COARSE_FIX, FINE_FIX, GEO_CODE, nextFixAttempt } from "./gpsAttempts";

describe("nextFixAttempt", () => {
  it("falls back to a coarse fix when the GPS chip runs out of time", () => {
    // The case a player sent a screenshot of: Start greyed out behind "GPS
    // didn't arrive", with the map drawn and centred on their own blocks.
    expect(nextFixAttempt(GEO_CODE.timeout, FINE_FIX)).toBe(COARSE_FIX);
  });

  it("falls back when the position is unavailable, which is often the chip", () => {
    expect(nextFixAttempt(GEO_CODE.positionUnavailable, FINE_FIX)).toBe(
      COARSE_FIX,
    );
  });

  it("does not retry a denial, because the browser will not prompt again", () => {
    expect(nextFixAttempt(GEO_CODE.permissionDenied, FINE_FIX)).toBeNull();
  });

  it("stops after the coarse attempt, whatever failed", () => {
    for (const code of Object.values(GEO_CODE)) {
      expect(nextFixAttempt(code, COARSE_FIX)).toBeNull();
    }
  });

  it("stops on a code the spec does not define rather than looping", () => {
    expect(nextFixAttempt(99, FINE_FIX)).toBeNull();
  });

  it("asks the network provider, and waits longer, on the last attempt", () => {
    expect(FINE_FIX.enableHighAccuracy).toBe(true);
    expect(COARSE_FIX.enableHighAccuracy).toBe(false);
    expect(COARSE_FIX.timeout).toBeGreaterThan(FINE_FIX.timeout!);
    // A fix the browser already holds beats another wait.
    expect(COARSE_FIX.maximumAge).toBeGreaterThan(FINE_FIX.maximumAge!);
  });
});
