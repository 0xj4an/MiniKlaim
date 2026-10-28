import { afterEach, describe, expect, it } from "vitest";
import {
  dailyHexCap,
  estimateClaimGas,
  estimateMintTokensGas,
  MINT_TOKENS_MAX,
  parseMintLimit,
  playerTxMaxHexes,
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

  it("is far cheaper once Hexes records (v2)", () => {
    expect(estimateClaimGas(10, 0, true)).toBe(240_000n);
    // The largest real run (8,463 hexes) measured ~26.6M; 8,000 must stay
    // under the 30M block even with this high per-hex estimate.
    expect(estimateClaimGas(playerTxMaxHexes(true), 0, true)).toBeLessThan(
      33_000_000n,
    );
  });
});

describe("playerTxMaxHexes", () => {
  it("lifts the one-tx limit from 700 to 8,000 hexes on v2", () => {
    expect(playerTxMaxHexes(false)).toBe(700);
    expect(playerTxMaxHexes(true)).toBe(8000);
  });
});

describe("estimateMintTokensGas", () => {
  it("keeps a full mint batch near 21M gas", () => {
    expect(estimateMintTokensGas(MINT_TOKENS_MAX)).toBe(21_200_000n);
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

describe("parseMintLimit", () => {
  it("takes a sensible batch and floors a fractional one", () => {
    expect(parseMintLimit({ limit: 100 })).toBe(100);
    expect(parseMintLimit({ limit: 100.9 })).toBe(100);
  });

  it("clamps above the per-tx maximum", () => {
    expect(parseMintLimit({ limit: 5000 })).toBe(MINT_TOKENS_MAX);
  });

  it("falls back to the maximum for anything else", () => {
    for (const body of [
      null,
      {},
      { limit: 0 },
      { limit: -5 },
      { limit: "100" },
      { limit: Number.NaN },
      { limit: Number.POSITIVE_INFINITY },
      "not an object",
    ]) {
      expect(parseMintLimit(body)).toBeNull();
    }
  });
});
