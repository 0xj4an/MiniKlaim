import { describe, expect, it } from "vitest";
import { MAX_PIXEL_RATIO, paintBox } from "./gridPaintGate";

describe("paintBox", () => {
  it("refuses a box with no width, which is a layout that has not happened", () => {
    // Found in production: the container reported 320 tall and 0 wide until
    // the panel holding it was shown. The old code clamped that to 1 pixel,
    // painted, and reported the map ready. The symptom was a blank panel
    // with no error anywhere.
    expect(paintBox(0, 320, 2)).toBeNull();
    expect(paintBox(320, 0, 2)).toBeNull();
    expect(paintBox(1, 1, 2)).toBeNull();
  });

  it("accepts a real box and sizes the backing store for the screen", () => {
    expect(paintBox(390, 640, 2)).toEqual({
      width: 390,
      height: 640,
      backingW: 780,
      backingH: 1280,
    });
  });

  it("caps the backing store, since software fills every pixel", () => {
    const box = paintBox(390, 640, 3.5);
    expect(box?.backingW).toBe(390 * MAX_PIXEL_RATIO);
  });

  it("treats a nonsense pixel ratio as 1 rather than drawing nothing", () => {
    expect(paintBox(100, 100, Number.NaN)?.backingW).toBe(100);
    expect(paintBox(100, 100, 0)?.backingW).toBe(100);
    expect(paintBox(100, 100, -2)?.backingW).toBe(100);
  });

  it("rounds a fractional box, because a canvas takes whole pixels", () => {
    expect(paintBox(390.4, 640.6, 1)).toEqual({
      width: 390,
      height: 641,
      backingW: 390,
      backingH: 641,
    });
  });
});
