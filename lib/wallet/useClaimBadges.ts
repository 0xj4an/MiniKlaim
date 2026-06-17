"use client";

import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { getChain } from "@/lib/onchain/chains";
import { BADGES_CLAIM_ABI, badgesAddress } from "@/lib/onchain/badgesAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:claimBadges");

export type BadgeClaimOutcome =
  | { status: "user-claimed"; txHash: Hex }
  | { status: "sponsored" }
  | { status: "none" }
  | { status: "error" };

type Voucher = {
  badgeIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

/**
 * Player-submitted badge mint on the active chain. Player submits their own
 * `claimBadges` tx (gated by a per-chain EIP-712 voucher); relayer sponsor is
 * the fallback. USDm fee abstraction only where supported (Celo).
 */
export function useClaimBadges(address: Address | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (addr: string): Promise<BadgeClaimOutcome> => {
      const res = await fetch(
        `/api/users/${addr.toLowerCase()}/badges/sponsor-mint?chain=${chainKey}`,
        { method: "POST" },
      );
      if (!res.ok) {
        log.error("badge sponsor fallback failed", { status: res.status });
        return { status: "error" };
      }
      log.info("sponsored badge mint done", { addr });
      return { status: "sponsored" };
    },
    [chainKey],
  );

  const claim = useCallback(async (): Promise<BadgeClaimOutcome> => {
    const chain = getChain(chainKey);
    const contract = badgesAddress(chainKey);
    if (!address) return { status: "none" };
    if (!walletClient || !contract) {
      log.info("no wallet/contract; using sponsor fallback");
      return sponsorFallback(address);
    }

    let voucher: Voucher;
    try {
      const res = await fetch(
        `/api/users/${address.toLowerCase()}/badges/voucher?chain=${chainKey}`,
        { method: "POST" },
      );
      if (res.status === 409) {
        log.info("no eligible badges to claim");
        return { status: "none" };
      }
      if (!res.ok) throw new Error(`voucher status ${res.status}`);
      voucher = (await res.json()) as Voucher;
    } catch (e) {
      log.warn("badge voucher fetch failed; sponsoring", {
        message: e instanceof Error ? e.message : String(e),
      });
      return sponsorFallback(address);
    }

    const hasUsdm = (balances.USDm?.value ?? 0n) > 0n;
    const feeCurrency =
      chain.feeCurrency && hasUsdm ? chain.feeCurrency : undefined;
    try {
      const txHash = await walletClient.writeContract({
        address: contract,
        abi: BADGES_CLAIM_ABI,
        functionName: "claimBadges",
        args: [
          voucher.badgeIds.map((b) => BigInt(b)),
          BigInt(voucher.nonce),
          voucher.signature,
        ],
        chain: chain.chain,
        account: address,
        ...(feeCurrency ? { feeCurrency } : {}),
      });
      log.info("claimBadges submitted by player", { chainKey, txHash });
      return { status: "user-claimed", txHash };
    } catch (e) {
      log.warn("player badge claim failed; sponsoring", {
        message: e instanceof Error ? e.message : String(e),
      });
      return sponsorFallback(address);
    }
  }, [walletClient, address, chainKey, balances.USDm, sponsorFallback]);

  return { claim };
}
