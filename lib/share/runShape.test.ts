import { latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { cellsForShape, runShape, runShapePath, SHAPE_MAX_CELLS } from "./runShape";

// A straight street in Lagos, one block per ~17 m.
const street = Array.from({ length: 40 }, (_, i) =>
  latLngToCell(6.45, 3.39 + i * 0.00017, 12),
).filter((h, i, a) => a.indexOf(h) === i);

function coords(path: string): number[][] {
  return [...path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe("runShapePath", () => {
  it("draws one closed outline per block, inside the box", () => {
    const path = runShapePath(street, { width: 500, height: 400, padding: 20 });
    expect(path).not.toBeNull();
    expect(path!.match(/M/g)?.length).toBe(street.length);
    expect(path!.match(/Z/g)?.length).toBe(street.length);
    for (const [x, y] of coords(path!)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(500);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(400);
    }
  });

  it("fills the box's width for a street that runs east to west", () => {
    const xs = coords(runShapePath(street, { width: 500, height: 400, padding: 20 })!).map(
      ([x]) => x,
    );
    expect(Math.min(...xs)).toBeCloseTo(20, 0);
    expect(Math.max(...xs)).toBeCloseTo(480, 0);
  });

  it("draws a single block", () => {
    const path = runShapePath([street[0]], { width: 500, height: 400 });
    expect(path!.match(/M/g)?.length).toBe(1);
  });

  it("has nothing to draw for no blocks or junk", () => {
    expect(runShapePath([], { width: 500, height: 400 })).toBeNull();
    expect(runShapePath(["not-a-cell"], { width: 500, height: 400 })).toBeNull();
  });
});

describe("cellsForShape", () => {
  it("draws a long drive in coarser cells instead of thousands", () => {
    const drive = Array.from({ length: 6000 }, (_, i) =>
      latLngToCell(6.45 + i * 0.00012, 3.39 + i * 0.00012, 12),
    );
    const cells = cellsForShape(drive);
    expect(cells.length).toBeLessThanOrEqual(SHAPE_MAX_CELLS);
    expect(cells.length).toBeGreaterThan(10);
  });

  it("keeps a short run at full detail", () => {
    expect(cellsForShape(street)).toHaveLength(street.length);
  });
});

describe("runShape", () => {
  const box = { width: 540, height: 502, padding: 56 };

  it("marks where the run started and ended, from the capture order", () => {
    const shape = runShape(street, box)!;
    expect(shape.start).not.toBeNull();
    expect(shape.end).not.toBeNull();
    // The street runs west to east, so it starts on the left.
    expect(shape.start![0]).toBeLessThan(shape.end![0]);
    expect(Math.abs(shape.start![1] - shape.end![1])).toBeLessThan(10);
  });

  it("draws the empty blocks around the run, and none of the run's own", () => {
    const shape = runShape(street, box)!;
    const own = shape.cells.match(/M/g)!.length;
    const around = shape.grid.match(/M/g)!.length;
    expect(own).toBe(street.length);
    expect(around).toBeGreaterThan(own);
  });

  it("keeps a single block block-sized, with no start or end", () => {
    const shape = runShape([street[0]], box)!;
    expect(shape.cellPx).toBeLessThanOrEqual(84.5);
    expect(shape.start).toBeNull();
    expect(shape.end).toBeNull();
    expect(shape.grid.match(/M/g)!.length).toBeGreaterThan(20);
  });

  it("has nothing to draw for no blocks", () => {
    expect(runShape([], box)).toBeNull();
  });
});
