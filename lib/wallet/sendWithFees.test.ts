import { describe, expect, it, vi } from "vitest";
import type { FeeCurrency } from "@/lib/onchain/chains";
import { feeAttempts, orderHeldByBalance, sendWithFeeFallback } from "@/lib/wallet/sendWithFees";

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

describe("orderHeldByBalance", () => {
  it("puts the larger human balance first, whatever the decimals", () => {
    const ordered = orderHeldByBalance([USDT, USDM], (symbol) =>
      symbol === "USDT"
        ? { value: 1_000n, decimals: 6 }
        : { value: 2n * 10n ** 18n, decimals: 18 },
    );
    expect(ordered.map((f) => f.symbol)).toEqual(["USDm", "USDT"]);
  });
});

describe("sendWithFeeFallback", () => {
  it("skips native when the caller will ask the relayer instead", async () => {
    const send = vi.fn(async (fee: FeeCurrency | undefined) => {
      expect(fee).toBeDefined();
      throw short;
    });
    await expect(
      sendWithFeeFallback([USDT, USDM], send, undefined, { native: false }),
    ).rejects.toBe(short);
    expect(send.mock.calls.map((c) => c[0])).toEqual([USDT, USDM]);
  });

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

  // 29 Oct 2026: a MetaMask wallet holding Celo stablecoins could not link,
  // claim a run, mint or claim badges. The wallet rejects `feeCurrency`, which
  // is not a shortfall, so the fallback stopped on the first attempt.
  it("falls back to CELO when the wallet cannot do fee abstraction", async () => {
    const unsupported = Object.assign(new Error("Invalid params"), {
      code: -32602,
      details: "Unrecognized field 'feeCurrency'",
    });
    const send = vi.fn(async (fee: FeeCurrency | undefined) => {
      if (fee) throw unsupported;
      return "0xhash";
    });
    const out = await sendWithFeeFallback([USDT, USDM], send);
    expect(out).toEqual({ result: "0xhash", fee: undefined });
    // Both stablecoins refused, then native CELO went through.
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not report a shortfall when the wallet simply cannot pay in token", async () => {
    const unsupported = new Error("unsupported transaction type");
    const onShort = vi.fn();
    const send = vi.fn(async (fee: FeeCurrency | undefined) => {
      if (fee) throw unsupported;
      return "0xhash";
    });
    await sendWithFeeFallback([USDM], send, onShort);
    expect(onShort).not.toHaveBeenCalled();
  });

  it("still stops at once on a decline that mentions an unsupported field", async () => {
    const decline = Object.assign(new Error("User rejected the request"), {
      code: 4001,
      details: "User rejected the request. Method not supported",
    });
    const send = vi.fn(async () => {
      throw decline;
    });
    await expect(sendWithFeeFallback([USDT, USDM], send)).rejects.toBe(decline);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
