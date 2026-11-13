import { describe, expect, test } from "vitest";
import { h3ToTokenId, tokenIdToH3 } from "@/lib/onchain/hexes";

describe("tokenIdToH3", () => {
  test("reads back the block a token id was made from", () => {
    const h3 = "8c8c147829a27ff";
    expect(h3ToTokenId(h3).toString()).toBe("632968260523534335");
    expect(tokenIdToH3("632968260523534335")).toBe(h3);
  });

  test("refuses anything that is not a block", () => {
    expect(tokenIdToH3("1")).toBeNull();
    expect(tokenIdToH3("0x8c8c147829a27ff")).toBeNull();
    expect(tokenIdToH3("../badges/1")).toBeNull();
    expect(tokenIdToH3("")).toBeNull();
    expect(tokenIdToH3("9".repeat(40))).toBeNull();
  });
});
