import { describe, expect, test } from "vitest";
import { hexClaimAction } from "./claimDecision";
import { leftoverDistance } from "./validation";

const ME = "0xde9f344e3dd01e86ce90c51faf8a02a0b75d9bea";
const LINKED = "0x8f51dc0791cddddce08052fff939eb7cf0c17856";
const OTHER = "0x0268b7e6668a6af45967e34ade65a5f6f3db2e60";

describe("hex claim action", () => {
  const mine = new Set([ME, LINKED]);

  test("an empty cell is new", () => {
    expect(hexClaimAction(undefined, mine)).toBe("new");
    expect(hexClaimAction(null, mine)).toBe("new");
  });

  test("a hex this player already holds is not taken again", () => {
    expect(hexClaimAction({ ownerAddress: ME }, mine)).toBe("own");
    expect(hexClaimAction({ ownerAddress: LINKED.toUpperCase() }, mine)).toBe("own");
  });

  test("a hex held by someone else is taken", () => {
    expect(hexClaimAction({ ownerAddress: OTHER }, mine)).toBe("take");
  });
});

describe("leftover distance", () => {
  test("keeps a real leftover and drops junk", () => {
    expect(leftoverDistance(1200)).toBe(1200);
    expect(leftoverDistance(0)).toBe(0);
    expect(leftoverDistance(-4)).toBe(0);
    expect(leftoverDistance("1200")).toBe(0);
    expect(leftoverDistance(Number.NaN)).toBe(0);
  });

  test("caps a huge leftover", () => {
    expect(leftoverDistance(9_000_000)).toBe(200_000);
  });
});
