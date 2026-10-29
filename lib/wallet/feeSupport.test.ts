import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeeCurrency } from "@/lib/onchain/chains";
import {
  heldFeeAdaptersForWallet,
  walletPaysGasInToken,
} from "@/lib/wallet/feeSupport";

vi.mock("@/lib/minipay", () => ({ isMiniPay: vi.fn() }));
const { isMiniPay } = await import("@/lib/minipay");

const USDT = { symbol: "USDT", adapter: "0x1", token: "0x2" } as unknown as FeeCurrency;
const USDM = { symbol: "USDm", adapter: "0x3", token: "0x4" } as unknown as FeeCurrency;
const balances = { USDT: { value: 5n }, USDm: { value: 7n } };

afterEach(() => vi.resetAllMocks());

describe("walletPaysGasInToken", () => {
  it("is MiniPay only: every other wallet pays in CELO", () => {
    vi.mocked(isMiniPay).mockReturnValue(true);
    expect(walletPaysGasInToken()).toBe(true);
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(walletPaysGasInToken()).toBe(false);
  });
});

describe("heldFeeAdaptersForWallet", () => {
  it("offers the held stablecoins inside MiniPay", () => {
    vi.mocked(isMiniPay).mockReturnValue(true);
    expect(heldFeeAdaptersForWallet([USDT, USDM], balances)).toEqual([USDT, USDM]);
  });

  // Outside MiniPay an empty list leaves feeAttempts with native CELO alone,
  // so the player sees one signature sheet instead of three that cannot work.
  it("offers nothing in a browser wallet, however much it holds", () => {
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(heldFeeAdaptersForWallet([USDT, USDM], balances)).toEqual([]);
  });
});
