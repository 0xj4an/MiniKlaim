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
import { isUserRejection } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";
import { reportDeclined, runTokenHeaders } from "@/lib/wallet/runTokens";
import {
  sponsorRefusalFor,
  sponsorWantsPlayerToPay,
} from "@/lib/wallet/sponsorOutcome";

const log = createLogger("wallet:claimRun");

/**
 * Collapse the sponsor's answer into an outcome, for the call sites where the
 * player cannot take over: no wallet at all, or no voucher to sign. A
 * hand-over there is a failure, because there is nobody to hand it to.
 */
function orFailed(
  outcome: ClaimOutcome | "refused" | "player-pays",
): ClaimOutcome {
  return outcome === "refused" || outcome === "player-pays"
    ? "failed"
    : outcome;
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
 * MiniPay/Farcaster, Soneium via Startale).
 *
 * The relayer is asked first, so finishing a run costs the player nothing.
 * Until 4 Nov 2026 it was the other way round, and the numbers said so: over
 * 7 days, 423 claims were signed and paid by players against 106 sponsored.
 * The server decides, and it only pays while its own balance is above the
 * claim floor, so this is a promise that unwinds by itself rather than one
 * that breaks.
 *
 * When the relayer hands the claim back (it is low on funds and the player
 * can pay, the wallet is past its daily allowance, or the relayer tx failed)
 * the player submits their own `claimRun`, gated by a backend EIP-712 voucher
 * so they are the on-chain msg.sender. A declined signature is never
 * sponsored afterwards: the player said no, and asking the relayer would
 * claim the run they just refused to claim.
 */
export function useClaimRun(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (
      runId: string,
      shortfall = false,
    ): Promise<ClaimOutcome | "refused" | "player-pays"> => {
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
        if (sponsorWantsPlayerToPay(res.status)) {
          log.info("sponsor hands the claim to the player", {
            runId,
            status: res.status,
          });
          return "player-pays";
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

      // The relayer first: the claim is free while it has the funds. Anything
      // other than a hand-over is final, including a 403 (this browser has no
      // run token, so the player's own voucher would be refused too).
      const sponsored = await sponsorFallback(runId);
      if (sponsored !== "player-pays") return orFailed(sponsored);

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

      // Fee abstraction only where supported (Celo CIP-64). The relayer has
      // already been asked and handed the claim back, so there is nothing to
      // gain by asking it again here: the player pays, in a held stablecoin
      // if they have one and in CELO if they do not.
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
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
        // The wallet failed and it was not a decline, so the player cannot
        // pay after all. `shortfall` tells the server to skip its own
        // affordability check, which is the one thing that changed since it
        // handed the claim over a moment ago.
        const retry = await sponsorFallback(runId, true);
        return orFailed(retry === "player-pays" ? "failed" : retry);
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
