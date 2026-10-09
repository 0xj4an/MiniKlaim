import { describe, expect, it } from "vitest";
import {
  isUnpayableFee,
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
