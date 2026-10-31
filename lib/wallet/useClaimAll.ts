"use client";

import { fetchWithRetry, isNetworkError, isSponsorInProgress } from "@/lib/client/netRetry";
import * as Sentry from "@sentry/nextjs";
import { useCallback } from "react";
import { encodeFunctionData, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import {
  heldFeeAdaptersForWallet,
  walletPaysGasInToken,
} from "@/lib/wallet/feeSupport";
import {
  CLAIM_ROUTER_ABI,
  claimRouterAddress,
} from "@/lib/onchain/claimRouterAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import {
  clearRunClaiming,
  dropBadgeClaims,
  markBadgeClaimSubmitted,
  markRunClaiming,
} from "@/lib/wallet/claimInFlight";
import {
  errorText,
  isUnpayableFee,
  isUserRejection,
  isWalletInternalError,
  playerHasNoFeeBalance,
} from "@/lib/wallet/playerFee";
import { shortfallHeaders } from "@/lib/onchain/sponsorHeaders";
import { orderHeldByBalance, sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { TOKENS } from "@/lib/tokens";
import { useBalances } from "@/lib/wallet/useBalances";
import { useClaimRun } from "@/lib/wallet/useClaimRun";
import { reportDeclined, runTokenHeaders } from "@/lib/wallet/runTokens";
import { sponsorRefusalFor } from "@/lib/wallet/sponsorOutcome";

const log = createLogger("wallet:claimAll");

function reasonOf(e: unknown): string {
  return errorText(e).slice(0, 200);
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
 * The player pays the network fee. When their tx cannot go through the client
 * asks the relayer, and the server decides: it refuses players who can pay
 * and caps each wallet per day. A declined signature is reported and never
 * sponsored, not even by the retry cron.
 */
export function useClaimAll(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);
  const { claim: legacyClaim } = useClaimRun(address, enabled);

  const sponsorFallback = useCallback(
    async (
      runId: string,
      addr: string,
      hadBadges: boolean,
      trigger: string,
    ): Promise<ClaimAllOutcome | "badges_failed" | "refused"> => {
      try {
        const res = await fetchWithRetry(
          `/api/runs/${runId}/sponsor-mint?chain=${chainKey}`,
          {
            method: "POST",
            headers: {
              ...runTokenHeaders(runId),
              ...shortfallHeaders(
                trigger === "no_balance" ||
                  trigger === "fee_shortfall" ||
                  trigger === "tx_error",
              ),
            },
          },
        );
        if (await isSponsorInProgress(res)) {
          // A retry reached the server while the first call is still minting.
          log.info("sponsor already in progress", { runId });
          track("run_claim_sponsored", { had_badges: hadBadges, trigger });
          return "sponsored";
        }
        const refusal = sponsorRefusalFor(res.status);
        if (refusal) {
          // The server decided: the player can pay their own fee, this wallet
          // used today's allowance, or this client does not hold the run
          // token. Not an error on our side.
          const body = (await res.json().catch(() => ({}))) as { reason?: string };
          log.warn("sponsor refused", { runId, status: res.status, reason: body.reason });
          track("run_claim_failed", {
            trigger: `sponsor_refused:${body.reason ?? res.status}`,
          });
          return refusal;
        }
        if (!res.ok) {
          let detail = "";
          try {
            const body = (await res.json()) as { reason?: unknown };
            if (typeof body.reason === "string") detail = body.reason.slice(0, 120);
          } catch {
            detail = "";
          }
          log.error("sponsor fallback failed", { runId, status: res.status, detail });
          track("run_claim_failed", {
            trigger: detail
              ? `sponsor_http_${res.status}:${detail}`
              : `sponsor_http_${res.status}`,
          });
          Sentry.captureMessage("run sponsor mint failed", {
            level: "warning",
            tags: { claim: "sponsor" },
            extra: { runId, status: res.status, reason: detail },
          });
          return "failed";
        }
        if (hadBadges) {
          const bRes = await fetchWithRetry(
            `/api/users/${addr.toLowerCase()}/badges/sponsor-mint?chain=${chainKey}&runId=${runId}`,
            {
              method: "POST",
              headers: {
                ...runTokenHeaders(runId),
                ...shortfallHeaders(
                trigger === "no_balance" ||
                  trigger === "fee_shortfall" ||
                  trigger === "tx_error",
              ),
              },
            },
          );
          if (!bRes.ok) {
            log.warn("sponsored badge mint failed", {
              runId,
              status: bRes.status,
            });
            // 402/429 are refusals (can pay, daily cap), not failures; the
            // badges stay claimable from the badge prompt.
            if (bRes.status !== 402 && bRes.status !== 429) {
              Sentry.captureMessage("badge sponsor mint failed", {
                level: "warning",
                tags: { claim: "badge-sponsor" },
                extra: { runId, status: bRes.status },
              });
            }
            track("run_claim_sponsored", { had_badges: true, trigger });
            return "badges_failed";
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
        // Offline after three tries is the player's signal, not our bug. The
        // run stays pending and the claim prompt offers it again.
        if (isNetworkError(e)) {
          Sentry.captureMessage("sponsor unreachable after retries", {
            level: "warning",
            tags: { claim: "sponsor", network: "offline" },
            extra: { runId, message: reasonOf(e) },
          });
        } else {
          Sentry.captureException(e, {
            tags: { claim: "sponsor" },
            extra: { runId },
          });
        }
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
          const res = await fetchWithRetry(
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
          log.warn("claimAll voucher fetch failed", {
            runId,
            message: reasonOf(e),
          });
          track("run_claim_voucher_failed", {
            status: voucherStatus,
            reason: reasonOf(e),
          });
          return sponsorFallback(runId, address, true, "voucher_failed").then(
            (outcome) =>
              outcome === "badges_failed"
                ? "sponsored"
                : outcome === "refused"
                  ? "failed"
                  : outcome,
          );
        }

        const badgeIds = voucher.badgeIds.map(Number);
        const chain = getChain(chainKey);
        const held = orderHeldByBalance(
          heldFeeAdaptersForWallet(chain.feeCurrencies, balances),
          (symbol) => {
            const bal = balances[symbol];
            return bal
              ? { value: bal.value, decimals: TOKENS[symbol].decimals }
              : null;
          },
        );
        const sponsorWithBadges = async (
          trigger: "no_balance" | "fee_shortfall" | "tx_error",
        ): Promise<ClaimAllOutcome | "refused"> => {
          if (badgeIds.length > 0) markBadgeClaimSubmitted(badgeIds);
          const outcome = await sponsorFallback(
            runId,
            address,
            badgeIds.length > 0,
            trigger,
          );
          if (
            (outcome === "failed" ||
              outcome === "badges_failed" ||
              outcome === "refused") &&
            badgeIds.length > 0
          ) {
            dropBadgeClaims(badgeIds);
          }
          return outcome === "badges_failed" ? "sponsored" : outcome;
        };

        const minipay = walletPaysGasInToken();
        if (
          minipay &&
          playerHasNoFeeBalance(chain.feeCurrencies.length, held.length, balances)
        ) {
          // Nothing in USDT, USDC, or USDm. The relayer pays. A CELO balance
          // does not open a signature sheet.
          log.info("no fee stablecoin; asking the relayer", { runId });
          const outcome = await sponsorWithBadges("no_balance");
          return outcome === "refused" ? "failed" : outcome;
        }
        // One stablecoin, the largest balance. If it cannot cover the fee the
        // relayer pays. A dust token is not another sheet, and neither is CELO.
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
        try {
          const { result: txHash, fee } = await sendWithFeeFallback(
            minipay ? held.slice(0, 1) : held,
            (fee) =>
              walletClient.sendTransaction({
                to: contract,
                data: withAttribution(data),
                chain: chain.chain,
                account: address,
                kzg: undefined,
                ...(fee ? { feeCurrency: fee.adapter } : {}),
              }),
            (fee, next) =>
              log.warn("fee currency short, trying next", {
                runId,
                fee: fee?.symbol ?? "CELO",
                next: next?.symbol ?? "CELO",
              }),
            { native: !minipay },
          );
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
            await fetch(`/api/runs/${runId}/claimed?chain=${chainKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ txHash }),
            });
          }
          return "claimed";
        } catch (e) {
          lastError = e;
        }
        if (isUserRejection(lastError)) {
          log.warn("player claimAll declined", {
            runId,
            message: reasonOf(lastError),
          });
          track("run_claim_rejected", {
            hex_count: voucher.h3Ids.length,
            badge_count: badgeIds.length,
            reason: reasonOf(lastError),
          });
          await reportDeclined(runId);
          return "failed";
        }
        if (isWalletInternalError(lastError)) {
          track("run_claim_wallet_error", { reason: reasonOf(lastError) });
        }
        log.warn("player claimAll failed; relayer mints", {
          runId,
          message: reasonOf(lastError),
        });
        const outcome = await sponsorWithBadges(
          isUnpayableFee(lastError) ? "fee_shortfall" : "tx_error",
        );
        return outcome === "refused" ? "failed" : outcome;
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
      balances.isLoading,
      balances.isError,
      sponsorFallback,
      legacyClaim,
    ],
  );

  return { claim };
}
