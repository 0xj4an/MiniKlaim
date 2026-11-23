import { cellToChildren, gridDisk, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { territoryMini } from "./territoryMini";
import { layoutMini } from "./territoryMiniLayout";

const MEDELLIN = latLngToCell(6.2088, -75.5687, 11);
const LAGOS = latLngToCell(6.5244, 3.3792, 11);

describe("territory thumbnail", () => {
  it("is nothing for a player with no blocks", () => {
    expect(territoryMini([])).toBeNull();
  });

  it("keeps a handful of blocks as they are", () => {
    const blocks = gridDisk(MEDELLIN, 1);
    const mini = territoryMini(blocks);
    expect(mini?.cells).toHaveLength(7);
    expect(mini?.blocks).toBe(7);
    for (const [lat, lng] of mini!.cells) {
      expect(lat).toBeCloseTo(6.2088, 2);
      expect(lng).toBeCloseTo(-75.5687, 2);
    }
  });

  it("coarsens a large territory until it fits", () => {
    const blocks = gridDisk(MEDELLIN, 40);
    expect(blocks.length).toBeGreaterThan(4000);
    const mini = territoryMini(blocks, 48);
    expect(mini!.cells.length).toBeLessThanOrEqual(48);
    expect(mini!.cells.length).toBeGreaterThan(3);
  });

  it("draws the city where the player holds the most", () => {
    const here = gridDisk(MEDELLIN, 3);
    const there = gridDisk(LAGOS, 1);
    const mini = territoryMini([...there, ...here]);
    expect(mini!.blocks).toBe(here.length);
    for (const [, lng] of mini!.cells) expect(lng).toBeLessThan(-70);
  });

  it("skips ids that are not cells instead of failing the stats call", () => {
    const mini = territoryMini(["not-a-cell", ...gridDisk(MEDELLIN, 1)]);
    expect(mini!.cells).toHaveLength(7);
  });

  it("never returns more cells than asked, even at the coarsest step", () => {
    const parent = latLngToCell(6.2088, -75.5687, 5);
    const blocks = cellToChildren(parent, 8);
    const mini = territoryMini(blocks, 10);
    expect(mini!.cells.length).toBeLessThanOrEqual(10);
  });
});

describe("thumbnail layout", () => {
  it("puts every cell inside the box", () => {
    const mini = territoryMini(gridDisk(MEDELLIN, 12))!;
    const { points, radius } = layoutMini(mini.cells, 104, 84);
    expect(points).toHaveLength(mini.cells.length);
    for (const [x, y] of points) {
      expect(x - radius).toBeGreaterThanOrEqual(0);
      expect(x + radius).toBeLessThanOrEqual(104);
      expect(y - radius).toBeGreaterThanOrEqual(0);
      expect(y + radius).toBeLessThanOrEqual(84);
    }
  });

  it("keeps north up and east right", () => {
    const { points } = layoutMini(
      [
        [6.0, -75.0],
        [6.1, -75.0],
        [6.0, -74.9],
      ],
      100,
      100,
    );
    expect(points[1][1]).toBeLessThan(points[0][1]);
    expect(points[2][0]).toBeGreaterThan(points[0][0]);
  });

  it("centres a single block and caps its size", () => {
    const { points, radius } = layoutMini([[6.2, -75.5]], 104, 84);
    expect(points[0]).toEqual([52, 42]);
    expect(radius).toBeLessThanOrEqual(6);
  });

  it("has nothing to draw for no cells", () => {
    expect(layoutMini([], 104, 84)).toEqual({ points: [], radius: 0 });
  });
});
