"use client";

import { useCallback } from "react";
import { encodeFunctionData, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain, heldFeeAdapters } from "@/lib/onchain/chains";
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

/**
 * Provider errors lead with a viem wrapper and bury the wallet's own message
 * under "Request Arguments". Prefer `details`, which is that message.
 */
function errorText(e: unknown): string {
  const parts: string[] = [];
  if (e && typeof e === "object" && "details" in e) {
    const details = (e as { details?: unknown }).details;
    if (typeof details === "string") parts.push(details);
  }
  if (e instanceof Error) parts.push(e.message);
  else if (parts.length === 0) parts.push(String(e));
  return parts.join(" ");
}

function reasonOf(e: unknown): string {
  return errorText(e).slice(0, 200);
}

/** Node rejected the fee token before the player could confirm. */
function isInsufficientFee(e: unknown): boolean {
  return errorText(e).toLowerCase().includes("insufficient fee-currency");
}

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
 * provides. MiniPay's listing review asked for that single approval and
 * rejected both multiple prompts and a fully sponsored (zero-popup) finish.
 * Chains without a deployed router fall back to the original two-tx flow.
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
      trigger: string,
    ): Promise<ClaimAllOutcome> => {
      try {
        const res = await fetch(
          `/api/runs/${runId}/sponsor-mint?chain=${chainKey}`,
          { method: "POST" },
        );
        if (!res.ok) {
          log.error("sponsor fallback failed", { runId, status: res.status });
          track("run_claim_failed", { trigger: `sponsor_http_${res.status}` });
          return "failed";
        }
        if (hadBadges) {
          const bRes = await fetch(
            `/api/users/${addr.toLowerCase()}/badges/sponsor-mint?chain=${chainKey}`,
            { method: "POST" },
          );
          // Hexes already landed, so the run is not a loss. Record the badge
          // half separately rather than failing the whole claim over it.
          if (!bRes.ok) {
            log.warn("sponsored badge mint failed", {
              runId,
              status: bRes.status,
            });
          }
        }
        log.info("sponsored combined claim done", { runId });
        track("run_claim_sponsored", { had_badges: hadBadges, trigger });
        return "sponsored";
      } catch (e) {
        log.error("sponsor fallback threw", {
          runId,
          message: reasonOf(e),
        });
        track("run_claim_failed", { trigger: `sponsor_threw:${reasonOf(e)}` });
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
        track("run_claim_started", { path: "two_tx" });
        const outcome = await legacyClaim(runId);
        if (outcome === "user-claimed") return "claimed";
        if (outcome === "sponsored") return "sponsored";
        if (outcome === "no-hexes") return "nothing";
        return "failed";
      }

      markRunClaiming(runId);
      track("run_claim_started", { path: "router" });
      try {
        let voucher: Voucher;
        let voucherStatus = 0;
        try {
          const res = await fetch(
            `/api/runs/${runId}/claim-all/voucher?chain=${chainKey}`,
            { method: "POST" },
          );
          if (res.status === 409) {
            log.info("nothing to settle for run", { runId });
            track("run_claim_nothing", {});
            return "nothing";
          }
          voucherStatus = res.status;
          if (!res.ok) throw new Error(`voucher status ${res.status}`);
          voucher = (await res.json()) as Voucher;
        } catch (e) {
          log.warn("claimAll voucher fetch failed; sponsoring", {
            runId,
            message: reasonOf(e),
          });
          track("run_claim_voucher_failed", {
            status: voucherStatus,
            reason: reasonOf(e),
          });
          return sponsorFallback(runId, address, true, "voucher_failed");
        }

        const badgeIds = voucher.badgeIds.map(Number);
        const chain = getChain(chainKey);
        const held = heldFeeAdapters(chain.feeCurrencies, balances);
        // USDT first. An empty list means omit feeCurrency and let the wallet
        // choose. A short USDT balance retries the next held stablecoin
        // before the relayer, still as one confirmation.
        const attempts = held.length > 0 ? held : [undefined];
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
        let lastError: unknown;
        for (let i = 0; i < attempts.length; i++) {
          const fee = attempts[i];
          try {
            const txHash = await walletClient.sendTransaction({
              to: contract,
              data: withAttribution(data),
              chain: chain.chain,
              account: address,
              kzg: undefined,
              ...(fee ? { feeCurrency: fee.adapter } : {}),
            });
            log.info("claimAll submitted by player", {
              runId,
              chainKey,
              txHash,
              fee: fee?.symbol ?? "native",
              hexCount: voucher.h3Ids.length,
              badgeCount: badgeIds.length,
            });
            // These badges are now on-chain but unconfirmed, so the badge prompt
            // must not offer them again while the chain read still lags.
            track("run_claim_submitted", {
              hex_count: voucher.h3Ids.length,
              badge_count: badgeIds.length,
              tx_hash: txHash,
              fee_currency: !!fee,
            });
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
            lastError = e;
            const next = attempts[i + 1];
            if (fee && next && isInsufficientFee(e)) {
              log.warn("fee currency short, trying next", {
                runId,
                fee: fee.symbol,
                next: next.symbol,
              });
              continue;
            }
            break;
          }
        }
        log.warn("player claimAll failed; sponsoring", {
          runId,
          message: reasonOf(lastError),
        });
        track("run_claim_rejected", {
          hex_count: voucher.h3Ids.length,
          badge_count: badgeIds.length,
          reason: reasonOf(lastError),
        });
        return sponsorFallback(
          runId,
          address,
          badgeIds.length > 0,
          "tx_rejected",
        );
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
