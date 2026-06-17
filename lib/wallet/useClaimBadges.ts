"use client";

import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { celo } from "viem/chains";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { BADGES_CLAIM_ABI, badgesAddress } from "@/lib/onchain/badgesAbi";
import { TOKENS } from "@/lib/tokens";
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
 * Drives the player-submitted badge mint. Primary path: the player submits their
 * own `claimBadges` tx (gated by a backend EIP-712 voucher), so they are the
 * on-chain `msg.sender` and count as a unique active wallet. Gas is paid in USDm
 * via fee abstraction when they hold USDm (MiniPay), otherwise in native CELO.
 *
 * Fallback: if the player has no funds / declines / the wallet errors, the
 * backend relayer mints for them (sponsored). They still receive their badges.
 */
export function useClaimBadges(address: Address | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (addr: string): Promise<BadgeClaimOutcome> => {
      const res = await fetch(
        `/api/users/${addr.toLowerCase()}/badges/sponsor-mint`,
        { method: "POST" },
      );
      if (!res.ok) {
        log.error("badge sponsor fallback failed", { status: res.status });
        return { status: "error" };
      }
      log.info("sponsored badge mint done", { addr });
      return { status: "sponsored" };
    },
    [],
  );

  const claim = useCallback(async (): Promise<BadgeClaimOutcome> => {
    const contract = badgesAddress();
    if (!address) return { status: "none" };
    if (!walletClient || !contract) {
      log.info("no wallet/contract; using sponsor fallback");
      return sponsorFallback(address);
    }

    // 1. Ask the backend for a voucher authorizing the player's eligible badges.
    let voucher: Voucher;
    try {
      const res = await fetch(
        `/api/users/${address.toLowerCase()}/badges/voucher`,
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

    // 2. Player submits their own claimBadges tx. Pay gas in USDm if they hold
    //    it (MiniPay fee abstraction); otherwise let the wallet use CELO.
    const hasUsdm = (balances.USDm?.value ?? 0n) > 0n;
    const feeCurrency = hasUsdm ? TOKENS.USDm.feeAdapter : undefined;
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
        chain: celo,
        account: address,
        ...(feeCurrency ? { feeCurrency } : {}),
      });
      log.info("claimBadges submitted by player", { txHash });
      return { status: "user-claimed", txHash };
    } catch (e) {
      // Rejected / insufficient funds / unsupported -> never block the player.
      log.warn("player badge claim failed; sponsoring", {
        message: e instanceof Error ? e.message : String(e),
      });
      return sponsorFallback(address);
    }
  }, [walletClient, address, balances.USDm, sponsorFallback]);

  return { claim };
}
