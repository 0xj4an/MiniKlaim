import { describe, expect, it } from "vitest";
import {
  isUnpayableFee,
  isUnsupportedFeeCurrency,
  isUserRejection,
  playerHasNoFeeBalance,
} from "@/lib/wallet/playerFee";

describe("isUnpayableFee", () => {
  it("matches a short fee token", () => {
    expect(
      isUnpayableFee(new Error("insufficient fee-currency balance")),
    ).toBe(true);
  });

  it("matches a wallet with nothing to pay", () => {
    expect(isUnpayableFee(new Error("insufficient funds for gas"))).toBe(
      true,
    );
  });

  it("does not match a declined signature", () => {
    expect(isUnpayableFee(new Error("User rejected the request."))).toBe(
      false,
    );
  });
});

describe("isUserRejection", () => {
  it("matches a closed wallet sheet", () => {
    expect(isUserRejection(new Error("User rejected the request."))).toBe(
      true,
    );
    expect(isUserRejection({ code: 4001, message: "denied" })).toBe(true);
  });

  it("matches a real decline MiniPay wraps as an internal error", () => {
    const e = new Error(
      'An internal error was received.\n\nRequest Arguments:\n  from: 0x95753CD1Ed8E3B92E25609447DDA326fA3c06179\n\nDetails: User rejected transaction\nVersion: viem@2.57.10',
    );
    expect(isUserRejection(e)).toBe(true);
  });

  it("does not match MiniPay's internal error dressed as a rejection", () => {
    const e = Object.assign(
      new Error(
        "User rejected transaction An internal error was received.\n\nRequest Arguments:",
      ),
      { code: 4001 },
    );
    expect(isUserRejection(e)).toBe(false);
  });

  it("does not match a fee shortfall with a rejection code", () => {
    const e = Object.assign(
      new Error("insufficient fee-currency balance: required 4922222662432225"),
      { code: 4001 },
    );
    expect(isUserRejection(e)).toBe(false);
  });

  it("does not match a short fee token", () => {
    expect(
      isUserRejection(new Error("insufficient fee-currency balance")),
    ).toBe(false);
  });
});

describe("playerHasNoFeeBalance", () => {
  const ready = { isLoading: false, isError: false };

  it("is true only after a loaded empty read on a fee-abstraction chain", () => {
    expect(playerHasNoFeeBalance(3, 0, ready)).toBe(true);
    expect(playerHasNoFeeBalance(3, 1, ready)).toBe(false);
    expect(playerHasNoFeeBalance(0, 0, ready)).toBe(false);
    expect(playerHasNoFeeBalance(3, 0, { isLoading: true, isError: false })).toBe(
      false,
    );
    expect(playerHasNoFeeBalance(3, 0, { isLoading: false, isError: true })).toBe(
      false,
    );
  });
});

describe("isUnsupportedFeeCurrency", () => {
  it("catches a wallet that rejects the feeCurrency field", () => {
    expect(
      isUnsupportedFeeCurrency(
        Object.assign(new Error("Invalid params"), {
          code: -32602,
          details: "Unrecognized field 'feeCurrency'",
        }),
      ),
    ).toBe(true);
    expect(isUnsupportedFeeCurrency(new Error("unsupported transaction type"))).toBe(
      true,
    );
    expect(isUnsupportedFeeCurrency(new Error("eth_sendTransaction is not supported"))).toBe(
      true,
    );
  });

  it("is not a decline, so the player is never asked twice", () => {
    expect(
      isUnsupportedFeeCurrency(
        Object.assign(new Error("User rejected the request"), { code: 4001 }),
      ),
    ).toBe(false);
    expect(
      isUnsupportedFeeCurrency(new Error("User denied transaction signature")),
    ).toBe(false);
  });

  it("leaves an ordinary revert alone", () => {
    expect(
      isUnsupportedFeeCurrency(new Error("execution reverted: bad voucher")),
    ).toBe(false);
    expect(isUnsupportedFeeCurrency(new Error("nonce too low"))).toBe(false);
  });
});
