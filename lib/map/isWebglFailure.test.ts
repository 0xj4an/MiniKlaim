import { describe, expect, it } from "vitest";
import { isWebglFailure } from "@/lib/map/isWebglFailure";

describe("isWebglFailure", () => {
  it("matches MapLibre shader and context errors", () => {
    expect(isWebglFailure("Could not compile fragment shader: ")).toBe(true);
    expect(isWebglFailure("Could not compile vertex shader: ERROR")).toBe(true);
    expect(isWebglFailure("Failed to initialize WebGL")).toBe(true);
  });
  it("ignores other errors", () => {
    expect(isWebglFailure("Cannot read properties of null")).toBe(false);
  });
});
