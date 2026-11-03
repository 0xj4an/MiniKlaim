import { describe, expect, it } from "vitest";
import { cellToParent, latLngToCell } from "h3-js";
import { parseThinRes, thinToParents, WORLD_THIN_RES } from "./worldThin";

const cell = (lat: number, lng: number) => latLngToCell(lat, lng, 12);

function row(h3: string, owner: string, ownerUsername: string | null = null) {
  return { h3, owner, ownerUsername };
}

describe("parseThinRes", () => {
  it("accepts only the resolutions the world view draws", () => {
    for (const r of WORLD_THIN_RES) expect(parseThinRes(String(r))).toBe(r);
  });

  it("refuses anything else rather than grouping 300k blocks for nobody", () => {
    for (const bad of ["0", "1", "5", "12", "-2", "two", "", "2.5"]) {
      expect(parseThinRes(bad)).toBeNull();
    }
    expect(parseThinRes(null)).toBeNull();
  });
});

describe("thinToParents", () => {
  const near = [cell(6.2518, -75.5636), cell(6.2519, -75.5637), cell(6.252, -75.5638)];
  const faraway = cell(35.6762, 139.6503);

  it("returns one row per parent cell", () => {
    const out = thinToParents(near.map((h) => row(h, "0xa")), 2, () => 0);
    expect(out).toHaveLength(1);
    expect(out[0].h3).toBe(cellToParent(near[0], 2));
  });

  it("keeps cells that are genuinely apart", () => {
    const out = thinToParents(
      [...near.map((h) => row(h, "0xa")), row(faraway, "0xb")],
      2,
      () => 0,
    );
    expect(out).toHaveLength(2);
  });

  it("gives the cell to the owner the map most wants to show", () => {
    // The ten colours on the world map are the only thing distinguishing it
    // from a grey smear, so a top-ten block wins its cell.
    const out = thinToParents(
      [row(near[0], "0xanon"), row(near[1], "0xtop")],
      2,
      (o) => (o === "0xtop" ? 1 : 0),
    );
    expect(out[0].owner).toBe("0xtop");
  });

  it("breaks a tie on the lowest id, so the body is byte-stable", () => {
    // A changing body means a changing ETag, and a phone that already has
    // this copy downloads a megabyte instead of getting a 304.
    const a = thinToParents([row(near[0], "0xa"), row(near[1], "0xb")], 2, () => 0);
    const b = thinToParents([row(near[1], "0xb"), row(near[0], "0xa")], 2, () => 0);
    expect(a).toEqual(b);
  });

  it("returns the rows sorted, for the same reason", () => {
    const out = thinToParents(
      [row(faraway, "0xb"), ...near.map((h) => row(h, "0xa"))],
      2,
      () => 0,
    );
    expect(out.map((r) => r.h3)).toEqual([...out.map((r) => r.h3)].sort());
  });

  it("keeps the username, which the popup shows", () => {
    const out = thinToParents([row(near[0], "0xa", "yochabet")], 3, () => 0);
    expect(out[0].ownerUsername).toBe("yochabet");
  });

  it("skips a malformed id instead of failing the whole world list", () => {
    const out = thinToParents([row("not-an-h3", "0xa"), row(near[0], "0xb")], 2, () => 0);
    expect(out).toHaveLength(1);
    expect(out[0].owner).toBe("0xb");
  });

  it("thins harder at a coarser resolution", () => {
    const spread = [cell(6.25, -75.56), cell(6.45, -75.9), cell(7.1, -76.4)];
    const coarse = thinToParents(spread.map((h) => row(h, "0xa")), 2, () => 0);
    const finer = thinToParents(spread.map((h) => row(h, "0xa")), 4, () => 0);
    expect(coarse.length).toBeLessThanOrEqual(finer.length);
  });
});
