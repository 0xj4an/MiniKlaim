import { describe, expect, it } from "vitest";
import { cellToParent, latLngToCell } from "h3-js";
import {
  createThinner,
  parseThinRes,
  thinToParents,
  WORLD_THIN_RES,
} from "./worldThin";

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
    expect(cellToParent(out[0].h3, 2)).toBe(cellToParent(near[0], 2));
  });

  it("keeps a real block, so the dot sits where somebody captured", () => {
    // The cell centre is up to 20 km from any block, and dots drawn there
    // lined up in the lattice of the cells instead of on the cities.
    const out = thinToParents(near.map((h) => row(h, "0xa")), 2, () => 0);
    expect(near).toContain(out[0].h3);
    expect(out[0].h3).toBe([...near].sort()[0]);
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

describe("createThinner", () => {
  const top = "0x00000000000000000000000000000000000000aa";
  const rank = (owner: string) => (owner === top ? 1 : 0);
  // Three cities, several blocks each, a top-ten owner mixed in.
  const rows = [
    ...Array.from({ length: 60 }, (_, i) => row(cell(6.2442 + i * 0.0004, -75.5812), i % 7 === 0 ? top : `0x${i}`)),
    ...Array.from({ length: 60 }, (_, i) => row(cell(9.0765 + i * 0.0004, 7.3986), `0xb${i}`, `n${i}`)),
    ...Array.from({ length: 60 }, (_, i) => row(cell(-26.2432 + i * 0.0004, 28.1948), i === 59 ? top : `0xc${i}`)),
  ];

  // The world list now arrives from the database 5,000 rows at a time.
  it("thins a list fed in slices exactly as one fed whole", () => {
    for (const res of WORLD_THIN_RES) {
      const thinner = createThinner(res, rank);
      for (let i = 0; i < rows.length; i += 17) thinner.add(rows.slice(i, i + 17));
      expect(thinner.rows()).toEqual(thinToParents(rows, res, rank));
    }
  });

  it("gives the same answer whatever order the slices come in", () => {
    const forward = createThinner(2, rank);
    forward.add(rows);
    const backward = createThinner(2, rank);
    for (let i = rows.length; i > 0; i -= 11)
      backward.add(rows.slice(Math.max(0, i - 11), i));
    expect(backward.rows()).toEqual(forward.rows());
  });

  it("has nothing to show before any row arrives", () => {
    expect(createThinner(2, rank).rows()).toEqual([]);
  });
});

describe("thinning a coarser list from a finer one", () => {
  it("gives the same winners as thinning the table directly", () => {
    // Blocks spread over a few hundred km, with a ranked owner mixed in, so
    // cells at every resolution have several candidates.
    const rows = Array.from({ length: 4_000 }, (_, i) => ({
      h3: latLngToCell(4 + (i % 80) * 0.05, -74 + Math.floor(i / 80) * 0.07, 12),
      owner: i % 7 === 0 ? "0xtop" : `0x${i % 13}`,
      ownerUsername: null,
    }));
    const rank = (owner: string) => (owner === "0xtop" ? 1 : 0);
    const direct = (res: 2 | 3 | 4) => {
      const t = createThinner(res, rank);
      t.add(rows);
      return t.rows();
    };
    const fine = direct(4);
    for (const res of [3, 2] as const) {
      const viaFine = createThinner(res, rank);
      viaFine.add(fine);
      expect(viaFine.rows()).toEqual(direct(res));
    }
    // And through both steps, as the world scan does it.
    const three = createThinner(3, rank);
    three.add(fine);
    const two = createThinner(2, rank);
    two.add(three.rows());
    expect(two.rows()).toEqual(direct(2));
  });
});
