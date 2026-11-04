import { describe, expect, it } from "vitest";
import { mintPlan, needsBatchWarning } from "./mintPlan";
import { estimateMintTokensGas, MINT_TOKENS_MAX } from "./sponsorRules";

describe("mintPlan", () => {
  it("mints a median run in one signature", () => {
    // Measured over 14 days: the median run with blocks is 4 of them, and
    // 96.8% of runs fit in a single transaction. The warning must not fire
    // for almost everybody.
    const plan = mintPlan(4);
    expect(plan.batches).toEqual([4]);
    expect(plan.signatures).toBe(1);
    expect(needsBatchWarning(plan)).toBe(false);
  });

  it("fills whole batches before the remainder", () => {
    const plan = mintPlan(5000);
    expect(plan.batches).toEqual([700, 700, 700, 700, 700, 700, 700, 100]);
    expect(plan.signatures).toBe(8);
    expect(plan.batches.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(needsBatchWarning(plan)).toBe(true);
  });

  it("asks for one signature at exactly the cap and two just past it", () => {
    expect(mintPlan(MINT_TOKENS_MAX).signatures).toBe(1);
    expect(mintPlan(MINT_TOKENS_MAX + 1).signatures).toBe(2);
    expect(mintPlan(MINT_TOKENS_MAX + 1).batches).toEqual([MINT_TOKENS_MAX, 1]);
  });

  it("charges the base gas once per batch, not once per plan", () => {
    // Ten batches pay the 200k base ten times. Quoting count * rate would
    // under-promise, which is the mistake the fee copy already made once.
    const split = mintPlan(1400);
    expect(split.signatures).toBe(2);
    expect(split.totalGas).toBe(estimateMintTokensGas(700) * 2n);
    expect(split.totalGas).toBeGreaterThan(estimateMintTokensGas(1400));
  });

  it("keeps every batch inside one Celo block", () => {
    // 30M gas per block is the hard ceiling; a batch that does not fit can
    // never be mined however much the player is willing to pay.
    for (const n of [1, 699, 700, 701, 5000, 13943]) {
      for (const b of mintPlan(n).batches) {
        expect(estimateMintTokensGas(b)).toBeLessThan(30_000_000n);
      }
    }
  });

  it("has nothing to do for a player with no blocks waiting", () => {
    const plan = mintPlan(0);
    expect(plan.batches).toEqual([]);
    expect(plan.signatures).toBe(0);
    expect(plan.totalGas).toBe(0n);
    expect(needsBatchWarning(plan)).toBe(false);
  });

  it("refuses to loop on a junk count", () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(mintPlan(bad).signatures).toBe(0);
    }
    expect(mintPlan(10, 0).signatures).toBe(10);
  });
});
