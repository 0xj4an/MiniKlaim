import { describe, expect, it } from "vitest";
import { withoutHeld } from "./badgeSet";

describe("withoutHeld", () => {
  it("authorizes only the badges the player does not hold", () => {
    // The case from 4 Nov 2026: 25 held, 3 newly earned, and the wallet was
    // asked to confirm 28 because the voucher carried the whole eligible set.
    const held = [
      1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 16, 17, 18, 20, 21, 26, 27, 34, 35, 36,
      43, 44, 45, 48, 49,
    ];
    const eligible = [...held, 9, 12, 46].map(BigInt);
    expect(withoutHeld(eligible, held)).toEqual([9n, 12n, 46n]);
  });

  it("returns nothing when the player already holds everything earned", () => {
    expect(withoutHeld([1n, 2n], [1, 2])).toEqual([]);
  });

  it("keeps the eligible order, so the voucher is stable between reads", () => {
    expect(withoutHeld([46n, 9n, 12n], [])).toEqual([46n, 9n, 12n]);
  });

  it("ignores held ids the player never earned", () => {
    expect(withoutHeld([9n], [1, 2, 3])).toEqual([9n]);
  });

  it("has nothing to authorize for a player who earned nothing", () => {
    expect(withoutHeld([], [1, 2])).toEqual([]);
  });
});
