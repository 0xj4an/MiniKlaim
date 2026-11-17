import { describe, expect, it } from "vitest";
import { distanceLabel, durationLabel, placeLabel, statsLine } from "./runCard";

describe("run card labels", () => {
  it("writes distances in meters, then kilometers", () => {
    expect(distanceLabel(187)).toBe("187 m");
    expect(distanceLabel(1973)).toBe("1.97 km");
  });
  it("writes durations as mm:ss, and h:mm:ss past the hour", () => {
    expect(durationLabel(119)).toBe("01:59");
    expect(durationLabel(3909)).toBe("1:05:09");
  });
  it("leaves the distance out for a block captured standing still", () => {
    expect(statsLine({ durationSec: 12, distanceMeters: 0 })).toBe("00:12");
    expect(statsLine({ durationSec: 119, distanceMeters: 1973 })).toBe("01:59 - 1.97 km");
  });
  it("names the country instead of printing its code", () => {
    expect(placeLabel("Nteje", "NGA")).toBe("Nteje, Nigeria");
    expect(placeLabel("Medellín", "COL", "es")).toBe("Medellín, Colombia");
    expect(placeLabel(null, "NGA")).toBe("Nigeria");
    expect(placeLabel(null, null)).toBe("");
    expect(placeLabel("Somewhere", "ZZZ")).toBe("Somewhere, ZZZ");
  });
});
