import { afterEach, describe, expect, it } from "vitest";
import { minipayLinkRedeemEnabled } from "./redeemFlag";

describe("minipayLinkRedeemEnabled", () => {
  afterEach(() => {
    delete process.env.MINIPAY_LINK_REDEEM;
  });

  it("is off unless set", () => {
    expect(minipayLinkRedeemEnabled()).toBe(false);
    process.env.MINIPAY_LINK_REDEEM = "0";
    expect(minipayLinkRedeemEnabled()).toBe(false);
  });

  it("turns on with 1, true, on or yes", () => {
    for (const v of ["1", "true", "ON", " yes "]) {
      process.env.MINIPAY_LINK_REDEEM = v;
      expect(minipayLinkRedeemEnabled()).toBe(true);
    }
  });
});
