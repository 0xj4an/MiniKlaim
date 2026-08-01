"use client";

import { useCallback, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain, pickFeeAdapter } from "@/lib/onchain/chains";
import { REWARDS_ABI } from "@/lib/onchain/rewardsAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:claimRewards");

type Voucher = {
  badgeIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
  total: string;
};

export type ClaimRewardsState =
  | "idle"
  | "fetching-voucher"
  | "sending"
  | "linked"
  | "no-op"
  | "error";

export type ClaimRewardsResult =
  | { status: "claimed"; txHash: Hex; amountWei: bigint }
  | { status: "no-op"; reason: "nothing-to-claim" | "not-configured" | "pool-too-low" }
  | { status: "error" };

/**
 * Drive the on-chain USDm rewards claim from the player's wallet. Fetches an
 * EIP-712 voucher from the backend for currently eligible + unclaimed badges,
 * submits `claimRewards` with the ERC-8021 attribution suffix and CIP-64 fee
 * abstraction. Works uniformly in MiniPay, Farcaster, Startale, browser
 * wallets. Backend returns 503 when the contract isn't deployed yet; UI can
 * hide the section in that case (use `useRewardsAvailability` for the check).
 */
export function useClaimRewards(address: `0x${string}` | null) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, !!address);
  const [state, setState] = useState<ClaimRewardsState>("idle");

  const claim = useCallback(async (): Promise<ClaimRewardsResult> => {
    if (!walletClient || !address) {
      setState("error");
      return { status: "error" };
    }
    setState("fetching-voucher");
    let voucher: Voucher;
    try {
      const res = await fetch(
        `/api/users/${address}/rewards/voucher?chain=${chainKey}`,
        { method: "POST" },
      );
      if (res.status === 503) {
        setState("no-op");
        return { status: "no-op", reason: "not-configured" };
      }
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const reason =
          body.error === "pool-too-low" ? "pool-too-low" : "nothing-to-claim";
        setState("no-op");
        return { status: "no-op", reason };
      }
      if (!res.ok) throw new Error(`voucher status ${res.status}`);
      voucher = (await res.json()) as Voucher;
    } catch (e) {
      log.warn("rewards voucher fetch failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setState("error");
      return { status: "error" };
    }

    setState("sending");
    try {
      const chain = getChain(chainKey);
      const feeCurrency = pickFeeAdapter(chain.feeCurrencies, balances);
      const data = encodeFunctionData({
        abi: REWARDS_ABI,
        functionName: "claimRewards",
        args: [
          voucher.badgeIds.map((b) => BigInt(b)),
          BigInt(voucher.nonce),
          voucher.signature,
        ],
      });
      const txHash = await walletClient.sendTransaction({
        to: voucher.contract,
        data: withAttribution(data),
        chain: chain.chain,
        account: address,
        kzg: undefined,
        ...(feeCurrency ? { feeCurrency } : {}),
      });
      log.info("claimRewards submitted", { chainKey, txHash });
      setState("linked");
      return {
        status: "claimed",
        txHash,
        amountWei: BigInt(voucher.total),
      };
    } catch (e) {
      log.warn("claimRewards tx failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setState("error");
      return { status: "error" };
    }
    // Individual balance fields are memoized in useBalances; listing them
    // keeps the callback stable (the whole `balances` object is re-created
    // every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walletClient,
    address,
    chainKey,
    balances.USDm,
    balances.USDC,
    balances.USDT,
  ]);

  return { claim, state };
}
