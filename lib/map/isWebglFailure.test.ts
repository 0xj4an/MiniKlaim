import { describe, expect, it } from "vitest";
import { isWebglFailure } from "@/lib/map/isWebglFailure";

describe("isWebglFailure", () => {
  it("matches MapLibre shader and context errors", () => {
    expect(isWebglFailure("Could not compile fragment shader: ")).toBe(true);
    expect(isWebglFailure("Could not compile vertex shader: ERROR")).toBe(true);
    expect(isWebglFailure("Failed to initialize WebGL")).toBe(true);
  });
  it("matches the WebGL2 requirement MapLibre 6 throws", () => {
    // Verbatim from maplibre-gl 6.16.0, thrown as GPUInitializationError.
    expect(
      isWebglFailure(
        "WebGL2 is required to display this map. We are sorry, but it seems that your browser does not support WebGL2, a technology for rendering 3D graphics on the web. Read more on https://wiki.openstreetmap.org/wiki/This_map_requires_WebGL",
      ),
    ).toBe(true);
    // Some callers hand us String(error), which carries the name instead.
    expect(
      isWebglFailure("GPUInitializationError: cannot create a WebGL2 context"),
    ).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isWebglFailure("Cannot read properties of null")).toBe(false);
    expect(isWebglFailure("WebGL2RenderingContext is fine here")).toBe(false);
  });
});
