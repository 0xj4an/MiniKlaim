import { describe, expect, test } from "vitest";
import { cellToLatLng, latLngToCell } from "h3-js";
import {
  diskCoversView,
  diskKForRadius,
  diskRadiusMeters,
  hexesInBounds,
  mergeHexes,
  placeHexes,
  rememberOwners,
  viewportNeedsWorld,
} from "./claimedView";

const MDE_LAT = 6.2529;
const MDE_LNG = -75.5646;

describe("claimed view", () => {
  test("a follow-zoom screen stays on the near disk", () => {
    expect(viewportNeedsWorld(400)).toBe(false);
    expect(diskKForRadius(400)).toBeLessThanOrEqual(60);
    expect(diskRadiusMeters(diskKForRadius(400))).toBeGreaterThanOrEqual(400);
  });

  test("a city zoom is wider than the disk cap", () => {
    expect(viewportNeedsWorld(7000)).toBe(true);
    expect(diskKForRadius(7000)).toBe(60);
  });

  test("keeps hexes inside the screen and drops the rest", () => {
    const here = latLngToCell(MDE_LAT, MDE_LNG, 12);
    const away = latLngToCell(MDE_LAT + 0.2, MDE_LNG, 12);
    const [lat, lng] = cellToLatLng(here);
    const rows = placeHexes([
      { h3: here, owner: "0xabc", ownerUsername: null },
      { h3: away, owner: "0xdef", ownerUsername: null },
    ]);
    const visible = hexesInBounds(rows, {
      west: lng - 0.01,
      east: lng + 0.01,
      south: lat - 0.01,
      north: lat + 0.01,
    });
    expect(visible.map((row) => row.h3)).toEqual([here]);
  });

  test("a fresh claim replaces the cached owner", () => {
    const h3 = latLngToCell(MDE_LAT, MDE_LNG, 12);
    const [lat, lng] = cellToLatLng(h3);
    const oldRow = { h3, owner: "0xold", ownerUsername: null, lat, lng };
    const next = { h3, owner: "0xnew", ownerUsername: "ada", lat, lng };
    expect(mergeHexes([oldRow], [next])).toEqual([next]);
  });

  test("a loaded disk covers a small pan and not a zoom out", () => {
    expect(diskCoversView(MDE_LAT, MDE_LNG, 900, MDE_LAT, MDE_LNG, 400)).toBe(
      true,
    );
    expect(diskCoversView(MDE_LAT, MDE_LNG, 900, MDE_LAT, MDE_LNG, 2000)).toBe(
      false,
    );
  });

  test("a painted hex of someone else is no longer treated as ours", () => {
    const owned = new Set(["mine", "stolen"]);
    const me = new Set(["0xme"]);
    rememberOwners(
      owned,
      [
        { h3: "mine", owner: "0xME", ownerUsername: null },
        { h3: "stolen", owner: "0xother", ownerUsername: null },
        { h3: "theirs", owner: "0xother", ownerUsername: null },
      ],
      me,
    );
    expect(Array.from(owned).sort()).toEqual(["mine"]);
  });
});
