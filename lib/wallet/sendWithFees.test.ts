import { describe, expect, it, vi } from "vitest";
import type { FeeCurrency } from "@/lib/onchain/chains";
import { feeAttempts, sendWithFeeFallback } from "@/lib/wallet/sendWithFees";

const USDT = { symbol: "USDT", adapter: "0x1", token: "0x2" } as unknown as FeeCurrency;
const USDM = { symbol: "USDm", adapter: "0x3", token: "0x3" } as unknown as FeeCurrency;
const short = new Error(
  "insufficient fee-currency balance: required 18954393369414964, available 1683000000000000",
);

describe("feeAttempts", () => {
  it("always ends with native CELO", () => {
    expect(feeAttempts([])).toEqual([undefined]);
    expect(feeAttempts([USDT, USDM])).toEqual([USDT, USDM, undefined]);
  });
});

describe("sendWithFeeFallback", () => {
  it("falls back to CELO when the only stablecoin is short", async () => {
    const send = vi.fn(async (fee: FeeCurrency | undefined) => {
      if (fee) throw short;
      return "0xhash";
    });
    const out = await sendWithFeeFallback([USDM], send);
    expect(out).toEqual({ result: "0xhash", fee: undefined });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops at once on a decline", async () => {
    const decline = Object.assign(new Error("User rejected"), { code: 4001 });
    const send = vi.fn(async () => {
      throw decline;
    });
    await expect(sendWithFeeFallback([USDT, USDM], send)).rejects.toBe(decline);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("throws the last error when even CELO is short", async () => {
    const send = vi.fn(async () => {
      throw short;
    });
    await expect(sendWithFeeFallback([USDT], send)).rejects.toBe(short);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
