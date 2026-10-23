import { describe, expect, it } from "vitest";
import { feeUsd, formatFeeUsd } from "./feeEstimate";

// 0.0814 USDm per CELO, as the FeeCurrencyDirectory returns it (18-decimal scaled).
const RATE = { numerator: 814n * 10n ** 14n, denominator: 10n ** 18n };
const GWEI = 10n ** 9n;

describe("feeUsd", () => {
  it("prices gas at the CELO base fee in dollars", () => {
    // 1.28M gas (a 357-hex claim on v2) at 202.5 gwei and $0.0814 per CELO.
    const usd = feeUsd(1_280_000n, 2025n * GWEI / 10n, RATE);
    expect(usd).toBeCloseTo(0.0211, 4);
  });

  it("is zero for empty inputs or a broken rate", () => {
    expect(feeUsd(0n, 200n * GWEI, RATE)).toBe(0);
    expect(feeUsd(1_000_000n, 0n, RATE)).toBe(0);
    expect(feeUsd(1_000_000n, 200n * GWEI, { numerator: 1n, denominator: 0n })).toBe(0);
  });
});

describe("formatFeeUsd", () => {
  it("shows sub-cent fees as under a cent", () => {
    expect(formatFeeUsd(0.0042)).toBe("< $0.01");
    expect(formatFeeUsd(0)).toBe("< $0.01");
  });

  it("rounds to cents above that", () => {
    expect(formatFeeUsd(0.0211)).toBe("$0.02");
    expect(formatFeeUsd(0.4)).toBe("$0.40");
  });

  it("returns nothing for bad values", () => {
    expect(formatFeeUsd(Number.NaN)).toBe("");
    expect(formatFeeUsd(-1)).toBe("");
  });
});
