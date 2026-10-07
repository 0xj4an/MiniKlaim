import { describe, expect, it } from "vitest";
import { liveGeoSource } from "./liveSource";

describe("liveGeoSource", () => {
  it("returns null when the map style is already gone", () => {
    const map = {
      getSource() {
        throw new TypeError(
          "Cannot read properties of null (reading 'getSource')",
        );
      },
    };
    expect(liveGeoSource(map as never, "hexes")).toBeNull();
  });

  it("returns a geojson source", () => {
    const source = { type: "geojson", setData() {} };
    const map = { getSource: () => source };
    expect(liveGeoSource(map as never, "hexes")).toBe(source);
  });
});
