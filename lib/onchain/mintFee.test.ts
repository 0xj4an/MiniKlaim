import { describe, expect, it } from "vitest";
import { feeToUsd } from "@/lib/onchain/mintFee";
import {
  estimateMintTokensGas,
  feeWithBuffer,
  MINT_TOKENS_MAX,
  MINT_TOKENS_SMALL_BATCH,
} from "@/lib/onchain/sponsorRules";

/** One fee token per CELO, the shape FeeCurrencyDirectory returns. */
const parity = { numerator: 10n ** 18n, denominator: 10n ** 18n };

describe("feeToUsd", () => {
  it("rounds up to the cent, so the button never under-promises", () => {
    // 0.0101 tokens is 1.01 cents and must read as $0.02, not $0.01.
    expect(feeToUsd(10_100_000_000_000_000n, parity, 18)).toBe(0.02);
    expect(feeToUsd(10_000_000_000_000_000n, parity, 18)).toBe(0.01);
  });

  it("handles a six-decimal fee token", () => {
    expect(feeToUsd(370_000_000_000_000_000n, parity, 6)).toBe(0.37);
  });

  it("is zero for a zero fee and never divides by zero", () => {
    expect(feeToUsd(0n, parity, 18)).toBe(0);
    expect(feeToUsd(10n ** 18n, { numerator: 1n, denominator: 0n }, 18)).toBe(0);
  });

  it("reproduces the 28 Oct failure: 700 blocks cost far more than a few cents", () => {
    // The gas price that day, from the player's own rejected transaction.
    const gasPrice = 25_000_000_000n;
    const usd = feeToUsd(
      feeWithBuffer(estimateMintTokensGas(MINT_TOKENS_MAX), gasPrice),
      parity,
      18,
    );
    expect(usd).toBeGreaterThan(0.3);
    // And the small batch is the affordable alternative it is offered as.
    const small = feeToUsd(
      feeWithBuffer(estimateMintTokensGas(MINT_TOKENS_SMALL_BATCH), gasPrice),
      parity,
      18,
    );
    expect(small).toBeLessThan(usd / 4);
  });
});
