import { afterEach, describe, expect, it } from "vitest";
import {
  dailyHexCap,
  estimateClaimGas,
  feeInToken,
  feeWithBuffer,
  hashRunToken,
  newRunToken,
  remainingHexAllowance,
  runTokenMatches,
} from "@/lib/onchain/sponsorRules";

// FeeCurrencyDirectory rate for USDm/USDT adapters on Celo, Oct 2026:
// 0.098149 token per CELO, both sides scaled by 1e24.
const RATE = {
  numerator: 98_149_010_000_000_000_000_000n,
  denominator: 1_000_000_000_000_000_000_000_000n,
};

describe("estimateClaimGas", () => {
  it("grows per hex and per badge", () => {
    expect(estimateClaimGas(0)).toBe(200_000n);
    expect(estimateClaimGas(10)).toBe(550_000n);
    expect(estimateClaimGas(10, 2)).toBe(750_000n);
  });
});

describe("feeInToken", () => {
  it("converts a CELO fee into USDT units and rounds up", () => {
    // 100 hexes at 202.5 gwei with the 30% buffer.
    const fee = feeWithBuffer(estimateClaimGas(100), 202_500_000_000n);
    const usdt = feeInToken(fee, RATE, 6);
    // 3.7M gas * 202.5 gwei * 1.3 = ~0.974 CELO, * 0.098 = ~0.0956 USDT.
    expect(usdt).toBeGreaterThan(90_000n);
    expect(usdt).toBeLessThan(100_000n);
  });

  it("keeps 18-decimal tokens in 18 decimals", () => {
    const usdm = feeInToken(10n ** 18n, RATE, 18);
    expect(usdm).toBe(98_149_010_000_000_000n);
  });

  it("returns zero for a broken rate instead of throwing", () => {
    expect(feeInToken(10n ** 18n, { numerator: 1n, denominator: 0n }, 6)).toBe(
      0n,
    );
  });
});

describe("remainingHexAllowance", () => {
  afterEach(() => {
    delete process.env.SPONSOR_DAILY_HEX_CAP;
  });

  it("defaults to 200 hexes a day", () => {
    expect(dailyHexCap()).toBe(200);
    expect(remainingHexAllowance(0)).toBe(200);
    expect(remainingHexAllowance(150)).toBe(50);
    expect(remainingHexAllowance(400)).toBe(0);
  });

  it("reads the cap from the environment", () => {
    process.env.SPONSOR_DAILY_HEX_CAP = "50";
    expect(remainingHexAllowance(20)).toBe(30);
  });
});

describe("run tokens", () => {
  it("accepts only the token that produced the hash", () => {
    const token = newRunToken();
    const stored = hashRunToken(token);
    expect(runTokenMatches(stored, token)).toBe(true);
    expect(runTokenMatches(stored, newRunToken())).toBe(false);
    expect(runTokenMatches(stored, null)).toBe(false);
    expect(runTokenMatches(null, token)).toBe(false);
  });
});
