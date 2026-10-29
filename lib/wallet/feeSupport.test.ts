import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeeCurrency } from "@/lib/onchain/chains";
import {
  heldFeeAdaptersForWallet,
  needsCeloForGas,
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

describe("needsCeloForGas", () => {
  const loaded = { isLoading: false, isError: false };

  it("warns a browser wallet holding stablecoins and no CELO", () => {
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(
      needsCeloForGas([USDT, USDM], { ...balances, celo: 0n, ...loaded }),
    ).toBe(true);
  });

  it("stays quiet when they have CELO to pay with", () => {
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(
      needsCeloForGas([USDT, USDM], { ...balances, celo: 1n, ...loaded }),
    ).toBe(false);
  });

  it("stays quiet in MiniPay, which pays the fee from the stablecoin", () => {
    vi.mocked(isMiniPay).mockReturnValue(true);
    expect(
      needsCeloForGas([USDT, USDM], { ...balances, celo: 0n, ...loaded }),
    ).toBe(false);
  });

  it("stays quiet when there is no stablecoin either: that is the relayer's case", () => {
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(
      needsCeloForGas([USDT, USDM], {
        USDT: null,
        USDm: null,
        celo: 0n,
        ...loaded,
      }),
    ).toBe(false);
  });

  // Never flash the warning at a player whose reads have not come back.
  it("stays quiet while the balances are unread", () => {
    vi.mocked(isMiniPay).mockReturnValue(false);
    expect(
      needsCeloForGas([USDT], { ...balances, celo: null, ...loaded }),
    ).toBe(false);
    expect(
      needsCeloForGas([USDT], {
        ...balances,
        celo: 0n,
        isLoading: true,
        isError: false,
      }),
    ).toBe(false);
    expect(
      needsCeloForGas([USDT], {
        ...balances,
        celo: 0n,
        isLoading: false,
        isError: true,
      }),
    ).toBe(false);
  });
});
