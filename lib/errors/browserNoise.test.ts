import { describe, expect, it } from "vitest";
import { isBrowserNoise } from "./browserNoise";

describe("isBrowserNoise", () => {
  it("drops the three known non-bugs", () => {
    expect(isBrowserNoise("Connection closed.")).toBe(true);
    expect(isBrowserNoise("Script error.")).toBe(true);
    expect(
      isBrowserNoise(
        "Error invoking event: Java bridge method invocation error",
      ),
    ).toBe(true);
  });

  it("keeps real crashes", () => {
    expect(isBrowserNoise("Failed to fetch")).toBe(false);
    expect(
      isBrowserNoise("Cannot read properties of null (reading 'getSource')"),
    ).toBe(false);
  });
});
