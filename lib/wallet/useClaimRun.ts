"use client";

import { fetchWithRetry, isSponsorInProgress } from "@/lib/client/netRetry";
import { useCallback } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { HEXES_CLAIM_ABI, hexesAddress } from "@/lib/onchain/hexesAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { clearRunClaiming, markRunClaiming } from "@/lib/wallet/claimInFlight";
import {
  nativeOnlyHeaders,
  shortfallHeaders,
} from "@/lib/onchain/sponsorHeaders";
import { walletPaysGasInToken } from "@/lib/wallet/feeSupport";
import { isUserRejection, playerHasNoFeeBalance } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";
import { reportDeclined, runTokenHeaders } from "@/lib/wallet/runTokens";
import { sponsorRefusalFor } from "@/lib/wallet/sponsorOutcome";

const log = createLogger("wallet:claimRun");

function orFailed(outcome: ClaimOutcome | "refused"): ClaimOutcome {
  return outcome === "refused" ? "failed" : outcome;
}

export type ClaimOutcome = "user-claimed" | "sponsored" | "no-hexes" | "failed";

type Voucher = {
  tokenIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

/**
 * Drives the post-finish on-chain hex mint on the active chain (Celo via
 * MiniPay/Farcaster, Soneium via Startale). Player submits their own `claimRun`
 * tx (gated by a backend EIP-712 voucher for that chain) so they are the
 * on-chain msg.sender. When their tx cannot go through the client asks the
 * relayer and the server decides (it refuses players who can pay and caps
 * each wallet per day). A declined signature is never sponsored.
 */
export function useClaimRun(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (
      runId: string,
      shortfall = false,
    ): Promise<ClaimOutcome | "refused"> => {
      try {
        const res = await fetchWithRetry(
          `/api/runs/${runId}/sponsor-mint?chain=${chainKey}`,
          {
            method: "POST",
            headers: {
              ...runTokenHeaders(runId),
              ...shortfallHeaders(shortfall),
              ...nativeOnlyHeaders(!walletPaysGasInToken()),
            },
          },
        );
        if (await isSponsorInProgress(res)) {
          log.info("sponsor already in progress", { runId });
          return "sponsored";
        }
        const refusal = sponsorRefusalFor(res.status);
        if (refusal) {
          log.warn("sponsor refused", { runId, status: res.status });
          return refusal;
        }
        if (!res.ok) {
          log.error("sponsor fallback failed", { runId, status: res.status });
          Sentry.captureMessage("run sponsor mint failed", {
            level: "warning",
            tags: { claim: "sponsor" },
            extra: { runId, status: res.status },
          });
          return "failed";
        }
        log.info("sponsored mint done", { runId });
        return "sponsored";
      } catch (e) {
        log.error("sponsor fallback threw", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        Sentry.captureException(e, {
          tags: { claim: "sponsor" },
          extra: { runId },
        });
        return "failed";
      }
    },
    [chainKey],
  );

  const submit = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      const chain = getChain(chainKey);
      const contract = hexesAddress(chainKey);
      if (!walletClient || !address || !contract) {
        log.info("no wallet/contract; relayer mints", { runId });
        return orFailed(await sponsorFallback(runId));
      }

      let voucher: Voucher;
      try {
        const res = await fetchWithRetry(
          `/api/runs/${runId}/voucher?chain=${chainKey}`,
          {
            method: "POST",
          },
        );
        if (res.status === 409) {
          log.info("run has no hexes", { runId });
          return "no-hexes";
        }
        if (!res.ok) throw new Error(`voucher status ${res.status}`);
        voucher = (await res.json()) as Voucher;
      } catch (e) {
        log.warn("voucher fetch failed; relayer mints", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        return orFailed(await sponsorFallback(runId));
      }

      // Fee abstraction only where supported (Celo CIP-64). No held stable
      // means the relayer pays. A decline does not.
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
      if (
        playerHasNoFeeBalance(chain.feeCurrencies.length, held.length, balances)
      ) {
        log.info("no fee stablecoin; asking the relayer", { runId });
        const outcome = await sponsorFallback(runId);
        // The server saw enough to pay (usually CELO, which the client does
        // not read). Fall through and let the player pay in CELO.
        if (outcome !== "refused") return outcome;
      }
      try {
        const data = encodeFunctionData({
          abi: HEXES_CLAIM_ABI,
          functionName: "claimRun",
          args: [
            voucher.tokenIds.map((t) => BigInt(t)),
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
        log.info("claimRun submitted by player", { runId, chainKey, txHash });
        await fetch(`/api/runs/${runId}/claimed?chain=${chainKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash }),
        });
        return "user-claimed";
      } catch (e) {
        if (isUserRejection(e)) {
          log.warn("player claim declined", {
            runId,
            message: e instanceof Error ? e.message : String(e),
          });
          await reportDeclined(runId);
          return "failed";
        }
        log.warn("player claim failed; relayer mints", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        // The wallet already failed (not a decline): the player cannot pay now.
        return orFailed(await sponsorFallback(runId, true));
      }
    },
    // The individual `balances.<sym>` values are memoized inside useBalances,
    // so listing them keeps the callback stable across renders. Depending on
    // `balances` directly (a new object each render) would re-create the
    // callback on every render.
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
    ],
  );

  /**
   * Register the run as in-flight for the whole attempt, including the time
   * the wallet drawer is open. `PendingClaimPrompt` consults this so a focus
   * event mid-approval cannot offer the player the same run a second time.
   */
  const claim = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      markRunClaiming(runId);
      try {
        return await submit(runId);
      } finally {
        clearRunClaiming(runId);
      }
    },
    [submit],
  );

  return { claim };
}
