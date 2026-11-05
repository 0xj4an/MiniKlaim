"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { HEXES_MINT_TOKENS_ABI } from "@/lib/onchain/hexesAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import * as Sentry from "@sentry/nextjs";
import {
  mintFailureFingerprint,
  mintFailureKind,
  mintFailureTitle,
  shouldReportMintFailure,
} from "@/lib/wallet/mintFailure";
import { errorText, isUserRejection } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:mintTokens");

export type MintQuote = { count: number; usd: number | null };

export type TokenStatus = {
  enabled: boolean;
  recorded: number;
  tokens: number;
  maxPerTx: number;
  nextBatch: number;
  /** The smaller batch offered beside the whole lot, when there is one. */
  smallBatch: number | null;
  /** What each offered batch costs the player, in dollars. */
  quotes: MintQuote[];
  /**
   * What finishing the whole pile takes, not just the next tap. A player with
   * a big run had no way of knowing that minting is one signature per batch,
   * so the second wallet prompt read as a bug.
   */
  plan: {
    signatures: number;
    batches: number[];
    /** Dollars for every batch together. Null for a single signature. */
    usd: number | null;
  };
};

type Voucher = {
  h3Ids: string[];
  nonce: string;
  deadline: string;
  signature: Hex;
  contract: Address;
};

export type MintTokensState =
  | "idle"
  | "fetching-voucher"
  | "sending"
  | "confirming"
  | "done"
  | "rejected"
  | "no_fee"
  | "refused"
  | "error";

/**
 * "Mint your blocks as NFTs" in the profile. Runs settle as on-chain records
 * (Hexes v2); this turns up to `maxPerTx` recorded blocks into ERC-721 tokens
 * per tap, one wallet approval each, paid by the player.
 */
export function useMintTokens(address: Address | null) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, !!address);
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [state, setState] = useState<MintTokensState>("idle");
  const [lastMinted, setLastMinted] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void fetch(`/api/users/${address}/tokens?chain=${chainKey}`)
      .then((r) => (r.ok ? (r.json() as Promise<TokenStatus>) : null))
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainKey, refresh]);

  /** `limit` mints a slice instead of everything; the fee grows with it. */
  const mint = useCallback(
    async (limit?: number) => {
      if (!walletClient || !address) return;
      setState("fetching-voucher");
      let voucher: Voucher;
      try {
        const res = await fetch(
          `/api/users/${address}/tokens/voucher?chain=${chainKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(limit ? { limit } : {}),
          },
        );
        if (res.status === 409) {
          setState("idle");
          setRefresh((n) => n + 1);
          return;
        }
        if (!res.ok) throw new Error(`voucher status ${res.status}`);
        voucher = (await res.json()) as Voucher;
      } catch (e) {
        log.warn("mint voucher failed", {
          message: e instanceof Error ? e.message : String(e),
        });
        track("nft_mint_failed", { reason: "voucher" });
        setState("error");
        return;
      }

      track("nft_mint_started", { count: voucher.h3Ids.length });
      setState("sending");
      let txHash: Hex;
      try {
        const chain = getChain(chainKey);
        const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
        const data = encodeFunctionData({
          abi: HEXES_MINT_TOKENS_ABI,
          functionName: "mintTokens",
          args: [
            voucher.h3Ids.map((h) => BigInt(h)),
            BigInt(voucher.nonce),
            BigInt(voucher.deadline),
            voucher.signature,
          ],
        });
        ({ result: txHash } = await sendWithFeeFallback(held, (fee) =>
          walletClient.sendTransaction({
            to: voucher.contract,
            data: withAttribution(data),
            chain: chain.chain,
            account: address,
            kzg: undefined,
            ...(fee ? { feeCurrency: fee.adapter } : {}),
          }),
        ));
      } catch (e) {
        if (isUserRejection(e)) {
          track("nft_mint_failed", { reason: "rejected" });
          setState("rejected");
          return;
        }
        // Keep the wallet's own message: "tx" alone left 32 failures on 20-21
        // Oct undiagnosable.
        const message = errorText(e).slice(0, 200);
        const kind = mintFailureKind(e);
        log.warn("mintTokens tx failed", { kind, message });
        track("nft_mint_failed", {
          reason: kind,
          message,
          count: voucher.h3Ids.length,
        });
        // `no_fee` is the player not having the fee, not a fault: the amount is
        // shown on the button before they tap, the screen says the balance is
        // short, and PostHog counts it. Paging on it is the same mistake as
        // reporting a refused run token as a failed mint (MINIKLAIM-N, 27 Oct),
        // which buried the real failures. Of 14 days of nft_mint_failed, 69 are
        // `tx` and all of them predate #127; the last three days are 8 no_fee,
        // 3 wallet_internal and 2 rejected, so what Sentry has been showing
        // since is noise.
        // Fingerprint on the kind, not on the message. The tag alone did
        // not group, so every non-no_fee failure piled into one issue titled
        // `Module.T` (MINIKLAIM-1G): three unrelated faults counted as one,
        // which is what made the rate meaningless. The message stays in
        // `extra`, where it explains an event without splitting the issue.
        if (shouldReportMintFailure(kind))
          Sentry.captureMessage(mintFailureTitle(kind), {
            level: "warning",
            tags: { claim: "nft-mint", kind },
            fingerprint: mintFailureFingerprint(kind),
            extra: { message, count: voucher.h3Ids.length },
          });
        setState(
          kind === "no_fee"
            ? "no_fee"
            : kind === "permission_denied"
              ? "refused"
              : "error",
        );
        return;
      }

      setState("confirming");
      try {
        const res = await fetch(
          `/api/users/${address}/tokens/confirm?chain=${chainKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as {
          minted?: number;
        };
        setLastMinted(body.minted ?? voucher.h3Ids.length);
        track("nft_mint_confirmed", {
          count: body.minted ?? 0,
          tx_hash: txHash,
        });
      } catch {
        // The tx is on-chain; the next voucher re-checks ownerOf and catches up.
        setLastMinted(voucher.h3Ids.length);
      }
      setState("done");
      setRefresh((n) => n + 1);
    },
    // The individual `balances.<sym>` values are memoized inside useBalances,
    // so listing them keeps the callback stable across renders. Depending on
    // `balances` itself (a new object every render) would rebuild the callback
    // on every render. The directive has to sit on the line before the array,
    // not inside the body: placed there it disabled nothing and the rule was
    // reporting a missing `balances` dependency unnoticed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      walletClient,
      address,
      chainKey,
      balances.USDm,
      balances.USDC,
      balances.USDT,
    ],
  );

  /**
   * Re-read the pending count. The run summary needs this: it mounts before
   * the claim finishes, so the first read predates the blocks the player has
   * just captured.
   */
  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  return { status, state, mint, lastMinted, reload };
}
