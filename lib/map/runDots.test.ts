import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { thinForDots, toPointCollection } from "./runDots";

const cell = (lat: number, lng: number) => latLngToCell(lat, lng, 12);
const row = (h3: string, owner = "0xa") => ({ h3, owner });

describe("thinForDots", () => {
  // About 330 blocks around one corner of Medellin, some 350 m across.
  const city = gridDisk(cell(6.2518, -75.5636), 10).map((h) => row(h));

  it("keeps every dot on a real block", () => {
    const ids = new Set(city.map((r) => r.h3));
    for (const kept of thinForDots(city, 10, () => 0)) {
      expect(ids.has(kept.h3)).toBe(true);
    }
  });

  it("draws fewer dots the further out the map is", () => {
    const near = thinForDots(city, 13, () => 0).length;
    const far = thinForDots(city, 8, () => 0).length;
    expect(near).toBeLessThan(city.length);
    expect(far).toBeLessThan(near);
    expect(far).toBe(1);
  });

  it("lets the block the map most wants to show win its patch", () => {
    const mine = row(city[40].h3, "0xmine");
    const rows = [...city.slice(0, 40), mine, ...city.slice(41)];
    const out = thinForDots(rows, 8, (r) => (r.owner === "0xmine" ? 2 : 0));
    expect(out).toEqual([mine]);
  });

  it("gives the same dots whatever order the rows came in", () => {
    const a = thinForDots(city, 12, () => 0).map((r) => r.h3).sort();
    const b = thinForDots([...city].reverse(), 12, () => 0)
      .map((r) => r.h3)
      .sort();
    expect(a).toEqual(b);
  });

  it("does not regroup on a pan or a small zoom change, only on a new level", () => {
    const at = (zoom: number) =>
      thinForDots(city, zoom, () => 0)
        .map((r) => r.h3)
        .sort();
    expect(at(11.6)).toEqual(at(12.4));
    expect(at(12.4)).not.toEqual(at(12.6));
  });

  it("uses the position a row carries instead of asking H3 again", () => {
    const [lat, lng] = cellToLatLng(city[0].h3);
    // A deliberately wrong id with a right position still lands in a bin.
    const out = thinForDots([{ h3: "not-an-h3", owner: "0xa", lat, lng }], 10, () => 0);
    expect(out).toHaveLength(1);
  });

  it("skips a malformed id instead of blanking the map", () => {
    const out = thinForDots([row("not-an-h3"), city[0]], 10, () => 0);
    expect(out).toEqual([city[0]]);
  });
});

describe("toPointCollection", () => {
  it("puts each feature on its block and keeps its properties", () => {
    const h3 = cell(6.2518, -75.5636);
    const [lat, lng] = cellToLatLng(h3);
    const out = toPointCollection({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { hex: h3, isMine: true },
          geometry: { type: "Polygon", coordinates: [] },
        },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [lng, lat],
    });
    expect(out.features[0].properties).toEqual({ hex: h3, isMine: true });
  });
});
