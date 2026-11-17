import { describe, expect, it } from "vitest";
import {
  distanceLabel,
  durationLabel,
  placeLabel,
  speedLabel,
  statsLine,
} from "./runCard";

describe("run card labels", () => {
  it("writes distances in meters, then kilometers", () => {
    expect(distanceLabel(187)).toBe("187 m");
    expect(distanceLabel(1973)).toBe("1.97 km");
    expect(distanceLabel(256_678)).toBe("256.7 km");
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
  it("gives an average speed only when the run is long enough for one", () => {
    expect(speedLabel({ durationSec: 119, distanceMeters: 1973 })).toBe("59.7 km/h");
    expect(speedLabel({ durationSec: 16_656, distanceMeters: 256_678 })).toBe("55.5 km/h");
    expect(speedLabel({ durationSec: 5, distanceMeters: 6 })).toBe("");
    expect(speedLabel({ durationSec: 600, distanceMeters: 0 })).toBe("");
  });
});
