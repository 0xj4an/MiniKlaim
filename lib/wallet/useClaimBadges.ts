"use client";

import { fetchWithRetry } from "@/lib/client/netRetry";
import * as Sentry from "@sentry/nextjs";
import { useCallback } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { BADGES_CLAIM_ABI, badgesAddress } from "@/lib/onchain/badgesAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import {
  nativeOnlyHeaders,
  shortfallHeaders,
} from "@/lib/onchain/sponsorHeaders";
import { walletPaysGasInToken } from "@/lib/wallet/feeSupport";
import { isUserRejection, playerHasNoFeeBalance } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";
import { latestRunTokenFor, RUN_TOKEN_HEADER } from "@/lib/wallet/runTokens";
import { sponsorRefusalFor } from "@/lib/wallet/sponsorOutcome";

const log = createLogger("wallet:claimBadges");

export type BadgeClaimOutcome =
  | { status: "user-claimed"; txHash: Hex }
  | { status: "sponsored" }
  | { status: "none" }
  | { status: "rejected" }
  /**
   * `why` says what stopped it, for the message and for analytics: the
   * card used to say "could not claim, try again" for a daily limit that no
   * retry clears, and `badge_claim_failed` carried nothing to tell them
   * apart (17 events from 7 players on 22 Nov 2026, none explainable).
   */
  | { status: "error"; why: BadgeClaimFailure };

export type BadgeClaimFailure =
  | "daily_cap"
  | "no_run_token"
  | "network"
  | `sponsor_${number}`;

type Voucher = {
  badgeIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

/**
 * Player-submitted badge mint on the active chain. The player pays the
 * network fee. The relayer mints when they cannot pay or the attempt fails
 * for any reason other than a declined signature.
 */
export function useClaimBadges(address: Address | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (addr: string, shortfall = false): Promise<BadgeClaimOutcome> => {
      // The server only sponsors for the client that played one of this
      // wallet's runs. Without a run token the player pays.
      const proof = latestRunTokenFor(addr);
      if (!proof) {
        log.warn("no run token for badge sponsor; player must pay");
        return { status: "error", why: "no_run_token" };
      }
      try {
        const res = await fetchWithRetry(
          `/api/users/${addr.toLowerCase()}/badges/sponsor-mint?chain=${chainKey}&runId=${proof.runId}`,
          {
            method: "POST",
            headers: {
              [RUN_TOKEN_HEADER]: proof.token,
              ...shortfallHeaders(shortfall),
              ...nativeOnlyHeaders(!walletPaysGasInToken()),
            },
          },
        );
        if (!res.ok) {
          log.error("badge sponsor fallback failed", { status: res.status });
          if (!sponsorRefusalFor(res.status))
            Sentry.captureMessage("badge sponsor mint failed", {
              level: "warning",
              tags: { claim: "badge-sponsor" },
              extra: { status: res.status },
            });
          const refusal = (await res.json().catch(() => null)) as {
            reason?: string;
          } | null;
          return {
            status: "error",
            why:
              res.status === 429 || refusal?.reason === "daily_cap"
                ? "daily_cap"
                : `sponsor_${res.status}`,
          };
        }
        log.info("sponsored badge mint done", { addr });
        return { status: "sponsored" };
      } catch (e) {
        log.error("badge sponsor fallback network error", {
          message: e instanceof Error ? e.message : String(e),
        });
        Sentry.captureException(e, { tags: { claim: "badge-sponsor" } });
        return { status: "error", why: "network" };
      }
    },
    [chainKey],
  );

  const claim = useCallback(async (): Promise<BadgeClaimOutcome> => {
    const chain = getChain(chainKey);
    const contract = badgesAddress(chainKey);
    if (!address) return { status: "none" };
    if (!walletClient || !contract) {
      log.info("no wallet/contract; relayer mints badges");
      return sponsorFallback(address);
    }

    let voucher: Voucher;
    try {
      const res = await fetchWithRetry(
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
      log.warn("badge voucher fetch failed; relayer mints", {
        message: e instanceof Error ? e.message : String(e),
      });
      return sponsorFallback(address);
    }

    const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
    if (
      playerHasNoFeeBalance(chain.feeCurrencies.length, held.length, balances)
    ) {
      log.info("no fee balance; relayer mints badges");
      return sponsorFallback(address);
    }
    try {
      const data = encodeFunctionData({
        abi: BADGES_CLAIM_ABI,
        functionName: "claimBadges",
        args: [
          voucher.badgeIds.map((b) => BigInt(b)),
          BigInt(voucher.nonce),
          voucher.signature,
        ],
      });
      // Held stablecoins first, then CELO if they are too short.
      const { result: txHash } = await sendWithFeeFallback(held, (fee) =>
        walletClient.sendTransaction({
          to: contract,
          data: withAttribution(data),
          chain: chain.chain,
          account: address,
          kzg: undefined,
          ...(fee ? { feeCurrency: fee.adapter } : {}),
        }),
      );
      log.info("claimBadges submitted by player", { chainKey, txHash });
      return { status: "user-claimed", txHash };
    } catch (e) {
      if (isUserRejection(e)) {
        log.warn("player badge claim declined", {
          message: e instanceof Error ? e.message : String(e),
        });
        return { status: "rejected" };
      }
      log.warn("player badge claim failed; relayer mints", {
        message: e instanceof Error ? e.message : String(e),
      });
      // The wallet already failed (not a decline): the player cannot pay now.
      return sponsorFallback(address, true);
    }
    // Individual balance fields are memoized in useBalances; listing them
    // keeps the callback stable across renders (unlike the whole `balances`
    // object, which is re-created on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walletClient,
    address,
    chainKey,
    balances.USDm,
    balances.USDC,
    balances.USDT,
    balances.isLoading,
    balances.isError,
    sponsorFallback,
  ]);

  // Whether the player's own wallet will send the claim, so the prompt can
  // quote the fee. Mirrors the checks in `claim`: no wallet, no contract or
  // no balance to pay with sends it to the relayer instead.
  const chainForFee = getChain(chainKey);
  const playerPays =
    !!walletClient &&
    !!address &&
    !!badgesAddress(chainKey) &&
    !balances.isLoading &&
    !balances.isError &&
    !playerHasNoFeeBalance(
      chainForFee.feeCurrencies.length,
      heldFeeAdaptersForWallet(chainForFee.feeCurrencies, balances).length,
      balances,
    );

  return { claim, playerPays };
}
