import { describe, expect, it } from "vitest";
import { causeOf } from "./mapFailureKind";

describe("causeOf", () => {
  it("separates the worker from the tile host, which share a stage", () => {
    // Both of these were reported at `style` and landed in MINIKLAIM-1R
    // together, so the issue title flipped between them and the worker error
    // was read as a tile problem.
    expect(causeOf("Worker failed to load. Check that the worker URL is correct.")).toBe("worker");
    expect(causeOf("AJAXError: Failed to fetch (tiles.openfreemap.org) (0): https://...")).toBe("tiles");
  });

  it("recognizes the tile host by its other assets too", () => {
    expect(causeOf("Unable to load sprite from https://tiles.openfreemap.org/sprites/ofm")).toBe("tiles");
    expect(causeOf("Error loading glyph range 0-255")).toBe("tiles");
  });

  it("names the device when the GPU is what refused", () => {
    expect(causeOf("WebGL2 is required to display this map")).toBe("webgl");
    expect(causeOf("Failed to initialize WebGL context")).toBe("webgl");
  });

  it("puts anything else in one bucket instead of one per browser", () => {
    expect(causeOf("undefined is not an object")).toBe("other");
    expect(causeOf("")).toBe("other");
  });

  it("prefers the worker when a message could read as either", () => {
    // A worker that fails while fetching is still a worker problem: the
    // bundle is what needs fixing, not the host.
    expect(causeOf("Worker failed to load from tiles.openfreemap.org")).toBe("worker");
  });
});
