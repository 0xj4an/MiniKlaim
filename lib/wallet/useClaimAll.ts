"use client";

import { useCallback } from "react";
import { encodeFunctionData, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain, pickFeeAdapter } from "@/lib/onchain/chains";
import {
  CLAIM_ROUTER_ABI,
  claimRouterAddress,
} from "@/lib/onchain/claimRouterAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import {
  clearRunClaiming,
  markBadgeClaimSubmitted,
  markRunClaiming,
} from "@/lib/wallet/claimInFlight";
import { useBalances } from "@/lib/wallet/useBalances";
import { useClaimRun } from "@/lib/wallet/useClaimRun";

const log = createLogger("wallet:claimAll");

export type ClaimAllOutcome = "claimed" | "sponsored" | "nothing" | "failed";

type Voucher = {
  h3Ids: string[];
  badgeIds: string[];
  nonce: string;
  signature: Hex;
  contract: `0x${string}`;
  chainId: number;
};

/**
 * Settle a finished run in ONE wallet approval via MiniKlaimClaimRouter: the
 * run's hexes and any badges just unlocked, in a single `claimAll` tx.
 *
 * MiniPay's provider is plain EIP-1193 with no EIP-5792, so a wallet cannot
 * bundle calls; one approval means one transaction, which is what the router
 * provides. Chains without a deployed router fall back to the original two-tx
 * `claimRun` + `claimBadges` flow, so this is safe to ship before the deploy.
 */
export function useClaimAll(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);
  const { claim: legacyClaim } = useClaimRun(address, enabled);

  /** Relayer covers both halves, mirroring what the combined tx would have done. */
  const sponsorFallback = useCallback(
    async (
      runId: string,
      addr: string,
      hadBadges: boolean,
    ): Promise<ClaimAllOutcome> => {
      try {
        const res = await fetch(
          `/api/runs/${runId}/sponsor-mint?chain=${chainKey}`,
          { method: "POST" },
        );
        if (!res.ok) {
          log.error("sponsor fallback failed", { runId, status: res.status });
          return "failed";
        }
        if (hadBadges) {
          await fetch(
            `/api/users/${addr.toLowerCase()}/badges/sponsor-mint?chain=${chainKey}`,
            { method: "POST" },
          );
        }
        log.info("sponsored combined claim done", { runId });
        return "sponsored";
      } catch (e) {
        log.error("sponsor fallback threw", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        return "failed";
      }
    },
    [chainKey],
  );

  const claim = useCallback(
    async (runId: string): Promise<ClaimAllOutcome> => {
      const contract = claimRouterAddress(chainKey);
      if (!contract || !walletClient || !address) {
        // No router on this chain yet: the two-tx path is still correct, and it
        // does its own in-flight bookkeeping.
        log.info("no router/wallet; using two-tx path", { runId, chainKey });
        const outcome = await legacyClaim(runId);
        if (outcome === "user-claimed") return "claimed";
        if (outcome === "sponsored") return "sponsored";
        if (outcome === "no-hexes") return "nothing";
        return "failed";
      }

      markRunClaiming(runId);
      try {
        let voucher: Voucher;
        try {
          const res = await fetch(
            `/api/runs/${runId}/claim-all/voucher?chain=${chainKey}`,
            { method: "POST" },
          );
          if (res.status === 409) {
            log.info("nothing to settle for run", { runId });
            return "nothing";
          }
          if (!res.ok) throw new Error(`voucher status ${res.status}`);
          voucher = (await res.json()) as Voucher;
        } catch (e) {
          log.warn("claimAll voucher fetch failed; sponsoring", {
            runId,
            message: e instanceof Error ? e.message : String(e),
          });
          return sponsorFallback(runId, address, true);
        }

        const badgeIds = voucher.badgeIds.map(Number);
        const chain = getChain(chainKey);
        const feeCurrency = pickFeeAdapter(chain.feeCurrencies, balances);
        try {
          const data = encodeFunctionData({
            abi: CLAIM_ROUTER_ABI,
            functionName: "claimAll",
            args: [
              voucher.h3Ids.map((h) => BigInt(h)),
              voucher.badgeIds.map((b) => BigInt(b)),
              BigInt(voucher.nonce),
              voucher.signature,
            ],
          });
          const txHash = await walletClient.sendTransaction({
            to: contract,
            data: withAttribution(data),
            chain: chain.chain,
            account: address,
            kzg: undefined,
            ...(feeCurrency ? { feeCurrency } : {}),
          });
          log.info("claimAll submitted by player", {
            runId,
            chainKey,
            txHash,
            hexCount: voucher.h3Ids.length,
            badgeCount: badgeIds.length,
          });
          // These badges are now on-chain but unconfirmed, so the badge prompt
          // must not offer them again while the chain read still lags.
          markBadgeClaimSubmitted(badgeIds);
          if (voucher.h3Ids.length > 0) {
            await fetch(`/api/runs/${runId}/claimed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ txHash }),
            });
          }
          return "claimed";
        } catch (e) {
          log.warn("player claimAll failed; sponsoring", {
            runId,
            message: e instanceof Error ? e.message : String(e),
          });
          return sponsorFallback(runId, address, badgeIds.length > 0);
        }
      } finally {
        clearRunClaiming(runId);
      }
    },
    // Individual balance fields are memoized in useBalances; listing them keeps
    // the callback stable across renders (the object itself is re-created).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      walletClient,
      address,
      chainKey,
      balances.USDm,
      balances.USDC,
      balances.USDT,
      sponsorFallback,
      legacyClaim,
    ],
  );

  return { claim };
}
