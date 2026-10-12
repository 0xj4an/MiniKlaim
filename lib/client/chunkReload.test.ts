import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "@/lib/client/chunkReload";

describe("isChunkLoadError", () => {
  it("matches Turbopack and webpack chunk failures", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to load chunk /_next/static/chunks/02loqha6b9u1w.js from module 744141",
        ),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 123 failed."))).toBe(true);
    const e = new Error("x");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
  });
  it("ignores other crashes", () => {
    expect(isChunkLoadError(new Error("Array buffer allocation failed"))).toBe(
      false,
    );
  });
});
