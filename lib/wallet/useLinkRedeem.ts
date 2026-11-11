"use client";

import { useCallback, useState } from "react";
import { createPublicClient, http, keccak256, toBytes, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import {
  errorText,
  isPermissionDenied,
  isUserRejection,
} from "@/lib/wallet/playerFee";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:linkRedeem");

/** How long to keep asking while the backend cannot see the receipt yet. */
const PENDING_RETRIES = 5;
const PENDING_DELAY_MS = 2000;

export type LinkRedeemState =
  "idle" | "sending" | "confirming" | "linked" | "error";

/**
 * Redeem a link code from the current wallet by sending a 0-value tx to the
 * chain's link-verifier address with `keccak256(code)` as calldata. Backend
 * reads the tx receipt to derive the redeemer and links it to the code's
 * player. Works uniformly in MiniPay, Farcaster, Startale and browser wallets
 * (MiniPay does not support `personal_sign` but supports sending txs).
 *
 * Gas is paid via USDm fee abstraction on Celo when the player holds USDm;
 * otherwise the wallet pays in the native currency.
 */
export function useLinkRedeem(address: `0x${string}` | null) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, !!address);
  const [state, setState] = useState<LinkRedeemState>("idle");

  const redeem = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const code = rawCode.trim().toUpperCase();
      if (!code || !walletClient || !address) {
        setState("error");
        return false;
      }
      const chain = getChain(chainKey);
      const codeHash = keccak256(toBytes(code));
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);

      track("link_redeem_started", { chain: chainKey });

      setState("sending");
      let txHash: Hex;
      try {
        ({ result: txHash } = await sendWithFeeFallback(held, (fee) =>
          walletClient.sendTransaction({
            account: address,
            to: chain.linkVerifier,
            value: 0n,
            data: withAttribution(codeHash),
            chain: chain.chain,
            kzg: undefined,
            ...(fee ? { feeCurrency: fee.adapter } : {}),
          }),
        ));
        log.info("link tx submitted", { chainKey, txHash });
      } catch (e) {
        log.warn("link tx rejected", {
          message: e instanceof Error ? e.message : String(e),
        });
        // Split what used to be one bucket. Yesterday's numbers said 30 of 30
        // redeems failed here and gave no way to tell a player who tapped
        // cancel from a wallet that refused the send, which are different
        // problems: one is the prompt being alarming, the other is MiniPay
        // declining a 0-value tx carrying calldata to an address with no
        // contract code. Guessing between them is how P67 went wrong, so
        // measure instead.
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code?: unknown }).code)
            : undefined;
        track("link_redeem_failed", {
          reason: isUserRejection(e)
            ? "user_cancelled"
            : isPermissionDenied(e)
              ? "permission_denied"
              : "wallet",
          message: errorText(e).slice(0, 400),
          ...(code ? { code } : {}),
        });
        setState("error");
        return false;
      }

      setState("confirming");
      try {
        const pub = createPublicClient({
          chain: chain.chain,
          transport: http(),
        });
        await pub.waitForTransactionReceipt({ hash: txHash });
      } catch (e) {
        log.warn("wait for receipt failed", {
          txHash,
          message: e instanceof Error ? e.message : String(e),
        });
        // Fall through: backend polling may still succeed once the receipt
        // propagates. Post anyway and let the backend decide.
      }

      try {
        // 202 means the backend cannot see the receipt yet, which `res.ok`
        // reports as success: the player was told "linked" while nothing had
        // been linked. Retry a few times instead, then give up honestly.
        for (let attempt = 0; attempt < PENDING_RETRIES; attempt++) {
          const res = await fetch(`/api/link/redeem?chain=${chainKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, txHash }),
          });
          if (res.status === 202) {
            log.info("redeem pending, tx not visible yet", { txHash, attempt });
            await new Promise((r) => setTimeout(r, PENDING_DELAY_MS));
            continue;
          }
          if (res.ok) {
            track("wallet_linked", { linked_chain_id: chain.chain.id });
            setState("linked");
            return true;
          }
          log.warn("redeem POST failed", {
            status: res.status,
            txHash,
          });
          track("link_redeem_failed", {
            reason: "rejected",
            status: res.status,
          });
          setState("error");
          return false;
        }
        log.warn("redeem still pending after retries", { txHash });
        track("link_redeem_failed", { reason: "pending" });
        setState("error");
        return false;
      } catch (e) {
        log.warn("redeem POST threw", {
          txHash,
          message: e instanceof Error ? e.message : String(e),
        });
        track("link_redeem_failed", { reason: "threw" });
        setState("error");
        return false;
      }
    },
    // Individual balance fields are memoized in useBalances; listing them
    // keeps the callback stable (the whole `balances` object is re-created
    // every render).
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

  return { redeem, state };
}
