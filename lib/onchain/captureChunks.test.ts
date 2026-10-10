import { describe, expect, it } from "vitest";
import { CAPTURE_CHUNK, chunkIds } from "@/lib/onchain/hexes";

describe("chunkIds", () => {
  it("splits a run that would not fit in one block", () => {
    const ids = Array.from({ length: 1534 }, (_, i) => i);
    const chunks = chunkIds(ids, CAPTURE_CHUNK);
    expect(chunks.map((c) => c.length)).toEqual([400, 400, 400, 334]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("leaves a short run as one chunk", () => {
    expect(chunkIds(["a", "b"], CAPTURE_CHUNK)).toEqual([["a", "b"]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkIds([], CAPTURE_CHUNK)).toEqual([]);
  });
});
