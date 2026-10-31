import { beforeEach, describe, expect, it, vi } from "vitest";

const getGasPrice = vi.fn();
const getBalance = vi.fn();
const readContract = vi.fn();

vi.mock("@/lib/onchain/hexes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onchain/hexes")>()),
  hexesPublicClient: () => ({ getGasPrice, getBalance, readContract }),
}));

const { playerCanPay } = await import("@/lib/onchain/sponsor");

const PLAYER = "0x8f51dc0791cddddce08052fff939eb7cf0c17856" as const;

/** Enough USDT to cover any fee, and no CELO at all. */
function walletWithStablecoinOnly() {
  getGasPrice.mockResolvedValue(10n ** 9n);
  getBalance.mockResolvedValue(0n);
  readContract.mockImplementation(({ functionName }: { functionName: string }) =>
    functionName === "balanceOf"
      ? Promise.resolve(10n ** 24n)
      : Promise.resolve([1n, 1n] as const),
  );
}

describe("playerCanPay and the wallet that cannot spend its stablecoins on gas", () => {
  beforeEach(() => {
    getGasPrice.mockReset();
    getBalance.mockReset();
    readContract.mockReset();
  });

  it("says a MiniPay player with stablecoins can pay", async () => {
    walletWithStablecoinOnly();
    const pay = await playerCanPay(PLAYER, 10, 0, "celo");
    expect(pay.canPay).toBe(true);
    expect(pay.via).not.toBe("CELO");
  });

  it("says the same player on a browser wallet cannot", async () => {
    // The balance is identical; what differs is that this wallet rejects
    // CIP-64, so the stablecoin is not money it can put towards a fee.
    // Answering "you can pay" here is what left the claim with nowhere to go.
    walletWithStablecoinOnly();
    const pay = await playerCanPay(PLAYER, 10, 0, "celo", { nativeOnly: true });
    expect(pay.canPay).toBe(false);
  });

  it("does not even read the stablecoin balances when only CELO can pay", async () => {
    walletWithStablecoinOnly();
    await playerCanPay(PLAYER, 10, 0, "celo", { nativeOnly: true });
    expect(readContract).not.toHaveBeenCalled();
  });

  it("still refuses to sponsor a browser wallet that holds enough CELO", async () => {
    getGasPrice.mockResolvedValue(10n ** 9n);
    getBalance.mockResolvedValue(10n ** 18n);
    const pay = await playerCanPay(PLAYER, 10, 0, "celo", { nativeOnly: true });
    expect(pay.canPay).toBe(true);
    expect(pay.via).toBe("CELO");
  });

  it("treats a read failure as cannot pay, native-only or not", async () => {
    getGasPrice.mockRejectedValue(new Error("rpc down"));
    for (const nativeOnly of [false, true]) {
      expect((await playerCanPay(PLAYER, 10, 0, "celo", { nativeOnly })).canPay).toBe(
        false,
      );
    }
  });
});
